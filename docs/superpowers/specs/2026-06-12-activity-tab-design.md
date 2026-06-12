# Activity Tab — Design Spec

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Topic:** A top-level "Activity" tab that surfaces a readable, professional audit trail of everything that happens across the workspace.

## Problem

The control plane already *writes* a full audit trail across several real tables (agent run logs, approval decisions, agent-generated drafts, campaign lifecycle events, and CRM domain events), but nothing reads it back into a human-facing view. Operators — including non-technical ones — have no single place to answer "what has happened in the app, by whom, and when?"

A finished read-model already exists (`getRecentActivity` in `src/lib/activity/read-model.ts`) that merges four control-plane tables into one chronological feed, but it has **no consumer**. This feature surfaces it as a dedicated tab and extends it with CRM events and filtering.

## Goals

- A top-level **Activity** tab, obvious and friendly to non-technical users.
- Plain-English "who did what, when" — no raw IDs, JSON, table names, or enums exposed.
- Professional, calm presentation consistent with `DESIGN.md` and existing UI primitives.
- Filter by category, date range, and free-text search.

## Non-Goals (v1)

- Org-scoping the feed (source tables for control-plane/events don't carry `org_id` yet; single seeded org today). Documented as future work.
- Record interactions (notes/follow-up tasks) as a category — fast follow.
- Cursor pagination / infinite scroll — v1 caps at the 100 newest entries in range.
- Any write/mutation behavior — this view is strictly read-only.

## Decisions (from brainstorming)

- **Name:** "Activity" (friendliest/clearest for non-technical users; "Audit trail" used as the eyebrow/subtitle for the professional framing).
- **Coverage:** Control plane + CRM events.
- **Filtering:** Category + date range + free-text search.

## Architecture

Layering stays within the established convention (`domain` → `lib/<feature>` → `app/<route>`):

- **Nav** — add to `navItems` in `src/app/_components/console-frame.tsx`:
  `{ label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] }`, placed between Board and Campaigns. Add one `"activity"` icon (simple pulse/list glyph, charcoal per `DESIGN.md`) to the SideNav icon set.
- **Route** — `src/app/activity/page.tsx`, a read-only async server component. Covered by the operator gate at the edge via `proxy.ts` like all page routes; no mutations, so no `requireOperator()` call required.
- **Data** — extend `src/lib/activity/read-model.ts` (existing file). A new small **pure** filter function is the unit-tested core.

## Data Layer

Extend `getRecentActivity` to accept options:

```ts
type ActivityQuery = {
  kinds?: ActivityKind[];   // restrict which sources run
  since?: string;           // ISO lower bound (inclusive)
  until?: string;           // ISO upper bound
  search?: string;          // case-insensitive over title/detail/actor
  limit?: number;           // default 100
};
```

Changes:

- **Add a 5th source: the `events` table** → new `kind: "event"` ("Record changes" in the UI). The `events` row shape (`actor`, `subject_type`, `subject_id`, `type`, `payload`, `occurred_at`) maps cleanly onto the existing `ActivityEntry`. A new `mapEvent` produces a plain-English title from the event `type` (e.g. `lead.created` → "Lead Created") via the existing `titleize`, and an `href` to the related CRM record (`/crm/<subject>s/<id>`) when resolvable.
- **Push date bounds** (`since`/`until`) into each Supabase source query; **`kinds`** restricts which source queries run; raise per-source limit from 15 to ~50 so a filtered window stays complete; default page `limit` to 100.
- **`applyActivityFilters(entries, { kinds, since, until, search })`** — a pure function that does category subsetting, date-bound filtering, and case-insensitive text matching over `title`/`detail`/`actor`. This is the deterministic, unit-tested piece (consistent with the codebase's "routing/scoring owned by the app layer so they stay unit-testable" ethos).

`ActivityKind` becomes `"decision" | "run" | "draft" | "campaign" | "event"`. The existing `mergeActivityEntries` (drop-no-timestamp, sort newest-first, cap) is reused unchanged.

## The Page (SSR, no client JS)

- **`WorkspaceHeader`** — eyebrow "Audit trail", title "Activity", description "Everything that's happened across the workspace — agent runs, approvals, drafts, campaigns, and record changes." Uses existing `page-header.tsx` / `workspace.tsx` primitives.
- **Filter bar** — query-param links plus one GET search form, mirroring the established `searchParams`-driven scaffold pattern (zero client state):
  - Category chips: All · AI agent runs · Approvals · Drafts · Campaigns · Record changes.
  - Date presets: Today · 7 days · 30 days · All time.
  - Search box (small GET form bound to a `q` param).
  - Active chip is visually marked; chips are `Link`s that set/clear query params.
- **Feed grouped by day**, each group with a friendly header ("Today", "Yesterday", then "June 10, 2026"). Each row (inside the shared `Panel`):
  - Colored tone dot reusing the existing `ActivityTone` (green/red/amber/blue/gray).
  - Plain-English title (from `titleize`).
  - One-line detail, actor ("by Evan" / "by Hermes"), readable time ("2:45 PM").
  - Whole row links to the related approval/record when `href` is present.
- Non-technical-friendly: no raw IDs, JSON, table names, or enum strings reach the screen.

## States

- **Live** — grouped feed as above.
- **Empty** (live, no matches) — `EmptyState`: "No activity in this range. Try widening the date filter."
- **Unavailable** (Supabase not configured) — calm `Panel` explaining the audit trail appears once the workspace is connected, consistent with how other read-models degrade (`{ status: "unavailable", message }`).

## Testing

- Unit tests in `src/lib/activity/read-model.test.ts`:
  - `applyActivityFilters`: category subsetting, `since`/`until` bounds, search match/no-match, empty result.
  - `mapEvent`: type → title, href resolution, tone.
  - Existing `mergeActivityEntries` tests remain green.
- Run: `pnpm test src/lib/activity/read-model.test.ts`.
- Type/lint: `pnpm build` (lint does not typecheck) + scoped eslint on changed files.

## Future Work (documented, not faked)

- Org-scope the feed once control-plane and `events` tables gain `org_id`; resolve via `getCurrentOrgId()` (`src/lib/auth/org.ts`). Single-tenant (BSR) today.
- Add record interactions (notes/follow-up tasks) as a 6th "Notes & tasks" category, sourced from the interactions read-model with a global cross-record query.
- Cursor pagination / "Load more" if volume outgrows the 100-entry window.

## Files Touched

- `src/app/_components/console-frame.tsx` — nav item + `"activity"` icon.
- `src/lib/activity/read-model.ts` — options param, `events` source, `mapEvent`, `applyActivityFilters`.
- `src/lib/activity/read-model.test.ts` — new unit tests.
- `src/app/activity/page.tsx` — new server-component page (+ any small colocated `_components` for the filter bar / row if warranted).
