# CRM ↔ Campaign Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the live CRM to the campaigns/Outbox features with read-only bidirectional links: CRM in the sidebar, a "Campaigns referencing this record" panel on CRM record pages, and CRM record links from a campaign's sources.

**Architecture:** No schema changes — every foreign key already exists. A new scoped read-model function (`getCampaignsForRecord`) reuses the existing internal `buildWorkspaceAssets` + exported `buildLaunchState` for consistent lifecycle labels. A read-only panel renders on CRM record pages. The campaign sources gain an internal `recordHref`. All queries are guarded by `isSupabaseAdminConfigured()` and degrade to `[]`.

**Tech Stack:** Next.js 16 server components, React 19, Supabase admin client, Vitest, Tailwind (design tokens per `DESIGN.md`).

**Reference spec:** `docs/superpowers/specs/2026-06-05-crm-campaign-linkage-design.md`

---

## File Structure

**Modify:**
- `src/app/_components/console-frame.tsx` — add CRM to sidebar `navItems`.
- `src/lib/campaigns/read-model.ts` — add `LinkedCampaignRecordKind`, `LinkedCampaign`, `columnFor`, `getCampaignsForRecord`; add `recordHref` to `CampaignWorkspaceSource` + set it in `buildSources`.
- `src/app/crm/_components/crm-record-page.tsx` — fetch + render linked campaigns.
- `src/app/campaigns/_components/audience-leads-tab.tsx` — render "View in CRM" link in `RecordCard`.

**Create:**
- `src/app/crm/_components/linked-campaigns-panel.tsx` — the reverse-link panel.
- `src/lib/campaigns/__tests__/linked-campaigns.test.ts` — tests for `columnFor` + `getCampaignsForRecord`.

---

## Task 1: CRM in the sidebar

**Files:**
- Modify: `src/app/_components/console-frame.tsx` (the `navItems: ShellNavItem[]` array, ~line 10-13)

- [ ] **Step 1: Confirm the icon asset exists**

Run: `ls public/brand/nav-icons/crm-icon.png`
Expected: the file exists. (If not, fall back to `crm.png` in that dir; do not invent.)

- [ ] **Step 2: Add the CRM nav entry**

The array currently is:

```ts
const navItems: ShellNavItem[] = [
  { label: "Campaigns", href: "/campaigns", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/campaigns"] },
  { label: "Outbox", href: "/outbox", iconSrc: "/brand/nav-icons/today-icon.png", matches: ["/outbox"] },
];
```

Change it to (CRM between Campaigns and Outbox):

```ts
const navItems: ShellNavItem[] = [
  { label: "Campaigns", href: "/campaigns", iconSrc: "/brand/nav-icons/review-icon.png", matches: ["/campaigns"] },
  { label: "CRM", href: "/crm", iconSrc: "/brand/nav-icons/crm-icon.png", matches: ["/crm"] },
  { label: "Outbox", href: "/outbox", iconSrc: "/brand/nav-icons/today-icon.png", matches: ["/outbox"] },
];
```

`SideNav`'s `matchesItem` does prefix matching (`path.startsWith(match)`) for non-exact items, so `matches: ["/crm"]` highlights CRM for `/crm`, `/crm/companies`, `/crm/companies/<id>`, etc. (verified in `src/app/_components/side-nav.tsx:21-26`).

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean; sidebar renders Campaigns / CRM / Outbox.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/console-frame.tsx
git commit -m "feat(crm): add CRM to the primary sidebar nav"
```

---

## Task 2: `getCampaignsForRecord` read-model + `columnFor`

**Files:**
- Modify: `src/lib/campaigns/read-model.ts`
- Test: `src/lib/campaigns/__tests__/linked-campaigns.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/campaigns/__tests__/linked-campaigns.test.ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { columnFor, getCampaignsForRecord } from "../read-model";

describe("columnFor", () => {
  it("maps each record kind to its campaigns FK column", () => {
    expect(columnFor("company")).toBe("company_id");
    expect(columnFor("contact")).toBe("contact_id");
    expect(columnFor("lead")).toBe("lead_id");
    expect(columnFor("property")).toBe("property_id");
  });
});

describe("getCampaignsForRecord", () => {
  it("returns campaigns referencing a record (direct + via approvals), deduped", async () => {
    const supabase = createSupabaseQueryMock({
      // Same data returned for both the `.select("id")` reverse lookup and the
      // full `.select(CAMPAIGN_SELECT).in(...)` load — the mock is per-table.
      campaigns: {
        data: [
          {
            id: "camp-1",
            name: "Spring Flood Recovery",
            persona: "property_manager",
            restoration_focus: "water",
            status: "review",
            company_id: "co-1",
            contact_id: null,
            lead_id: null,
            owner: "Arc",
            objective: null,
            audience_summary: null,
            offer_summary: null,
            compliance_notes: null,
            launch_locked: true,
            source_signal: {},
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-02T00:00:00Z",
          },
        ],
        error: null,
      },
      // Reverse approval lookup returns the same campaign id → must dedupe to one.
      approval_items: { data: [{ campaign_id: "camp-1", id: "appr-1", status: "approved", campaign_asset_id: "a1" }], error: null },
      campaign_assets: {
        data: [{ id: "a1", campaign_id: "camp-1", asset_type: "email", channel: "email", title: "Welcome", status: "pending_approval", dispatch_locked: true }],
        error: null,
      },
      agent_outputs: { data: [], error: null },
    });

    const result = await getCampaignsForRecord("company", "co-1", supabase);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "camp-1", name: "Spring Flood Recovery", href: "/campaigns/camp-1" });
    expect(["Drafting", "In review", "Ready", "Live"]).toContain(result[0].lifecycle);
    expect(typeof result[0].pendingCount).toBe("number");
  });

  it("returns [] when nothing references the record", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [], error: null },
      approval_items: { data: [], error: null },
    });
    expect(await getCampaignsForRecord("lead", "lead-x", supabase)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/campaigns/__tests__/linked-campaigns.test.ts`
Expected: FAIL — `columnFor` / `getCampaignsForRecord` not exported.

- [ ] **Step 3: Implement in `src/lib/campaigns/read-model.ts`**

Add near `buildLaunchState` (these reuse existing internals in this file:
`CAMPAIGN_SELECT`, `ASSET_SELECT`, `APPROVAL_SELECT`, `OUTPUT_SELECT`, `selectIn`,
`assertSupabaseResult`, `buildWorkspaceAssets`, `buildLaunchState`,
`cleanCampaignName`, `humanize`, `getSupabaseAdminClient`,
`isSupabaseAdminConfigured`, and the `CampaignRow`/`CampaignAssetRow`/
`ApprovalItemRow`/`AgentOutputRow` types — all already defined in this module):

```ts
export type LinkedCampaignRecordKind = "company" | "contact" | "lead" | "property";

export type LinkedCampaign = {
  id: string;
  name: string;
  persona: string;
  lifecycle: CampaignLaunchState["lifecycle"];
  pendingCount: number;
  href: string;
};

/** Pure: the `campaigns`/`approval_items` FK column for a CRM record kind. */
export function columnFor(kind: LinkedCampaignRecordKind): "company_id" | "contact_id" | "lead_id" | "property_id" {
  switch (kind) {
    case "company":
      return "company_id";
    case "contact":
      return "contact_id";
    case "lead":
      return "lead_id";
    case "property":
      return "property_id";
  }
}

/** Campaigns that reference a CRM record — directly (campaigns.<fk>) or through
 *  an approval item (approval_items.<fk>). Read-only; returns [] when Supabase
 *  isn't configured or on any error, so CRM record pages never break. */
export async function getCampaignsForRecord(
  kind: LinkedCampaignRecordKind,
  recordId: string,
  client?: SupabaseClient,
): Promise<LinkedCampaign[]> {
  if (!client && !isSupabaseAdminConfigured()) return [];

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const column = columnFor(kind);

    const { data: directRows, error: directError } = await supabase.from("campaigns").select("id").eq(column, recordId);
    assertSupabaseResult("campaigns", directError);
    const { data: approvalRows, error: approvalError } = await supabase.from("approval_items").select("campaign_id").eq(column, recordId);
    assertSupabaseResult("approval_items", approvalError);

    const ids = [
      ...new Set([
        ...((directRows ?? []) as Array<{ id: string }>).map((row) => row.id),
        ...((approvalRows ?? []) as Array<{ campaign_id: string | null }>).map((row) => row.campaign_id).filter((id): id is string => Boolean(id)),
      ]),
    ];
    if (ids.length === 0) return [];

    const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_SELECT).in("id", ids).order("updated_at", { ascending: false });
    assertSupabaseResult("campaigns", error);
    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((campaign) => campaign.id);

    const assets = await selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at");
    const approvals = await selectIn<ApprovalItemRow>(supabase, "approval_items", APPROVAL_SELECT, "campaign_id", campaignIds, "submitted_at");
    const approvalOutputs = await selectIn<AgentOutputRow>(
      supabase,
      "agent_outputs",
      OUTPUT_SELECT,
      "approval_item_id",
      approvals.map((approval) => approval.id),
      "created_at",
    );

    return campaigns.map((campaign) => {
      const campaignApprovals = approvals.filter((approval) => approval.campaign_id === campaign.id);
      const campaignAssetRows = assets.filter((asset) => asset.campaign_id === campaign.id);
      const campaignAssets = buildWorkspaceAssets(
        campaignAssetRows,
        campaignApprovals,
        approvalOutputs.filter((output) => output.approval_item_id && campaignApprovals.some((approval) => approval.id === output.approval_item_id)),
      );
      const launch = buildLaunchState(campaignAssets, campaign.launch_locked);
      return {
        id: campaign.id,
        name: cleanCampaignName(campaign.name),
        persona: humanize(campaign.persona),
        lifecycle: launch.lifecycle,
        pendingCount: launch.pendingCount,
        href: `/campaigns/${campaign.id}`,
      };
    });
  } catch {
    return [];
  }
}
```

> If `assertSupabaseResult` has a different name in this file, use the real one (it's the helper used by `getCampaignWorkspaceList`). Confirm `CampaignLaunchState` is exported/defined above — it is (used by `buildLaunchState`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/campaigns/__tests__/linked-campaigns.test.ts`
Expected: PASS (3 tests). Then `pnpm test src/lib/campaigns` — no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/__tests__/linked-campaigns.test.ts
git commit -m "feat(crm): read-model for campaigns referencing a CRM record"
```

---

## Task 3: Linked-campaigns panel on CRM record pages

**Files:**
- Create: `src/app/crm/_components/linked-campaigns-panel.tsx`
- Modify: `src/app/crm/_components/crm-record-page.tsx`

- [ ] **Step 1: Create the panel**

```tsx
// src/app/crm/_components/linked-campaigns-panel.tsx
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import type { LinkedCampaign } from "@/lib/campaigns/read-model";

const LIFECYCLE_TONE: Record<LinkedCampaign["lifecycle"], "gray" | "amber" | "blue" | "green"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "blue",
  Live: "green",
};

export function LinkedCampaignsPanel({ campaigns }: { campaigns: LinkedCampaign[] }) {
  if (campaigns.length === 0) return null;

  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Connected work</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Campaigns referencing this record</h2>
        </div>
        <StatusPill tone="blue">{campaigns.length}</StatusPill>
      </div>
      <ul className="mt-4 grid gap-3">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <Link
              href={campaign.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-[var(--text-primary)]">{campaign.name}</span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">{campaign.persona}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {campaign.pendingCount > 0 ? (
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{campaign.pendingCount} awaiting</span>
                ) : null}
                <StatusPill tone={LIFECYCLE_TONE[campaign.lifecycle]}>{campaign.lifecycle}</StatusPill>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

> Confirm `Panel` and `StatusPill` are exported from `@/app/_components/page-header` (they are — used throughout `crm-record-page.tsx`).

- [ ] **Step 2: Fetch + render in `crm-record-page.tsx`**

Add the imports (top of file, with the other `@/lib` imports):

```tsx
import { getCampaignsForRecord, type LinkedCampaignRecordKind } from "@/lib/campaigns/read-model";
import { LinkedCampaignsPanel } from "./linked-campaigns-panel";
```

Add a helper near the bottom of the file (next to the other small helpers like `isUuid`):

```tsx
function recordLinkKind(objectKey: CrmObjectKey): LinkedCampaignRecordKind | null {
  switch (objectKey) {
    case "companies":
      return "company";
    case "contacts":
      return "contact";
    case "leads":
      return "lead";
    case "properties":
      return "property";
    default:
      return null; // jobs / outcomes are not referenced by campaigns
  }
}
```

After the `const record = recordResult;` line (the record is confirmed live by then), fetch the linked campaigns:

```tsx
  const record = recordResult;
  const linkKind = recordLinkKind(objectKey);
  const linkedCampaigns = linkKind ? await getCampaignsForRecord(linkKind, recordId) : [];
```

Render the panel right after `<RelatedRecords record={record} />` (inside the left column `div`, ~line 138):

```tsx
          <RelatedRecords record={record} />
          <LinkedCampaignsPanel campaigns={linkedCampaigns} />
```

> Sequential fetch (after the live check) is intentional — it avoids running the campaigns query for `not_found`/`unavailable` records. `getCampaignsForRecord` already returns `[]` on error, so it cannot break the page.

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean. The panel appears on company/contact/lead/property records that have linked campaigns; renders nothing when there are none; never appears on jobs/outcomes.

- [ ] **Step 4: Commit**

```bash
git add src/app/crm/_components/linked-campaigns-panel.tsx src/app/crm/_components/crm-record-page.tsx
git commit -m "feat(crm): show campaigns referencing a record on its detail page"
```

---

## Task 4: Forward link — campaign sources link to CRM records

**Files:**
- Modify: `src/lib/campaigns/read-model.ts` (`CampaignWorkspaceSource` type ~line 118; `buildSources` ~line 1134)
- Modify: `src/app/campaigns/_components/audience-leads-tab.tsx` (`RecordCard`)

- [ ] **Step 1: Add `recordHref` to the source type + populate it**

In `CampaignWorkspaceSource` (the type with `id,label,detail,url,kind`), add a field:

```ts
export type CampaignWorkspaceSource = {
  id: string;
  label: string;
  detail: string;
  url: string | null;
  /** Internal link to the CRM record page, when this source is a CRM record. */
  recordHref: string | null;
  kind: "company" | "contact" | "lead" | "web" | "evidence";
};
```

In `buildSources`, set `recordHref` on each pushed source. The company/contact/lead
pushes get the CRM record path; the evidence/web push gets `null`:

```ts
  for (const company of input.companies) {
    sources.push({
      id: `company-${company.id}`,
      label: company.name,
      detail: [company.partner_tier ? humanize(company.partner_tier) : null, company.phone, company.email].filter(Boolean).join(" / ") || "Linked company",
      url: company.website_url,
      recordHref: `/crm/companies/${company.id}`,
      kind: "company",
    });
  }

  for (const contact of input.contacts) {
    sources.push({
      id: `contact-${contact.id}`,
      label: contact.full_name ?? "Linked contact",
      detail: [contact.title, contact.email, contact.phone].filter(Boolean).join(" / ") || "Linked contact",
      url: null,
      recordHref: `/crm/contacts/${contact.id}`,
      kind: "contact",
    });
  }

  for (const lead of input.leads) {
    sources.push({
      id: `lead-${lead.id}`,
      label: `Lead from ${lead.source}`,
      detail: `${statusLabel(lead.status)} / ${lead.lead_score} score${lead.loss_summary ? ` / ${lead.loss_summary}` : ""}`,
      url: null,
      recordHref: `/crm/leads/${lead.id}`,
      kind: "lead",
    });
  }
```

And in the evidence-URL push later in `buildSources`, add `recordHref: null`:

```ts
    sources.push({
      id: `url-${stableId(url)}`,
      label: getHostLabel(url),
      detail: "Evidence or source URL captured by Arc.",
      url,
      recordHref: null,
      kind: "web",
    });
```

> These three CRM pushes + the evidence push are the only places `buildSources`
> constructs a `CampaignWorkspaceSource`. Add `recordHref` to each so the type is
> satisfied. (The list read-model's `buildSourceCountByCampaign` does NOT build
> `CampaignWorkspaceSource` objects, so it needs no change — confirm by searching
> the file for other `kind: "company"|"contact"|"lead"|"web"|"evidence"` literals.)

- [ ] **Step 2: Render "View in CRM" in `RecordCard`**

`RecordCard` currently wraps the whole card in an external `<a>` when `source.url`
exists. To add an internal CRM link without nesting anchors, make the card a
plain `<article>` and put the links in the footer. Replace the entire `RecordCard`
function in `audience-leads-tab.tsx` with:

```tsx
function RecordCard({ source, tone }: { source: CampaignWorkspaceSource; tone: Tone }) {
  const detailRows = sourceDetails(source);

  return (
    <article className="flex min-h-44 min-w-0 flex-col rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 transition">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${toneBadge(tone)}`}>
          {KIND_LABELS[source.kind]}
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {source.url ? hostOf(source.url) : "Private"}
        </span>
      </div>
      <h4 className="mt-3 break-words text-base font-black leading-6 text-[var(--text-primary)]">{source.label}</h4>
      <dl className="mt-3 space-y-1.5">
        {detailRows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="min-w-0">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{row.label}</dt>
            <dd className="truncate text-sm leading-5 text-[var(--text-secondary)]" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-xs font-semibold">
        {source.recordHref ? (
          <Link href={source.recordHref} className="text-[var(--accent)] transition hover:underline">
            View in CRM
          </Link>
        ) : null}
        {source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] transition hover:text-[var(--accent)]">
            Website
          </a>
        ) : null}
        {!source.recordHref && !source.url ? (
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <LockIcon />
            Private CRM record
          </span>
        ) : null}
      </div>
    </article>
  );
}
```

Add the `Link` import at the top of `audience-leads-tab.tsx`:

```tsx
import Link from "next/link";
```

> This removes the whole-card-as-external-anchor behavior in favor of explicit
> footer links — a net UX improvement that avoids invalid nested `<a>` when both a
> CRM link and a website exist. `EvidenceCard` is unchanged (evidence sources have
> `recordHref: null`).

- [ ] **Step 3: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: clean. On a campaign's "Audience & sources" tab, company/contact/lead
cards now show "View in CRM" (and "Website" when a company has one).

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/app/campaigns/_components/audience-leads-tab.tsx
git commit -m "feat(crm): link campaign sources back to their CRM records"
```

---

## Task 5: Full verification

- [ ] **Step 1: Whole suite**

Run: `pnpm test`
Expected: all green (existing 430+ plus the new linked-campaigns tests).

- [ ] **Step 2: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: clean.

- [ ] **Step 3: Manual smoke (if Supabase + data available)**

`pnpm dev`, then:
- Sidebar shows **Campaigns / CRM / Outbox**; clicking CRM highlights it across `/crm/...`.
- Open a CRM company/contact/lead that a campaign references → a **"Campaigns referencing this record"** panel lists it with a lifecycle pill; click through to the campaign.
- On that campaign → **Audience & sources** tab → a source card shows **"View in CRM"** linking back to the record.
- A jobs/outcomes record shows no campaigns panel.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore(crm): linkage verification fixups"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** sidebar nav ✓ (Task 1); reverse read-model `getCampaignsForRecord` + `columnFor` ✓ (Task 2); panel + record-page wiring ✓ (Task 3); forward `recordHref` + audience-tab link ✓ (Task 4); tests + safety ✓ (Tasks 2 & 5, all guarded, `[]` on error). Out-of-scope items (dispatch on CRM, write actions, property in sources) intentionally absent.
- **Type consistency:** `LinkedCampaign`/`LinkedCampaignRecordKind`/`columnFor` defined in read-model (Task 2) and consumed identically by the panel (Task 3) and the record page helper `recordLinkKind` (Task 3). `recordHref` added to `CampaignWorkspaceSource` (Task 4) and consumed in `audience-leads-tab` (Task 4). Lifecycle union (`Drafting|In review|Ready|Live`) matches `CampaignLaunchState["lifecycle"]` and the panel's `LIFECYCLE_TONE` keys.
- **Verify-first points (flagged inline):** `crm-icon.png` existence (Task 1), `assertSupabaseResult` real name (Task 2), `objectKey` literal values `companies/contacts/leads/properties` (Task 3 — confirm `CrmObjectKey` uses these plural keys), no other `CampaignWorkspaceSource` construction sites (Task 4).
