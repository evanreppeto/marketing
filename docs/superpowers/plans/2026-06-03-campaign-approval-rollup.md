# Campaign Approval Roll-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single campaign-level status label with an action-first roll-up headline + a per-status breakdown bar, on both the campaigns list card and the campaign detail header, honoring per-piece approval.

**Architecture:** A pure, deterministic domain function (`src/domain/campaign-rollup.ts`) buckets a campaign's piece statuses and derives a roll-up state + label. The read-model resolves each piece's *effective* status (the linked approval item's status if present, else the asset's own status) into a `string[]` and calls that function, exposing a `rollup` object on both the list item and the detail meta. A shared presentational component renders the headline pill + segmented bar in both surfaces. List filters switch from raw statuses to roll-up states.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind (CSS variables), Vitest. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-06-03-campaign-approval-rollup-design.md`

---

## File Structure

**Create:**
- `src/domain/campaign-rollup.ts` — pure bucketing + roll-up derivation. No I/O.
- `src/domain/__tests__/campaign-rollup.test.ts` — unit tests for the above.
- `src/app/campaigns/_components/campaign-rollup-bar.tsx` — shared presentational headline + segmented bar.

**Modify:**
- `src/domain/index.ts` — re-export the new module.
- `src/lib/campaigns/read-model.ts` — `collectPieceStatuses` helper; add `rollup` to `CampaignWorkspaceListItem` and `CampaignWorkspaceMeta`; populate it in both `getCampaignWorkspaceList` and `getCampaignWorkspaceDetail`.
- `src/lib/campaigns/read-model.test.ts` — assert the detail roll-up.
- `src/app/campaigns/_components/status-tone.ts` — add `rollupTone`.
- `src/app/campaigns/_components/campaign-gallery.tsx` — card uses the roll-up bar (drop the cover status pill + "Awaiting approval" banner); filter chips use roll-up states.
- `src/app/campaigns/_components/campaign-header.tsx` — replace the lone status pill with the roll-up bar + a "Review next" affordance.
- `src/app/campaigns/_components/campaign-workspace.tsx` — pass the "review next" callback into the header.

---

## Task 1: Domain — bucket + derive roll-up (pure, tested)

**Files:**
- Create: `src/domain/campaign-rollup.ts`
- Test: `src/domain/__tests__/campaign-rollup.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/campaign-rollup.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { bucketCampaignStatus, deriveCampaignRollup } from "../campaign-rollup";

describe("bucketCampaignStatus", () => {
  it("maps raw statuses to buckets (case-insensitive)", () => {
    expect(bucketCampaignStatus("approved")).toBe("approved");
    expect(bucketCampaignStatus("Pending_Approval")).toBe("pending");
    expect(bucketCampaignStatus("pending_owner_approval")).toBe("pending");
    expect(bucketCampaignStatus("needs_compliance")).toBe("pending");
    expect(bucketCampaignStatus("revision_requested")).toBe("changes");
    expect(bucketCampaignStatus("declined")).toBe("changes");
    expect(bucketCampaignStatus("archived")).toBe("archived");
    expect(bucketCampaignStatus("draft")).toBe("draft");
    expect(bucketCampaignStatus("something_unknown")).toBe("draft");
  });
});

describe("deriveCampaignRollup", () => {
  it("prioritizes needs_review when any piece is pending", () => {
    const r = deriveCampaignRollup(["approved", "pending_approval", "draft"]);
    expect(r.state).toBe("needs_review");
    expect(r.label).toBe("Needs your review · 1 pending");
    expect(r).toMatchObject({ approved: 1, pending: 1, changes: 0, draft: 1, total: 3 });
  });

  it("is ready when every non-archived piece is approved", () => {
    const r = deriveCampaignRollup(["approved", "approved", "archived"]);
    expect(r.state).toBe("ready");
    expect(r.label).toBe("Ready to launch");
    expect(r.total).toBe(2); // archived excluded from denominator
  });

  it("is in_progress with a mix of approved and draft, none pending", () => {
    const r = deriveCampaignRollup(["approved", "draft", "draft"]);
    expect(r.state).toBe("in_progress");
    expect(r.label).toBe("In progress · 1 of 3 approved");
  });

  it("is changes_requested when only changes remain", () => {
    const r = deriveCampaignRollup(["revision_requested", "declined"]);
    expect(r.state).toBe("changes_requested");
    expect(r.label).toBe("Changes requested · 2");
  });

  it("is drafting when everything is draft", () => {
    const r = deriveCampaignRollup(["draft", "draft"]);
    expect(r.state).toBe("drafting");
  });

  it("is empty with no pieces (or only archived)", () => {
    expect(deriveCampaignRollup([]).state).toBe("empty");
    expect(deriveCampaignRollup(["archived"]).state).toBe("empty");
    expect(deriveCampaignRollup([]).label).toBe("No deliverables yet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/campaign-rollup.test.ts`
Expected: FAIL — cannot resolve `../campaign-rollup` / `bucketCampaignStatus is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/campaign-rollup.ts`:

```ts
/**
 * Pure roll-up of a campaign's per-piece approval state. A campaign bundles many
 * independently-approvable deliverables; this distills their statuses into one
 * action-first headline + a breakdown, with no I/O. The read-model resolves each
 * piece's effective status and calls this; the UI renders the result.
 */

export type CampaignStatusBucket = "approved" | "pending" | "changes" | "draft" | "archived";

export type CampaignRollupState =
  | "needs_review"
  | "ready"
  | "in_progress"
  | "changes_requested"
  | "drafting"
  | "empty";

export type CampaignRollup = {
  state: CampaignRollupState;
  label: string;
  approved: number;
  pending: number;
  changes: number;
  draft: number;
  /** Non-archived pieces (the breakdown denominator). */
  total: number;
};

const PENDING = new Set(["pending_approval", "pending_owner_approval", "needs_compliance"]);
const CHANGES = new Set(["revision_requested", "declined", "rejected", "blocked"]);

/** Map one raw DB status string to a coarse bucket. Unknown statuses are treated as draft. */
export function bucketCampaignStatus(status: string): CampaignStatusBucket {
  const s = status.toLowerCase().trim();
  if (s === "approved") return "approved";
  if (s === "archived") return "archived";
  if (PENDING.has(s)) return "pending";
  if (CHANGES.has(s)) return "changes";
  return "draft";
}

/**
 * Derive a campaign's roll-up from its pieces' raw statuses. Priority ladder
 * (first match wins): pending > all-approved > some-approved > changes > draft > empty.
 */
export function deriveCampaignRollup(statuses: string[]): CampaignRollup {
  let approved = 0;
  let pending = 0;
  let changes = 0;
  let draft = 0;

  for (const status of statuses) {
    const bucket = bucketCampaignStatus(status);
    if (bucket === "approved") approved += 1;
    else if (bucket === "pending") pending += 1;
    else if (bucket === "changes") changes += 1;
    else if (bucket === "draft") draft += 1;
    // "archived" is excluded from the breakdown
  }

  const total = approved + pending + changes + draft;
  const counts = { approved, pending, changes, draft, total };

  if (pending > 0) {
    return { state: "needs_review", label: `Needs your review · ${pending} pending`, ...counts };
  }
  if (total > 0 && approved === total) {
    return { state: "ready", label: "Ready to launch", ...counts };
  }
  if (approved > 0) {
    return { state: "in_progress", label: `In progress · ${approved} of ${total} approved`, ...counts };
  }
  if (changes > 0) {
    return { state: "changes_requested", label: `Changes requested · ${changes}`, ...counts };
  }
  if (draft > 0) {
    return { state: "drafting", label: "Drafting", ...counts };
  }
  return { state: "empty", label: "No deliverables yet", ...counts };
}
```

- [ ] **Step 4: Add the domain re-export**

In `src/domain/index.ts`, add this line after the existing `export * from "./campaign-revisions";` line:

```ts
export * from "./campaign-rollup";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/campaign-rollup.test.ts`
Expected: PASS (7 tests across the two describe blocks).

- [ ] **Step 6: Commit**

```bash
git add src/domain/campaign-rollup.ts src/domain/__tests__/campaign-rollup.test.ts src/domain/index.ts
git commit -m "Add pure campaign approval roll-up derivation"
```

---

## Task 2: Read-model — expose `rollup` on list items and detail meta

**Files:**
- Modify: `src/lib/campaigns/read-model.ts`
- Test: `src/lib/campaigns/read-model.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/campaigns/read-model.test.ts`, append this describe block at the end of the file:

```ts
describe("getCampaignWorkspaceDetail rollup", () => {
  it("derives a needs-review rollup, with an approval overriding its asset status", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: {
        data: {
          id: "camp-1",
          name: "Spring Flood Recovery",
          persona: "persona_property_manager",
          restoration_focus: "water_backup",
          status: "pending_approval",
          company_id: null,
          contact_id: null,
          lead_id: null,
          owner: "Arc",
          objective: "Pre-approve vendor",
          audience_summary: null,
          offer_summary: null,
          compliance_notes: null,
          launch_locked: true,
          source_signal: {},
          reasoning_payload: {},
          audit_payload: {},
          created_at: "2026-06-02T12:00:00.000Z",
          updated_at: "2026-06-02T12:00:00.000Z",
        },
        error: null,
      },
      campaign_assets: {
        data: [
          {
            id: "asset-email",
            campaign_id: "camp-1",
            asset_type: "email",
            channel: "email",
            title: "Partner intro email",
            status: "pending_approval",
            tool_source: "creative_generator",
            prompt_input: null,
            prompt_inputs: {},
            draft_body: "Hi there",
            edited_body: null,
            approved_body: null,
            dispatch_locked: true,
            compliance_notes: null,
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
          {
            id: "asset-landing",
            campaign_id: "camp-1",
            asset_type: "landing_page",
            channel: "web",
            title: "Landing page",
            status: "pending_approval",
            tool_source: "creative_generator",
            prompt_input: null,
            prompt_inputs: {},
            draft_body: "Headline",
            edited_body: null,
            approved_body: null,
            dispatch_locked: true,
            compliance_notes: null,
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
      approval_items: {
        data: [
          {
            id: "appr-email",
            campaign_id: "camp-1",
            campaign_asset_id: "asset-email",
            company_id: null,
            contact_id: null,
            lead_id: null,
            item_type: "email_campaign_asset",
            status: "approved",
            locked_until_approved: true,
            prompt_inputs: {},
            draft_output: "Hi there",
            edited_output: null,
            requested_by: "arc",
            submitted_at: "2026-06-02T12:00:00.000Z",
            risk_level: "low",
            compliance_notes: null,
            decision_notes: null,
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const detail = await getCampaignWorkspaceDetail("camp-1", supabase);

    expect(detail.status).toBe("live");
    if (detail.status !== "live") return;

    // asset-email is pending at the asset level, but its approval is approved -> approved wins.
    expect(detail.campaign.rollup.approved).toBe(1);
    // asset-landing has no approval -> falls back to its own pending status.
    expect(detail.campaign.rollup.pending).toBe(1);
    expect(detail.campaign.rollup.total).toBe(2);
    expect(detail.campaign.rollup.state).toBe("needs_review");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/read-model.test.ts`
Expected: FAIL — `detail.campaign.rollup` is `undefined` (and TypeScript error: `rollup` not on `CampaignWorkspaceMeta`).

- [ ] **Step 3: Add the import and types**

In `src/lib/campaigns/read-model.ts`, add this import near the other `@/` imports at the top (after the `import { ... } from "../supabase/server";` line):

```ts
import { deriveCampaignRollup, type CampaignRollup } from "@/domain";
```

Add `rollup` to `CampaignWorkspaceListItem` (insert after the existing `href: string;` field):

```ts
  href: string;
  rollup: CampaignRollup;
```

Add `rollup` to `CampaignWorkspaceMeta` (insert after the existing `updatedAt: string;` field):

```ts
  updatedAt: string;
  rollup: CampaignRollup;
```

- [ ] **Step 4: Add the `collectPieceStatuses` helper**

In `src/lib/campaigns/read-model.ts`, add this function directly above `function buildWorkspaceAssets(` (so the two piece-selection concerns sit together):

```ts
/**
 * Effective status of each campaign "piece" for the roll-up: one per asset
 * (the linked approval item's status wins over the asset's own), plus any
 * standalone approval items not tied to an asset. Agent outputs are excluded —
 * they are activity, not approvable deliverables.
 */
function collectPieceStatuses(assets: CampaignAssetRow[], approvals: ApprovalItemRow[]): string[] {
  const approvalByAssetId = new Map<string, ApprovalItemRow>();
  for (const approval of approvals) {
    if (approval.campaign_asset_id && !approvalByAssetId.has(approval.campaign_asset_id)) {
      approvalByAssetId.set(approval.campaign_asset_id, approval);
    }
  }

  return [
    ...assets.map((asset) => approvalByAssetId.get(asset.id)?.status ?? asset.status),
    ...approvals.filter((approval) => !approval.campaign_asset_id).map((approval) => approval.status),
  ];
}
```

- [ ] **Step 5: Populate `rollup` in the list builder**

In `getCampaignWorkspaceList`, the `items` map currently starts like this:

```ts
    const items = campaigns.map((campaign) => {
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const campaignAssets = buildWorkspaceAssets(
        assets.filter((asset) => asset.campaign_id === campaign.id),
        campaignApprovals,
        approvalOutputs.filter((output) => output.approval_item_id && campaignApprovals.some((approval) => approval.id === output.approval_item_id)),
      );
```

Replace that opening with (introduces `campaignAssetRows`, reuses it, computes `rollup`):

```ts
    const items = campaigns.map((campaign) => {
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const campaignAssetRows = assets.filter((asset) => asset.campaign_id === campaign.id);
      const campaignAssets = buildWorkspaceAssets(
        campaignAssetRows,
        campaignApprovals,
        approvalOutputs.filter((output) => output.approval_item_id && campaignApprovals.some((approval) => approval.id === output.approval_item_id)),
      );
      const rollup = deriveCampaignRollup(collectPieceStatuses(campaignAssetRows, campaignApprovals));
```

Then, in the object returned from that same `.map(...)`, add `rollup` after the `href:` line:

```ts
        href: `/campaigns/${campaign.id}`,
        rollup,
      };
```

- [ ] **Step 6: Populate `rollup` in the detail builder**

In `getCampaignWorkspaceDetail`, find this line:

```ts
    const sources = buildSources({ campaign, assets, approvals, companies, contacts, leads, outputs });
```

Add directly below it:

```ts
    const rollup = deriveCampaignRollup(collectPieceStatuses(assets, approvals));
```

Then, in the returned object's `campaign:` block, add `rollup` after the `updatedAt:` line:

```ts
        updatedAt: formatDate(campaign.updated_at),
        rollup,
      },
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test src/lib/campaigns/read-model.test.ts`
Expected: PASS (the new rollup test plus the pre-existing `buildReasoning` / creative-media tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/read-model.test.ts
git commit -m "Expose campaign approval rollup from the read-model"
```

---

## Task 3: Status tones — add `rollupTone`

**Files:**
- Modify: `src/app/campaigns/_components/status-tone.ts`

- [ ] **Step 1: Add the tone mapper**

In `src/app/campaigns/_components/status-tone.ts`, add this function after the existing `statusTone` function:

```ts
/** Map a roll-up state to a StatusPill tone. */
export function rollupTone(state: string): PillTone {
  if (state === "needs_review") return "amber";
  if (state === "changes_requested") return "red";
  if (state === "ready") return "green";
  if (state === "in_progress") return "blue";
  return "gray"; // drafting, empty
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: PASS (no new errors). `PillTone` is already declared at the top of this file, so no import is needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/status-tone.ts
git commit -m "Add rollupTone for campaign roll-up states"
```

---

## Task 4: Shared roll-up bar component

**Files:**
- Create: `src/app/campaigns/_components/campaign-rollup-bar.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/campaigns/_components/campaign-rollup-bar.tsx`:

```tsx
import { StatusPill } from "@/app/_components/page-header";
import type { CampaignRollup } from "@/domain";

import { rollupTone } from "./status-tone";

const SEGMENTS: Array<{ key: "approved" | "pending" | "changes" | "draft"; className: string }> = [
  { key: "approved", className: "bg-[var(--ok)]" },
  { key: "pending", className: "bg-[var(--warn)]" },
  { key: "changes", className: "bg-[oklch(0.62_0.19_25)]" },
  { key: "draft", className: "bg-[var(--border-strong)]" },
];

/**
 * Action-first headline + segmented breakdown bar for a campaign's approval
 * roll-up. Presentational only — used on both the list card and the detail header.
 */
export function CampaignRollupBar({ rollup }: { rollup: CampaignRollup }) {
  const { approved, pending, changes, draft, total } = rollup;
  const ariaLabel = `${approved} approved, ${pending} pending, ${changes} need changes, ${draft} draft, of ${total} pieces`;

  return (
    <div className="space-y-1.5">
      <StatusPill tone={rollupTone(rollup.state)}>{rollup.label}</StatusPill>

      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]"
      >
        {total > 0
          ? SEGMENTS.map((segment) => {
              const value = rollup[segment.key];
              if (value === 0) return null;
              return (
                <div
                  key={segment.key}
                  className={segment.className}
                  style={{ width: `${(value / total) * 100}%` }}
                />
              );
            })
          : null}
      </div>

      <p className="text-xs font-semibold text-[var(--text-muted)]">
        {approved}/{total} approved
        {pending > 0 ? ` · ${pending} pending` : ""}
        {changes > 0 ? ` · ${changes} need changes` : ""}
        {draft > 0 ? ` · ${draft} draft` : ""}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: PASS. (`--ok`, `--warn`, `--surface-inset`, `--border-strong` are existing CSS variables already used in `campaign-package-panel.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/campaigns/_components/campaign-rollup-bar.tsx
git commit -m "Add shared CampaignRollupBar component"
```

---

## Task 5: List card — use the roll-up bar

**Files:**
- Modify: `src/app/campaigns/_components/campaign-gallery.tsx`

- [ ] **Step 1: Import the roll-up bar**

In `src/app/campaigns/_components/campaign-gallery.tsx`, add this import after the existing `import { statusTone } from "./status-tone";` line:

```ts
import { CampaignRollupBar } from "./campaign-rollup-bar";
```

- [ ] **Step 2: Remove the "Awaiting approval" banner and render the roll-up bar**

In the `CampaignCard` function, delete this block (the conditional banner):

```tsx
      {campaign.status === "pending_approval" ? (
        <div className="flex items-center gap-1.5 border-b border-[var(--border-hairline)] bg-[oklch(0.82_0.13_85/0.12)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_70)]" />
          Awaiting approval
        </div>
      ) : null}
```

Then, inside `<div className="flex flex-1 flex-col p-4">`, add the roll-up bar directly after the closing `</div>` of the persona/primaryType row (the `<div className="mb-3 flex flex-wrap items-center gap-2">...</div>` block). Insert:

```tsx
        <div className="mb-3">
          <CampaignRollupBar rollup={campaign.rollup} />
        </div>
```

- [ ] **Step 3: Remove the raw status pill from the cover**

In the `CardCover` function, delete this block (the cover status pill):

```tsx
      <span className="absolute right-3 top-3">
        <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
      </span>
```

`StatusPill` and `statusTone` are still used by the gallery header (the "Outbound locked" pill), so leave their imports in place.

- [ ] **Step 4: Verify build + lint**

Run: `pnpm lint`
Expected: PASS — no unused-import errors (`StatusPill` and `statusTone` remain referenced elsewhere in the file).

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/campaign-gallery.tsx
git commit -m "Render approval roll-up on campaign cards"
```

---

## Task 6: List filters — roll-up states

**Files:**
- Modify: `src/app/campaigns/_components/campaign-gallery.tsx`

- [ ] **Step 1: Add a roll-up label map**

In `src/app/campaigns/_components/campaign-gallery.tsx`, add this constant just below the existing `const PAGE_SIZES = [12, 24, 48];` line:

```ts
const ROLLUP_LABELS: Record<string, string> = {
  needs_review: "Needs review",
  in_progress: "In progress",
  ready: "Ready",
  changes_requested: "Changes requested",
  drafting: "Drafting",
  empty: "No deliverables",
};
```

- [ ] **Step 2: Switch the filter state list from raw statuses to roll-up states**

Replace this line:

```ts
  const statuses = useMemo(() => ["All", ...Array.from(new Set(campaigns.map((c) => c.status)))], [campaigns]);
```

with:

```ts
  const states = useMemo(() => ["all", ...Array.from(new Set(campaigns.map((c) => c.rollup.state)))], [campaigns]);
```

- [ ] **Step 3: Update the filter default and matching logic**

Replace this line:

```ts
  const [filter, setFilter] = useState("All");
```

with:

```ts
  const [filter, setFilter] = useState("all");
```

Then, in the `filtered` computation, replace this line:

```ts
    const matchStatus = filter === "All" || campaign.status === filter;
```

with:

```ts
    const matchStatus = filter === "all" || campaign.rollup.state === filter;
```

- [ ] **Step 4: Update the filter chip rendering**

Replace the chip-rendering block — currently:

```tsx
            {statuses.map((status) => {
              const isActive = filter === status;
              const count = campaigns.filter((campaign) => status === "All" || campaign.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setFilter(status);
                    resetPage();
                  }}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  {status}
                  <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
                </button>
              );
            })}
```

with:

```tsx
            {states.map((state) => {
              const isActive = filter === state;
              const count = campaigns.filter((campaign) => state === "all" || campaign.rollup.state === state).length;
              const label = state === "all" ? "All" : ROLLUP_LABELS[state] ?? state;
              return (
                <button
                  key={state}
                  type="button"
                  onClick={() => {
                    setFilter(state);
                    resetPage();
                  }}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  {label}
                  <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
                </button>
              );
            })}
```

- [ ] **Step 5: Fix the empty-state copy that referenced the old filter value**

In the no-results paragraph, replace this expression:

```tsx
{filter !== "All" ? ` in "${filter}"` : ""}
```

with:

```tsx
{filter !== "all" ? ` in "${ROLLUP_LABELS[filter] ?? filter}"` : ""}
```

- [ ] **Step 6: Verify build + lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/campaigns/_components/campaign-gallery.tsx
git commit -m "Filter campaigns by roll-up state"
```

---

## Task 7: Detail header — roll-up bar + "Review next"

**Files:**
- Modify: `src/app/campaigns/_components/campaign-header.tsx`
- Modify: `src/app/campaigns/_components/campaign-workspace.tsx`

- [ ] **Step 1: Update the header to render the roll-up and an optional "Review next" button**

Replace the entire contents of `src/app/campaigns/_components/campaign-header.tsx` with:

```tsx
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

import { CampaignRollupBar } from "./campaign-rollup-bar";

export function CampaignHeader({
  campaign,
  onReviewNext,
}: {
  campaign: CampaignWorkspaceMeta;
  onReviewNext?: () => void;
}) {
  const meta: Array<[string, string]> = [
    ["Persona", campaign.persona],
    ["Focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <header className="module-rise mb-5">
      <Link
        href="/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        Back to campaigns
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,oklch(0.74_0.115_232/0.16),transparent_46%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="signal-eyebrow">Campaign package</span>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>

          <h1 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,3vw,2.4rem)] font-black leading-[1.03] tracking-[-0.04em] text-[var(--text-primary)]">
            {campaign.name}
          </h1>

          {campaign.objective ? (
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 max-w-md flex-1">
              <CampaignRollupBar rollup={campaign.rollup} />
            </div>
            {campaign.rollup.state === "needs_review" && onReviewNext ? (
              <button
                type="button"
                onClick={onReviewNext}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-bold text-[var(--surface-inset)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Review next
                <span aria-hidden>-&gt;</span>
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {meta.map(([label, value]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs"
              >
                <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold text-[var(--text-primary)]">{value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
```

Note: this removes the old `statusTone` import and the `{!campaign.launchLocked ? <StatusPill tone="blue">Approved draft</StatusPill> : null}` pill — both are superseded by the roll-up bar. The "Outbound locked" pill is kept per the spec.

- [ ] **Step 2: Wire the "Review next" callback from the workspace**

In `src/app/campaigns/_components/campaign-workspace.tsx`, replace this line:

```tsx
      <CampaignHeader campaign={campaign} />
```

with:

```tsx
      <CampaignHeader
        campaign={campaign}
        onReviewNext={pendingApprovals.length > 0 ? () => reviewApproval(pendingApprovals[0].id) : undefined}
      />
```

(`pendingApprovals` and `reviewApproval` are already defined in this component.)

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint`
Expected: PASS — no unused-import errors (the `statusTone` import was removed from the header along with its only use).

- [ ] **Step 4: Commit**

```bash
git add src/app/campaigns/_components/campaign-header.tsx src/app/campaigns/_components/campaign-workspace.tsx
git commit -m "Show approval roll-up + Review next in campaign header"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including `campaign-rollup` and `read-model` tests.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS — no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build completes with no type errors.

- [ ] **Step 4: Manual smoke check (if Supabase is configured locally)**

If `.env.local` has Supabase vars: run `pnpm seed:test-campaign`, then `pnpm dev`, open `/campaigns`, and confirm:
- The seeded campaign card shows a roll-up headline (e.g. "Needs your review · N pending") + segmented bar instead of a single status pill.
- Filter chips read "All / Needs review / …" and filter correctly.
- Opening the campaign shows the same roll-up in the header, with a working "Review next" button that jumps to the Approvals tab.

If Supabase is not configured locally, note that `/campaigns` renders the "unavailable" empty state and this manual step is skipped — the test suite covers the logic.

- [ ] **Step 5: Final confirmation**

No commit needed (all work was committed per task). Report results of `pnpm test`, `pnpm lint`, and `pnpm build`.
```
