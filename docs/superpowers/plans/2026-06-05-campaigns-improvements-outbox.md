# Campaigns Improvements + Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the campaigns workspace in the nav, add inline triage + revision-diff to the existing approval flow, and build an Outbox — a durable per-deliverable dispatch record + operator-driven state machine layered on the existing launch handoff.

**Architecture:** Tier A is read-model + UI changes on data already stored (no schema). Tier B adds a `campaign_dispatches` table, a `src/lib/dispatch/` layer (read-model + persistence following the wired vault/campaigns shape), enqueue-on-launch wiring, server actions, and a `/outbox` page. All persistence is gated by `requireOperator()` + `isSupabaseAdminConfigured()` and degrades gracefully without Supabase. "Outbound stays locked": the app records and transitions state; it never sends.

**Tech Stack:** Next.js 16 (App Router, server components + `"use server"` actions, `proxy.ts` edge gate), React 19 (`useActionState`), Supabase (service-role admin client), Vitest, Tailwind (design tokens per `DESIGN.md`).

**Reference spec:** `docs/superpowers/specs/2026-06-05-campaigns-improvements-design.md`

---

## File Structure

**Tier A — modify:**
- `src/app/_data/growth-engine.ts` — add Campaigns nav entry.
- `src/app/_data/__tests__/growth-engine.test.ts` — **create**; assert nav entry.
- `src/lib/campaigns/read-model.ts` — add `pendingDeliverables` to list items; add `revision` to `CampaignWorkspaceAsset`; two pure helpers.
- `src/lib/campaigns/revision-diff.ts` — **create**; pure line-diff.
- `src/lib/campaigns/revision-diff.test.ts` — **create**.
- `src/lib/campaigns/__tests__/read-model.test.ts` — extend with helper tests.
- `src/app/campaigns/_components/campaign-triage-strip.tsx` — **create**; inline approve/decline.
- `src/app/campaigns/page.tsx` — mount the triage strip.
- `src/app/campaigns/_components/revision-diff.tsx` — **create**; diff UI.
- `src/app/campaigns/_components/creative-tab.tsx` — render `<RevisionDiff>` in the drawer.

**Tier B — create:**
- `supabase/migrations/20260605120000_campaign_dispatches.sql`
- `src/lib/dispatch/status.ts` (+ `status.test.ts`) — enum maps, ordering, grouping (pure).
- `src/lib/dispatch/read-model.ts` (+ `__tests__/read-model.test.ts`) — `getOutboxList`, `getCampaignDispatches`.
- `src/lib/dispatch/persistence.ts` (+ `persistence.test.ts`) — `enqueueDispatchesForAssets`, transitions.
- `src/app/outbox/page.tsx`, `src/app/outbox/actions.ts`, `src/app/outbox/_components/outbox-console.tsx`.
- `src/app/campaigns/_components/dispatch-panel.tsx` — per-campaign dispatch panel.

**Tier B — modify:**
- `src/lib/campaigns/launch.ts` — enqueue dispatch rows after unlock (launch + deploy).
- `src/lib/campaigns/launch.test.ts` — **create**; assert enqueue.
- `src/app/_data/growth-engine.ts` — add Outbox nav entry.
- `src/app/campaigns/_components/campaign-workspace.tsx` — render `<DispatchPanel>`.

---

# PHASE A — Tier A (no schema changes)

## Task A1: Add Campaigns to the nav

**Files:**
- Modify: `src/app/_data/growth-engine.ts:9-16`
- Test: `src/app/_data/__tests__/growth-engine.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/_data/__tests__/growth-engine.test.ts
import { describe, expect, it } from "vitest";

import { navItems } from "../growth-engine";

describe("navItems", () => {
  it("includes a Campaigns entry pointing at /campaigns", () => {
    const campaigns = navItems.find((item) => item.href === "/campaigns");
    expect(campaigns).toBeDefined();
    expect(campaigns?.label).toBe("Campaigns");
  });

  it("orders Campaigns immediately after Activity", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels.indexOf("Campaigns")).toBe(labels.indexOf("Activity") + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts`
Expected: FAIL — Campaigns entry not found.

- [ ] **Step 3: Add the nav entry**

Insert the Campaigns line after the Activity line. Use the `"approval"` icon's sibling — reuse an existing icon key already handled by `app-shell.tsx`. Verify the available keys first:

Run: `rg "case \"" src/app/_components/app-shell.tsx` (lists supported icon keys). Pick the closest existing key (e.g. `"approval"` or `"today"`); do **not** add a new icon asset. The example below uses `"approval"`.

```ts
export const navItems = [
  { label: "Today", href: "/", icon: "today" },
  { label: "Activity", href: "/approvals", icon: "approval" },
  { label: "Campaigns", href: "/campaigns", icon: "approval" },
  { label: "CRM", href: "/crm", icon: "crm" },
  { label: "Personas", href: "/persona-intelligence", icon: "persona" },
  { label: "Mark", href: "/agent-operations", icon: "agents" },
  { label: "Settings", href: "/settings", icon: "sliders" },
];
```

> If `app-shell.tsx` renders icons from a typed union and `"approval"` reuse looks wrong duplicated, add a dedicated `"campaign"` case to the icon switch using an existing inline SVG as a base. Keep it monochrome per `DESIGN.md` (no emojis).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add src/app/_data/growth-engine.ts src/app/_data/__tests__/growth-engine.test.ts
git commit -m "feat(nav): surface Campaigns in primary nav"
```

---

## Task A2: Pending-deliverables in the list read-model

The triage strip needs each campaign's still-in-review deliverables (asset id + title), which the list currently reduces to a count. Add a pure selector and surface it on the list item.

**Files:**
- Modify: `src/lib/campaigns/read-model.ts` (type `CampaignWorkspaceListItem` ~line 29; mapping ~line 428)
- Test: `src/lib/campaigns/__tests__/read-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/campaigns/__tests__/read-model.test.ts
import { selectPendingDeliverables } from "../read-model";

describe("selectPendingDeliverables", () => {
  const base = {
    id: "a1", title: "Welcome email", assetType: "Email", category: "virtual" as const,
    channel: "Email", body: "", preview: "", complianceNotes: "", dispatchLocked: true,
    toolSource: null, updatedAt: "Jun 1", media: [], revision: null,
  };

  it("returns only deliverables still awaiting a decision", () => {
    const pending = selectPendingDeliverables([
      { ...base, id: "a1", status: "Needs approval", approval: null },
      { ...base, id: "a2", status: "Approved", approval: { id: "x", status: "Approved" } },
      { ...base, id: "a3", status: "Draft", approval: { id: "y", status: "Pending owner approval" } },
    ]);
    expect(pending.map((d) => d.assetId)).toEqual(["a1", "a3"]);
    expect(pending[0]).toMatchObject({ assetId: "a1", title: "Welcome email", kind: "Email" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/__tests__/read-model.test.ts`
Expected: FAIL — `selectPendingDeliverables` is not exported.

- [ ] **Step 3: Implement the selector + surface the field**

Add the exported pure helper (reuses the existing private `assetDecisionState`):

```ts
// src/lib/campaigns/read-model.ts — export near buildLaunchState
export type PendingDeliverable = { assetId: string; title: string; kind: string };

/** Pure: the deliverables on a campaign still awaiting an operator decision,
 *  shaped for the inline triage strip. */
export function selectPendingDeliverables(assets: CampaignWorkspaceAsset[]): PendingDeliverable[] {
  return assets
    .filter((asset) => assetDecisionState(asset) === "pending")
    .map((asset) => ({ assetId: asset.id, title: asset.title, kind: asset.assetType }));
}
```

Add `pendingDeliverables: PendingDeliverable[];` to `CampaignWorkspaceListItem` (after `pendingCount`, line ~34). In the list mapping (line ~428) add:

```ts
        pendingCount: launch.pendingCount,
        pendingDeliverables: selectPendingDeliverables(campaignAssets),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/campaigns/__tests__/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/__tests__/read-model.test.ts
git commit -m "feat(campaigns): expose pending deliverables on list read-model"
```

---

## Task A3: Inline triage strip on /campaigns

**Files:**
- Create: `src/app/campaigns/_components/campaign-triage-strip.tsx`
- Modify: `src/app/campaigns/page.tsx`

- [ ] **Step 1: Create the triage strip component**

It reuses `decideAssetAction` (no new approval logic) and only renders campaigns that have pending deliverables. Skip if none.

```tsx
// src/app/campaigns/_components/campaign-triage-strip.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { decideAssetAction } from "../actions";

export function CampaignTriageStrip({ campaigns }: { campaigns: CampaignWorkspaceListItem[] }) {
  const needs = campaigns.filter((c) => c.pendingDeliverables.length > 0);
  if (needs.length === 0) return null;

  const total = needs.reduce((sum, c) => sum + c.pendingDeliverables.length, 0);

  return (
    <section
      aria-label="Needs your decision"
      className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3.5">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Needs your decision</span>
        <StatusPill tone="amber">{total} awaiting approval</StatusPill>
      </div>
      <ul className="divide-y divide-[var(--border-hairline)]">
        {needs.map((campaign) => (
          <li key={campaign.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={campaign.href} className="truncate text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)]">
                {campaign.name}
              </Link>
              <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {campaign.pendingDeliverables.map((deliverable) => (
                <TriageRow
                  key={deliverable.assetId}
                  campaignId={campaign.id}
                  assetId={deliverable.assetId}
                  title={deliverable.title}
                  kind={deliverable.kind}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TriageRow({ campaignId, assetId, title, kind }: { campaignId: string; assetId: string; title: string; kind: string }) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="ml-2 text-xs font-semibold text-[var(--text-muted)]">{kind}</span>
      </span>
      <form action={formAction} className="flex items-center gap-1.5">
        <input type="hidden" name="assetId" value={assetId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <Button type="submit" name="decision" value="approved" variant="approve" size="sm" disabled={isPending}>
          {isPending ? "…" : "Approve"}
        </Button>
        <Button type="submit" name="decision" value="declined" variant="ghost" size="sm" disabled={isPending}>
          Decline
        </Button>
      </form>
      {state && !state.ok ? <span className="w-full text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </li>
  );
}
```

> Verify `Button` forwards `name`/`value` to the underlying `<button>` (check `src/app/_components/page-header.tsx`). If it does not, replace `<Button name=… value=…>` with a native `<button type="submit" name="decision" value="approved" className={buttonClasses({ variant: "approve", size: "sm" })}>` as used in `creative-tab.tsx`'s `RemoveButton`.

- [ ] **Step 2: Mount it in the list page**

In `src/app/campaigns/page.tsx`, import the strip and render it between the header and the gallery (inside the `campaigns.length > 0` branch):

```tsx
import { CampaignTriageStrip } from "./_components/campaign-triage-strip";
// ...
      <CampaignCommandHeader pendingCount={pendingCount} />

      {campaigns.length > 0 ? (
        <>
          <CampaignTriageStrip campaigns={campaigns} />
          <CampaignGallery
            campaigns={campaigns}
            page={parsePositiveInt(getParam(params.page), 1)}
            pageSize={parsePageSize(getParam(params.pageSize))}
            persona={getParam(params.persona) || "All"}
            query={getParam(params.q)}
            status={getParam(params.status) || "All"}
            sort={getParam(params.sort) || "recent"}
            view={getParam(params.view) || "cards"}
          />
        </>
      ) : (
```

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint` then `pnpm build`
Expected: no type errors; `CampaignWorkspaceListItem.pendingDeliverables` resolves.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/campaign-triage-strip.tsx src/app/campaigns/page.tsx
git commit -m "feat(campaigns): inline triage strip for pending decisions"
```

---

## Task A4: Revision diff — read-model field + pure diff

**Files:**
- Create: `src/lib/campaigns/revision-diff.ts`, `src/lib/campaigns/revision-diff.test.ts`
- Modify: `src/lib/campaigns/read-model.ts` (`CampaignWorkspaceAsset` ~line 68; `mapAsset` ~line 733)

- [ ] **Step 1: Write the failing diff test**

```ts
// src/lib/campaigns/revision-diff.test.ts
import { describe, expect, it } from "vitest";

import { diffLines } from "./revision-diff";

describe("diffLines", () => {
  it("marks added, removed, and unchanged lines", () => {
    const result = diffLines("Hello\nold line\nFooter", "Hello\nnew line\nFooter");
    expect(result).toEqual([
      { kind: "same", text: "Hello" },
      { kind: "removed", text: "old line" },
      { kind: "added", text: "new line" },
      { kind: "same", text: "Footer" },
    ]);
  });

  it("returns all-same when identical", () => {
    expect(diffLines("a\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/revision-diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the diff (LCS-based line diff)**

```ts
// src/lib/campaigns/revision-diff.ts
export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Pure line-level diff via longest-common-subsequence. Removed (before) lines
 *  precede added (after) lines at each divergence. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of LCS of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      out.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/campaigns/revision-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Surface `revision` on the asset view**

Add to `CampaignWorkspaceAsset` (after `media`, line ~81):

```ts
  /** Original draft vs current text, present only when Mark revised the piece.
   *  Drives the "What changed" diff in the review drawer. */
  revision: { draft: string; current: string } | null;
```

In `mapAsset` (line ~733), compute it from the raw bodies already selected:

```ts
function mapAsset(asset: CampaignAssetRow): CampaignWorkspaceAsset {
  const rawBody = asset.approved_body ?? asset.edited_body ?? asset.draft_body ?? "";
  const readableBody = buildReadablePreview(rawBody, asset.prompt_inputs, asset.reasoning_payload);
  const media = collectMediaFromAsset(asset);
  const current = asset.approved_body ?? asset.edited_body ?? "";
  const draft = asset.draft_body ?? "";
  const revision = draft && current && draft.trim() !== current.trim() ? { draft, current } : null;
  return {
    id: asset.id,
    title: asset.title,
    assetType: humanize(asset.asset_type),
    category: classifyAssetCategory(asset),
    channel: humanize(asset.channel ?? asset.asset_type),
    status: statusLabel(asset.status),
    body: readableBody === EMPTY_READABLE_PREVIEW ? rawBody : readableBody,
    preview: readableBody,
    complianceNotes: asset.compliance_notes ?? "No asset-level compliance notes captured.",
    dispatchLocked: asset.dispatch_locked,
    toolSource: getString(asset.tool_source),
    updatedAt: formatDate(asset.updated_at),
    media,
    revision,
    approval: null,
  };
}
```

Also add `revision: null` to the two synthesized-asset mappers so the type stays satisfied: `mapOutputAsAsset` (~line 823) and `mapApprovalAsAsset` (~line 847) — add `revision: null,` next to their `approval:` field.

- [ ] **Step 6: Run the full campaigns suite**

Run: `pnpm test src/lib/campaigns`
Expected: PASS (existing read-model tests still green; new field is additive).

- [ ] **Step 7: Commit**

```bash
git add src/lib/campaigns/revision-diff.ts src/lib/campaigns/revision-diff.test.ts src/lib/campaigns/read-model.ts
git commit -m "feat(campaigns): surface draft-vs-current revision on asset view"
```

---

## Task A5: Revision diff UI in the review drawer

**Files:**
- Create: `src/app/campaigns/_components/revision-diff.tsx`
- Modify: `src/app/campaigns/_components/creative-tab.tsx` (drawer body, after `AssetRecordPreview`, ~line 497)

- [ ] **Step 1: Create the diff component**

```tsx
// src/app/campaigns/_components/revision-diff.tsx
"use client";

import { useState } from "react";

import { diffLines } from "@/lib/campaigns/revision-diff";

export function RevisionDiff({ draft, current }: { draft: string; current: string }) {
  const [open, setOpen] = useState(false);
  const lines = diffLines(draft, current);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">What changed</span>
        <span className="font-mono text-xs font-bold tabular-nums">
          <span className="text-[var(--ok)]">+{added}</span> <span className="text-[var(--priority-bright)]">−{removed}</span>
          <span className="ml-2 text-[var(--text-muted)]">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? (
        <pre className="max-h-[40vh] overflow-auto border-t border-[var(--border-hairline)] px-3 py-2 text-xs leading-5">
          {lines.map((line, index) => (
            <div
              key={index}
              className={
                line.kind === "added"
                  ? "bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
                  : line.kind === "removed"
                    ? "bg-[oklch(0.68_0.2_26/0.12)] text-[oklch(0.86_0.09_26)] line-through decoration-[oklch(0.68_0.2_26/0.5)]"
                    : "text-[var(--text-secondary)]"
              }
            >
              <span aria-hidden className="mr-2 select-none text-[var(--text-muted)]">
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
              </span>
              {line.text || " "}
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the drawer**

In `creative-tab.tsx`, import it and add — inside `ReviewDrawer`'s scroll body, immediately after the `Full draft` block (after the closing `</div>` at ~line 497, before the media block):

```tsx
import { RevisionDiff } from "./revision-diff";
// ...
          {asset.revision ? <RevisionDiff draft={asset.revision.draft} current={asset.revision.current} /> : null}
```

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/revision-diff.tsx src/app/campaigns/_components/creative-tab.tsx
git commit -m "feat(campaigns): show draft-vs-current diff in review drawer"
```

> **Phase A is independently shippable.** Consider opening a PR here before starting Phase B.

---

# PHASE B — Tier B (Outbox subsystem)

## Task B1: Migration — `campaign_dispatches` + enums

**Files:**
- Create: `supabase/migrations/20260605120000_campaign_dispatches.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Outbox: one durable dispatch record per launched deliverable, plus the
-- operator-driven status it moves through. The app records state and hands off;
-- it never sends. Outbound stays locked.

create type public.campaign_dispatch_status as enum (
  'queued',
  'scheduled',
  'sent',
  'delivered',
  'failed',
  'canceled'
);

-- Dispatch lifecycle events on the existing campaign audit enum.
alter type public.campaign_event_type add value if not exists 'dispatch_queued';
alter type public.campaign_event_type add value if not exists 'dispatch_sent';
alter type public.campaign_event_type add value if not exists 'dispatch_delivered';
alter type public.campaign_event_type add value if not exists 'dispatch_failed';
alter type public.campaign_event_type add value if not exists 'dispatch_canceled';

create table public.campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  channel text,
  status public.campaign_dispatch_status not null default 'queued',
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  recipient_summary text,
  audience_count integer check (audience_count is null or audience_count >= 0),
  result_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaign_dispatches_campaign_idx on public.campaign_dispatches (campaign_id);
create index campaign_dispatches_status_idx on public.campaign_dispatches (status);
```

> Mirror the data-API role grants used by sibling tables in `supabase/migrations/20260529133000_data_api_role_grants.sql` **only if** the data-API role must read this table. The operator UI uses the service-role admin client, which bypasses RLS — no extra grant needed for the UI to work. Check that file and append matching `grant` statements only if its pattern covers all campaign tables.

- [ ] **Step 2: Apply locally if a DB is available**

Run (if using the Supabase CLI locally): `supabase db reset` or apply the single migration per the project's normal flow. If no local DB, the app still runs — persistence is guarded by `isSupabaseAdminConfigured()`. Note in the commit that the migration is unverified-against-DB if so.

> **Enum caveat:** Postgres cannot use a value added to an enum by `alter type ... add value` in the **same transaction**. These new `campaign_event_type` values are only referenced by later inserts (separate transactions), so this is safe. Do not reference them in this migration file.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260605120000_campaign_dispatches.sql
git commit -m "feat(outbox): campaign_dispatches table + dispatch event types"
```

---

## Task B2: Dispatch status helpers (pure) + view types

**Files:**
- Create: `src/lib/dispatch/status.ts`, `src/lib/dispatch/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dispatch/status.test.ts
import { describe, expect, it } from "vitest";

import { DISPATCH_STATUS_ORDER, groupByStatus, statusLabel, type DispatchView } from "./status";

function view(id: string, status: DispatchView["status"]): DispatchView {
  return {
    id, campaignId: "c1", campaignName: "Spring push", assetId: "a1",
    deliverable: "Welcome email", channel: "Email", status,
    scheduledFor: null, dispatchedAt: null, recipientSummary: "12 leads",
    audienceCount: 12, resultNote: null, updatedAt: "Jun 5",
  };
}

describe("dispatch status helpers", () => {
  it("labels statuses for display", () => {
    expect(statusLabel("queued")).toBe("Queued");
    expect(statusLabel("delivered")).toBe("Delivered");
  });

  it("groups dispatches by status in lifecycle order", () => {
    const groups = groupByStatus([view("1", "sent"), view("2", "queued"), view("3", "queued")]);
    expect(groups.map((g) => g.status)).toEqual(DISPATCH_STATUS_ORDER);
    expect(groups.find((g) => g.status === "queued")?.items.map((i) => i.id)).toEqual(["2", "3"]);
    expect(groups.find((g) => g.status === "sent")?.items).toHaveLength(1);
    expect(groups.find((g) => g.status === "delivered")?.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/dispatch/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/dispatch/status.ts
export type DispatchStatus = "queued" | "scheduled" | "sent" | "delivered" | "failed" | "canceled";

export const DISPATCH_STATUS_ORDER: DispatchStatus[] = ["queued", "scheduled", "sent", "delivered", "failed", "canceled"];

const LABELS: Record<DispatchStatus, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  canceled: "Canceled",
};

export function statusLabel(status: DispatchStatus): string {
  return LABELS[status];
}

export const STATUS_TONE: Record<DispatchStatus, "amber" | "blue" | "green" | "red" | "gray"> = {
  queued: "amber",
  scheduled: "blue",
  sent: "blue",
  delivered: "green",
  failed: "red",
  canceled: "gray",
};

export type DispatchView = {
  id: string;
  campaignId: string;
  campaignName: string;
  assetId: string | null;
  deliverable: string;
  channel: string;
  status: DispatchStatus;
  scheduledFor: string | null;
  dispatchedAt: string | null;
  recipientSummary: string | null;
  audienceCount: number | null;
  resultNote: string | null;
  updatedAt: string;
};

export type DispatchGroup = { status: DispatchStatus; items: DispatchView[] };

/** Pure: bucket dispatches into lifecycle-ordered groups (empty groups kept so
 *  the console always shows every column). */
export function groupByStatus(dispatches: DispatchView[]): DispatchGroup[] {
  return DISPATCH_STATUS_ORDER.map((status) => ({
    status,
    items: dispatches.filter((dispatch) => dispatch.status === status),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/dispatch/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/status.ts src/lib/dispatch/status.test.ts
git commit -m "feat(outbox): dispatch status types, labels, grouping"
```

---

## Task B3: Dispatch read-model

**Files:**
- Create: `src/lib/dispatch/read-model.ts`, `src/lib/dispatch/__tests__/read-model.test.ts`

- [ ] **Step 1: Write the failing test (pure row mapper)**

```ts
// src/lib/dispatch/__tests__/read-model.test.ts
import { describe, expect, it } from "vitest";

import { rowToDispatchView, type DispatchRow } from "../read-model";

const row: DispatchRow = {
  id: "d1", campaign_id: "c1", campaign_asset_id: "a1", channel: "email",
  status: "queued", scheduled_for: null, dispatched_at: null,
  recipient_summary: "Atlas + 11 leads", audience_count: 12, result_note: null,
  updated_at: "2026-06-05T12:00:00Z",
};

describe("rowToDispatchView", () => {
  it("maps a row to a view, resolving the campaign + deliverable names", () => {
    const view = rowToDispatchView(row, { campaignName: "Spring push", deliverable: "Welcome email" });
    expect(view).toMatchObject({
      id: "d1", campaignId: "c1", campaignName: "Spring push",
      deliverable: "Welcome email", channel: "Email", status: "queued",
      recipientSummary: "Atlas + 11 leads", audienceCount: 12,
    });
  });

  it("falls back to a generic deliverable label when none is resolved", () => {
    const view = rowToDispatchView(row, { campaignName: "Spring push", deliverable: null });
    expect(view.deliverable).toBe("Deliverable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/dispatch/__tests__/read-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement read-model**

```ts
// src/lib/dispatch/read-model.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import { type DispatchStatus, type DispatchView } from "./status";

export type DispatchRow = {
  id: string;
  campaign_id: string;
  campaign_asset_id: string | null;
  channel: string | null;
  status: DispatchStatus;
  scheduled_for: string | null;
  dispatched_at: string | null;
  recipient_summary: string | null;
  audience_count: number | null;
  result_note: string | null;
  updated_at: string;
};

const SELECT =
  "id,campaign_id,campaign_asset_id,channel,status,scheduled_for,dispatched_at,recipient_summary,audience_count,result_note,updated_at";

function humanizeChannel(channel: string | null): string {
  if (!channel) return "Unknown channel";
  return channel.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Pure: map a dispatch row + resolved names into a display view. */
export function rowToDispatchView(
  row: DispatchRow,
  names: { campaignName: string; deliverable: string | null },
): DispatchView {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: names.campaignName,
    assetId: row.campaign_asset_id,
    deliverable: names.deliverable ?? "Deliverable",
    channel: humanizeChannel(row.channel),
    status: row.status,
    scheduledFor: formatDate(row.scheduled_for),
    dispatchedAt: formatDate(row.dispatched_at),
    recipientSummary: row.recipient_summary,
    audienceCount: row.audience_count,
    resultNote: row.result_note,
    updatedAt: formatDate(row.updated_at) ?? "—",
  };
}

export type OutboxList =
  | { status: "live"; dispatches: DispatchView[] }
  | { status: "unavailable"; message: string };

async function loadViews(supabase: SupabaseClient, filter?: { campaignId: string }): Promise<DispatchView[]> {
  let dispatchQuery = supabase.from("campaign_dispatches").select(SELECT).order("updated_at", { ascending: false }).limit(500);
  if (filter) dispatchQuery = dispatchQuery.eq("campaign_id", filter.campaignId);
  const { data: dispatchData, error: dispatchError } = await dispatchQuery;
  if (dispatchError) throw new Error(`campaign_dispatches: ${dispatchError.message}`);
  const rows = (dispatchData ?? []) as DispatchRow[];
  if (rows.length === 0) return [];

  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  const assetIds = [...new Set(rows.map((r) => r.campaign_asset_id).filter((id): id is string => Boolean(id)))];

  const { data: campaignData } = await supabase.from("campaigns").select("id,name").in("id", campaignIds);
  const { data: assetData } = assetIds.length
    ? await supabase.from("campaign_assets").select("id,title").in("id", assetIds)
    : { data: [] as Array<{ id: string; title: string }> };

  const campaignName = new Map((campaignData ?? []).map((c) => [c.id as string, c.name as string]));
  const deliverable = new Map((assetData ?? []).map((a) => [a.id as string, a.title as string]));

  return rows.map((row) =>
    rowToDispatchView(row, {
      campaignName: campaignName.get(row.campaign_id) ?? "Campaign",
      deliverable: row.campaign_asset_id ? deliverable.get(row.campaign_asset_id) ?? null : null,
    }),
  );
}

/** Cross-campaign outbox list. */
export async function getOutboxList(client?: SupabaseClient): Promise<OutboxList> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }
  try {
    const supabase = client ?? getSupabaseAdminClient();
    return { status: "live", dispatches: await loadViews(supabase) };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Outbox is unavailable." };
  }
}

/** Dispatches for a single campaign (detail panel). Returns [] when unconfigured. */
export async function getCampaignDispatches(campaignId: string, client?: SupabaseClient): Promise<DispatchView[]> {
  if (!client && !isSupabaseAdminConfigured()) return [];
  const supabase = client ?? getSupabaseAdminClient();
  try {
    return await loadViews(supabase, { campaignId });
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/dispatch/__tests__/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/read-model.ts src/lib/dispatch/__tests__/read-model.test.ts
git commit -m "feat(outbox): dispatch read-model (outbox list + per-campaign)"
```

---

## Task B4: Dispatch persistence — enqueue + transitions

**Files:**
- Create: `src/lib/dispatch/persistence.ts`, `src/lib/dispatch/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dispatch/persistence.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { enqueueDispatchesForAssets, transitionDispatch } from "./persistence";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("enqueueDispatchesForAssets", () => {
  it("inserts one queued dispatch per asset with channel + event", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_assets: { data: [{ id: "a1", channel: "email", title: "Welcome" }], error: null },
      campaign_dispatches: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });

    await enqueueDispatchesForAssets({ campaignId: "c1", assetIds: ["a1"], operator: "Operator" }, supabase);

    const inserts = findCalls(supabase, "insert");
    expect(inserts).toContainEqual(
      expect.objectContaining({ campaign_id: "c1", campaign_asset_id: "a1", status: "queued", channel: "email" }),
    );
    expect(inserts).toContainEqual(expect.objectContaining({ event_type: "dispatch_queued" }));
  });

  it("does nothing for an empty asset list", async () => {
    const supabase = createSupabaseQueryMock({ campaign_dispatches: { data: null, error: null } });
    await enqueueDispatchesForAssets({ campaignId: "c1", assetIds: [], operator: "Operator" }, supabase);
    expect(findCalls(supabase, "insert")).toHaveLength(0);
  });
});

describe("transitionDispatch", () => {
  it("marks a dispatch sent, stamps dispatched_at, and logs an event", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: { id: "d1", campaign_id: "c1", status: "queued" }, error: null },
      campaign_events: { data: null, error: null },
    });

    await transitionDispatch({ dispatchId: "d1", to: "sent", operator: "Operator" }, supabase);

    const updates = findCalls(supabase, "update");
    expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
    expect(updates.some((u) => "dispatched_at" in u)).toBe(true);
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ event_type: "dispatch_sent" }));
  });

  it("rejects an unknown target status", async () => {
    const supabase = createSupabaseQueryMock({ campaign_dispatches: { data: { id: "d1", campaign_id: "c1", status: "queued" }, error: null } });
    await expect(
      transitionDispatch({ dispatchId: "d1", to: "bogus" as never, operator: "Operator" }, supabase),
    ).rejects.toThrow(/status/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/dispatch/persistence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement persistence**

```ts
// src/lib/dispatch/persistence.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { DISPATCH_STATUS_ORDER, type DispatchStatus } from "./status";

const EVENT_FOR_STATUS: Partial<Record<DispatchStatus, string>> = {
  queued: "dispatch_queued",
  sent: "dispatch_sent",
  delivered: "dispatch_delivered",
  failed: "dispatch_failed",
  canceled: "dispatch_canceled",
};

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export type EnqueueInput = { campaignId: string; assetIds: string[]; operator: string };

/** Insert one queued dispatch per approved asset. Called from the launch flow
 *  after assets are unlocked. No-op for an empty list. */
export async function enqueueDispatchesForAssets(input: EnqueueInput, client: SupabaseClient): Promise<void> {
  const { campaignId, assetIds, operator } = input;
  if (assetIds.length === 0) return;

  const { data: assetRows, error: assetError } = await client
    .from("campaign_assets")
    .select("id,channel,title")
    .in("id", assetIds);
  assertOk("campaign_assets lookup", assetError);
  const assets = (assetRows ?? []) as Array<{ id: string; channel: string | null; title: string }>;

  for (const asset of assets) {
    const { error: insertError } = await client.from("campaign_dispatches").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      channel: asset.channel,
      status: "queued",
      payload: { source: "campaign_launch", deliverable: asset.title },
    });
    assertOk("campaign_dispatches insert", insertError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: campaignId,
      campaign_asset_id: asset.id,
      event_type: "dispatch_queued",
      actor: operator,
      detail: `Queued "${asset.title}" for dispatch.`,
      payload: { channel: asset.channel },
    });
    assertOk("campaign_events insert", eventError);
  }
}

export type TransitionInput = {
  dispatchId: string;
  to: DispatchStatus;
  operator: string;
  note?: string;
  scheduledFor?: string;
};

/** Move a dispatch to a new status, stamping timestamps and logging an event.
 *  Operator-driven — the app never performs a real send. */
export async function transitionDispatch(input: TransitionInput, client: SupabaseClient): Promise<void> {
  const { dispatchId, to, operator, note, scheduledFor } = input;
  if (!DISPATCH_STATUS_ORDER.includes(to)) {
    throw new Error(`Unknown dispatch status: ${to}`);
  }

  const { data: existing, error: lookupError } = await client
    .from("campaign_dispatches")
    .select("id,campaign_id,status")
    .eq("id", dispatchId)
    .maybeSingle<{ id: string; campaign_id: string; status: string }>();
  assertOk("campaign_dispatches lookup", lookupError);
  if (!existing) throw new Error("Dispatch not found.");

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === "sent" || to === "delivered") patch.dispatched_at = new Date().toISOString();
  if (to === "scheduled" && scheduledFor) patch.scheduled_for = scheduledFor;
  if (note) patch.result_note = note;

  const { error: updateError } = await client.from("campaign_dispatches").update(patch).eq("id", dispatchId);
  assertOk("campaign_dispatches update", updateError);

  const eventType = EVENT_FOR_STATUS[to];
  if (eventType) {
    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: existing.campaign_id,
      event_type: eventType,
      actor: operator,
      detail: note ?? `Dispatch marked ${to} by ${operator}.`,
      payload: { dispatch_id: dispatchId, from: existing.status, to },
    });
    assertOk("campaign_events insert", eventError);
  }
}
```

> `new Date().toISOString()` is fine in app/runtime code (the Date restriction applies only to Workflow scripts). The tests assert presence of `dispatched_at`, not its value.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/dispatch/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/persistence.ts src/lib/dispatch/persistence.test.ts
git commit -m "feat(outbox): dispatch enqueue + status transitions"
```

---

## Task B5: Enqueue on launch + deploy

**Files:**
- Modify: `src/lib/campaigns/launch.ts` (`launchCampaign` after unlock ~line 90; `deployAsset` after its unlock)
- Create: `src/lib/campaigns/launch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/campaigns/launch.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { launchCampaign } from "./launch";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("launchCampaign enqueues dispatches", () => {
  it("inserts a campaign_dispatches row for each approved asset", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "c1", launch_locked: true, status: "review" }, error: null },
      campaign_assets: { data: [{ id: "a1", channel: "email", title: "Welcome" }], error: null },
      approval_items: { data: [{ id: "ap1", status: "approved", campaign_asset_id: "a1" }], error: null },
      campaign_dispatches: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });

    await launchCampaign({ campaignId: "c1", operator: "Operator" }, supabase);

    const inserts = findCalls(supabase, "insert");
    expect(inserts).toContainEqual(
      expect.objectContaining({ campaign_id: "c1", campaign_asset_id: "a1", status: "queued" }),
    );
  });
});
```

> If `createSupabaseQueryMock` returns the same `data` for every `.select()` on a table regardless of filter, the `campaign_assets` lookup inside `enqueueDispatchesForAssets` will receive the same `[{id:"a1",...}]` — which is what the assertion expects. If the existing launch tests reveal a different mock shape, mirror those.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/launch.test.ts`
Expected: FAIL — no `campaign_dispatches` insert yet.

- [ ] **Step 3: Wire the enqueue call**

In `launch.ts`, import the helper at the top:

```ts
import { enqueueDispatchesForAssets } from "@/lib/dispatch/persistence";
```

In `launchCampaign`, after the campaign is marked live (after the `campaigns launch update` block, before the `campaign_events` launch insert near line ~108), add:

```ts
  // Open the Outbox: one queued dispatch per approved deliverable.
  await enqueueDispatchesForAssets({ campaignId, assetIds: approvedAssetIds, operator }, client);
```

In `deployAsset` (single-asset path), after that asset is unlocked, add:

```ts
  await enqueueDispatchesForAssets({ campaignId, assetIds: [assetId], operator }, client);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/campaigns/launch.test.ts`
Expected: PASS.
Run: `pnpm test src/lib/dispatch src/lib/campaigns`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/launch.ts src/lib/campaigns/launch.test.ts
git commit -m "feat(outbox): enqueue dispatches when a campaign launches or a piece deploys"
```

---

## Task B6: Outbox actions

**Files:**
- Create: `src/app/outbox/actions.ts`

- [ ] **Step 1: Create the actions (modeled on `campaigns/actions.ts`)**

```ts
// src/app/outbox/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { transitionDispatch } from "@/lib/dispatch/persistence";
import { type DispatchStatus } from "@/lib/dispatch/status";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type DispatchActionState = { ok: boolean; message: string } | null;

const SUCCESS: Partial<Record<DispatchStatus, string>> = {
  sent: "Marked sent.",
  delivered: "Marked delivered.",
  failed: "Marked failed — left in the Outbox for follow-up.",
  canceled: "Dispatch canceled.",
  scheduled: "Scheduled.",
};

async function runTransition(formData: FormData, to: DispatchStatus): Promise<DispatchActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the Outbox can't update." };
  }

  const dispatchId = String(formData.get("dispatchId") ?? "").trim();
  if (!dispatchId) return { ok: false, message: "Missing dispatch." };

  const note = String(formData.get("note") ?? "").trim() || undefined;
  const scheduledFor = String(formData.get("scheduledFor") ?? "").trim() || undefined;

  try {
    await transitionDispatch({ dispatchId, to, operator: getOperatorActor(), note, scheduledFor }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the dispatch." };
  }

  revalidatePath("/outbox");
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);

  return { ok: true, message: SUCCESS[to] ?? "Updated." };
}

export async function markDispatchSentAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "sent");
}
export async function markDispatchDeliveredAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "delivered");
}
export async function markDispatchFailedAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "failed");
}
export async function cancelDispatchAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "canceled");
}
export async function scheduleDispatchAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "scheduled");
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: clean (no unused exports flagged; all are consumed in B7).

- [ ] **Step 3: Commit**

```bash
git add src/app/outbox/actions.ts
git commit -m "feat(outbox): operator actions to transition dispatch status"
```

---

## Task B7: Outbox page + nav entry + console UI

**Files:**
- Create: `src/app/outbox/page.tsx`, `src/app/outbox/_components/outbox-console.tsx`
- Modify: `src/app/_data/growth-engine.ts` (nav), `src/app/_data/__tests__/growth-engine.test.ts`

- [ ] **Step 1: Add the nav test + entry**

Append to `src/app/_data/__tests__/growth-engine.test.ts`:

```ts
  it("includes an Outbox entry pointing at /outbox", () => {
    const outbox = navItems.find((item) => item.href === "/outbox");
    expect(outbox?.label).toBe("Outbox");
  });
```

Add to `navItems` after the Campaigns entry:

```ts
  { label: "Outbox", href: "/outbox", icon: "approval" },
```

Run: `pnpm test src/app/_data/__tests__/growth-engine.test.ts` → PASS.

- [ ] **Step 2: Create the console component**

```tsx
// src/app/outbox/_components/outbox-console.tsx
"use client";

import { useActionState } from "react";

import { Button, StatusPill } from "@/app/_components/page-header";
import { groupByStatus, statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

import {
  cancelDispatchAction,
  markDispatchDeliveredAction,
  markDispatchFailedAction,
  markDispatchSentAction,
  type DispatchActionState,
} from "../actions";

export function OutboxConsole({ dispatches }: { dispatches: DispatchView[] }) {
  const groups = groupByStatus(dispatches).filter((group) => group.items.length > 0);

  if (dispatches.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        Nothing queued yet. When you launch a campaign, each approved deliverable lands here as a queued dispatch. The app records
        and hands off — it never sends.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section
          key={group.status}
          className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
            <StatusPill tone={STATUS_TONE[group.status]}>{statusLabel(group.status)}</StatusPill>
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-muted)]">{group.items.length}</span>
          </div>
          <ul className="divide-y divide-[var(--border-hairline)]">
            {group.items.map((dispatch) => (
              <DispatchRow key={dispatch.id} dispatch={dispatch} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DispatchRow({ dispatch }: { dispatch: DispatchView }) {
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-[var(--text-primary)]">{dispatch.deliverable}</div>
        <div className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">
          {dispatch.campaignName} · {dispatch.channel}
          {dispatch.recipientSummary ? ` · ${dispatch.recipientSummary}` : ""}
          {dispatch.dispatchedAt ? ` · sent ${dispatch.dispatchedAt}` : ""}
        </div>
        {dispatch.resultNote ? <div className="mt-1 text-xs text-[var(--text-secondary)]">{dispatch.resultNote}</div> : null}
      </div>
      <DispatchControls dispatch={dispatch} />
    </li>
  );
}

function DispatchControls({ dispatch }: { dispatch: DispatchView }) {
  if (dispatch.status === "delivered" || dispatch.status === "canceled") {
    return <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">No actions</span>;
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {dispatch.status === "queued" || dispatch.status === "scheduled" ? (
        <TransitionButton action={markDispatchSentAction} dispatch={dispatch} label="Mark sent" variant="primary" />
      ) : null}
      {dispatch.status === "sent" ? (
        <>
          <TransitionButton action={markDispatchDeliveredAction} dispatch={dispatch} label="Delivered" variant="approve" />
          <TransitionButton action={markDispatchFailedAction} dispatch={dispatch} label="Failed" variant="priority" />
        </>
      ) : null}
      {dispatch.status !== "failed" ? (
        <TransitionButton action={cancelDispatchAction} dispatch={dispatch} label="Cancel" variant="ghost" />
      ) : (
        <TransitionButton action={markDispatchSentAction} dispatch={dispatch} label="Retry → sent" variant="ghost" />
      )}
    </div>
  );
}

function TransitionButton({
  action,
  dispatch,
  label,
  variant,
}: {
  action: (prev: DispatchActionState, formData: FormData) => Promise<DispatchActionState>;
  dispatch: DispatchView;
  label: string;
  variant: "primary" | "approve" | "priority" | "ghost";
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="dispatchId" value={dispatch.id} />
      <input type="hidden" name="campaignId" value={dispatch.campaignId} />
      <Button type="submit" variant={variant} size="sm" disabled={isPending}>
        {isPending ? "…" : label}
      </Button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}
```

> Confirm `Button`'s `variant` union includes `"approve" | "priority" | "primary" | "ghost"` (it does per `creative-tab.tsx` usage). If `STATUS_TONE` tones don't match `StatusPill`'s accepted tones, map them in `status.ts`.

- [ ] **Step 3: Create the page**

```tsx
// src/app/outbox/page.tsx
import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { getOutboxList } from "@/lib/dispatch/read-model";

import { OutboxConsole } from "./_components/outbox-console";

export default async function OutboxPage() {
  await connection();

  const list = await getOutboxList();

  return (
    <>
      <PageHeader
        eyebrow="Dispatch"
        title="Outbox"
        description="Every approved deliverable that has been launched, and where it stands. The app records dispatch state and hands off to Mark — it does not send, publish, or contact anyone."
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      />
      {list.status === "unavailable" ? (
        <EmptyState title="Outbox unavailable" detail={list.message} />
      ) : (
        <OutboxConsole dispatches={list.dispatches} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean; `/outbox` compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/outbox src/app/_data/growth-engine.ts src/app/_data/__tests__/growth-engine.test.ts
git commit -m "feat(outbox): /outbox dispatch console + nav entry"
```

---

## Task B8: Per-campaign dispatch panel on the detail view

**Files:**
- Create: `src/app/campaigns/_components/dispatch-panel.tsx`
- Modify: `src/app/campaigns/[campaignId]/page.tsx` (fetch dispatches), `src/app/campaigns/_components/campaign-workspace.tsx` (render panel)

- [ ] **Step 1: Create the panel (server-friendly, read-only summary)**

```tsx
// src/app/campaigns/_components/dispatch-panel.tsx
import { StatusPill } from "@/app/_components/page-header";
import { statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

export function DispatchPanel({ dispatches }: { dispatches: DispatchView[] }) {
  if (dispatches.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Dispatch</span>
        <a href="/outbox" className="text-xs font-semibold text-[var(--accent)] hover:underline">Open Outbox</a>
      </div>
      <ul className="space-y-1.5">
        {dispatches.map((dispatch) => (
          <li key={dispatch.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{dispatch.deliverable}</span>
            <StatusPill tone={STATUS_TONE[dispatch.status]}>{statusLabel(dispatch.status)}</StatusPill>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Fetch dispatches in the detail page and pass through**

In `src/app/campaigns/[campaignId]/page.tsx`, alongside the existing `getCampaignWorkspaceDetail` call, fetch dispatches and pass them into the workspace. Locate where `CampaignWorkspace` is rendered and add a `dispatches` prop:

```tsx
import { getCampaignDispatches } from "@/lib/dispatch/read-model";
// ... inside the component, after resolving campaignId:
const [detail, dispatches] = await Promise.all([
  getCampaignWorkspaceDetail(campaignId),
  getCampaignDispatches(campaignId),
]);
// ... pass dispatches into <CampaignWorkspace ... dispatches={dispatches} />
```

> Read the current `[campaignId]/page.tsx` first to match its exact data-loading shape (it may already destructure a single `detail`). Keep the existing not-found / unavailable handling unchanged.

- [ ] **Step 3: Render the panel in the workspace**

In `campaign-workspace.tsx`, add `dispatches` to the component props (type `DispatchView[]`, import from `@/lib/dispatch/status`) and render `<DispatchPanel dispatches={dispatches} />` near `CampaignOverview` (around line 104). Default to `[]` so existing callers/tests don't break:

```tsx
import { type DispatchView } from "@/lib/dispatch/status";
import { DispatchPanel } from "./dispatch-panel";
// in props: dispatches = [] as DispatchView[]
// in JSX, after <CampaignOverview .../>:
<DispatchPanel dispatches={dispatches} />
```

- [ ] **Step 4: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/dispatch-panel.tsx src/app/campaigns/[campaignId]/page.tsx src/app/campaigns/_components/campaign-workspace.tsx
git commit -m "feat(outbox): per-campaign dispatch panel on detail view"
```

---

## Task B9: Full verification pass

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: all green, including new `dispatch` and `campaigns` tests.

- [ ] **Step 2: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: clean.

- [ ] **Step 3: Manual smoke (if Supabase + seed available)**

Run: `pnpm seed:test-campaign`, then `pnpm dev`. Approve a deliverable from the `/campaigns` triage strip; launch a campaign; confirm rows appear on `/outbox`; transition one to Sent → Delivered; confirm the campaign detail Dispatch panel reflects status and the Audit tab shows `dispatch_*` events.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore(outbox): verification fixups"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** A1 nav ✓ (Task A1, B7 adds Outbox nav); A2 triage strip ✓ (A2 read-model + A3 UI); A3 revision diff ✓ (A4 + A5); B Outbox data ✓ (B1), persistence ✓ (B3/B4), enqueue ✓ (B5), actions ✓ (B6), page ✓ (B7), per-campaign panel ✓ (B8). Measurement (Tier C) intentionally absent.
- **Type consistency:** `DispatchView`/`DispatchStatus`/`DispatchGroup` defined in `status.ts` (B2) and consumed identically in B3/B6/B7/B8. `rowToDispatchView` signature matches its test. `selectPendingDeliverables` and `PendingDeliverable` match between read-model and the strip. `diffLines`/`DiffLine` match between helper, test, and UI.
- **Known verify-first points (flagged inline):** `Button` `name`/`value` forwarding (A3), exact `[campaignId]/page.tsx` data-loading shape (B8), `app-shell.tsx` icon keys (A1), `createSupabaseQueryMock` per-table behavior (B5). These are "read the file, then match" notes, not placeholders.
