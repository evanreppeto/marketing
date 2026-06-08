# Connect CRM ↔ Campaigns — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Branch:** `campaigns-workspace` (or its own branch)

## Summary

Make the (already live, Supabase-backed) CRM a connected part of the app rather
than an isolated island. Three connections, all **read-only** with **no schema
changes** (every foreign key already exists):

1. **CRM in the sidebar** — add it to the real nav (`ConsoleFrame`).
2. **Reverse link** — a "Campaigns" panel on CRM record detail pages showing the
   campaigns that reference that record (the core new piece).
3. **Forward link** — a campaign's "Audience & sources" link back to the CRM
   record pages.

## Context (current state)

- The CRM is **fully wired to Supabase** (not scaffold): six objects
  (companies, contacts, properties, leads, jobs, outcomes), each with a list page
  and a `[recordId]` detail page, plus create/edit for companies/contacts/
  properties. Read-model: `src/lib/crm/read-model.ts`. CLAUDE.md's "persistence
  off" note is stale.
- Campaigns already reference CRM **one direction**: `campaigns` has FK columns
  `company_id`, `contact_id`, `property_id`, `lead_id` (and `approval_items` has
  the same four). `buildSources` in `src/lib/campaigns/read-model.ts` resolves
  company/contact/lead for a campaign's "Audience & sources" tab.
- **No reverse link exists:** a CRM record cannot show the campaigns referencing
  it, and a campaign's sources do not link to CRM record pages
  (`buildSources` sets only the company `website_url` as an external `url`).
- The real sidebar is `src/app/_components/console-frame.tsx`
  (`navItems: ShellNavItem[]`, currently Campaigns + Outbox). CRM is missing
  there but present in `growth-engine.ts` quick-jump. A real `crm-icon.png`
  exists under `public/brand/nav-icons/`.
- `src/app/crm/_components/crm-record-page.tsx` is a server component that
  fetches `getCrmRecordData` and renders summary / fields / RelatedRecords /
  intelligence sidebar. It has a clean extension point after RelatedRecords.

## 1. CRM in the sidebar

Add to `console-frame.tsx` `navItems`, between Campaigns and Outbox:

```ts
{ label: "CRM", href: "/crm", iconSrc: "/brand/nav-icons/crm-icon.png", matches: ["/crm"] },
```

`matches: ["/crm"]` highlights the item for all `/crm/...` subroutes (confirm
`SideNav`'s match semantics use prefix/`startsWith` — adjust if it's exact).
CRM is already in `growth-engine.ts` quick-jump. Add a nav test asserting the
sidebar entry exists.

## 2. Reverse link — "Campaigns" panel on CRM record pages

### Read-model: `getCampaignsForRecord`

Add **inside** `src/lib/campaigns/read-model.ts` (so it reuses the internal
`buildWorkspaceAssets` and the exported `buildLaunchState` — no duplicated
lifecycle logic):

```ts
export type LinkedCampaignRecordKind = "company" | "contact" | "lead" | "property";

export type LinkedCampaign = {
  id: string;
  name: string;
  persona: string;
  lifecycle: CampaignLaunchState["lifecycle"]; // Drafting | In review | Ready | Live
  pendingCount: number;
  href: string;
};

export async function getCampaignsForRecord(
  kind: LinkedCampaignRecordKind,
  recordId: string,
  client?: SupabaseClient,
): Promise<LinkedCampaign[]>;
```

Behavior:
- Guard: if no client and `!isSupabaseAdminConfigured()`, return `[]`. Wrap the
  body in try/catch returning `[]` so a CRM record page never breaks.
- Resolve the FK column for `kind` via a pure, unit-tested helper
  `columnFor(kind)`: `company → "company_id"`, `contact → "contact_id"`,
  `lead → "lead_id"`, `property → "property_id"`.
- Collect referencing campaign ids from **two sources**, deduped:
  (a) `campaigns` where `<column> = recordId`;
  (b) `approval_items` where `<column> = recordId`, projected to `campaign_id`
      (non-null).
- Load those campaigns + their assets + approvals (reuse the same `selectIn`
  helpers and `buildWorkspaceAssets`), compute `buildLaunchState` per campaign,
  and map to `LinkedCampaign` (name via `cleanCampaignName`, persona via
  `humanize`, `href = /campaigns/${id}`, `pendingCount` from launch state).
- Sort by most recently updated.

### Component + wiring

- New `src/app/crm/_components/linked-campaigns-panel.tsx` —
  `LinkedCampaignsPanel({ campaigns }: { campaigns: LinkedCampaign[] })`.
  Returns `null` when empty. Renders a panel ("Campaigns") with one row per
  campaign: name (link to `href`), persona, a lifecycle `StatusPill`, and
  "N awaiting" when `pendingCount > 0`. Server-friendly (no client hooks).
  Lifecycle→tone mapping: Drafting=gray, In review=amber, Ready=blue, Live=green.
- `crm-record-page.tsx` — after `getCrmRecordData`, fetch
  `getCampaignsForRecord(kind, recordId)` **in parallel** (`Promise.all`), but
  ONLY for `objectKey ∈ {companies, contacts, leads, properties}` (campaigns
  don't reference jobs/outcomes — pass `[]` for those). Map `objectKey` →
  `kind` (companies→company, contacts→contact, leads→lead, properties→property).
  Render `<LinkedCampaignsPanel campaigns={...} />` after the RelatedRecords
  section. Do not change the not_found/unavailable handling.

## 3. Forward link — campaign sources → CRM record pages

- Add optional `recordHref: string | null` to `CampaignWorkspaceSource` in
  `src/lib/campaigns/read-model.ts`.
- In `buildSources`, set `recordHref` for the resolved CRM records:
  company → `/crm/companies/${id}`, contact → `/crm/contacts/${id}`,
  lead → `/crm/leads/${id}`. Leave `recordHref: null` for `web`/`evidence`
  sources. The existing external `url` (e.g. company website) is unchanged.
- In `src/app/campaigns/_components/audience-leads-tab.tsx`, render a "View in
  CRM" link for sources that have a `recordHref` (using `next/link`).

## 4. Testing & safety

- **Unit tests (pure):** `columnFor(kind)` mapping; the `LinkedCampaign` mapping
  shape via `createSupabaseQueryMock` (campaign referenced by `campaigns` FK and
  by an `approval_items` FK both surface, deduped).
- All new queries guarded by `isSupabaseAdminConfigured()`; `getCampaignsForRecord`
  returns `[]` on error/unconfigured — CRM record pages degrade gracefully.
- Read-only: no mutations, no new outbound side-effects, no migration.

## Out of scope (YAGNI)

- Dispatch/Outbox status on CRM records.
- Any CRM write action (e.g. "Start a campaign for this record").
- Property resolution in campaign *sources* (the forward link covers
  company/contact/lead; properties are covered by the reverse panel only).
- Approval-decision history surfaced on the CRM record.

## Sequencing

1. CRM sidebar nav (+ test).
2. `getCampaignsForRecord` read-model + `columnFor` test.
3. `LinkedCampaignsPanel` + `crm-record-page.tsx` wiring.
4. Forward link: `recordHref` on sources + `audience-leads-tab.tsx`.

One PR; can ride on `campaigns-workspace` or its own branch.
