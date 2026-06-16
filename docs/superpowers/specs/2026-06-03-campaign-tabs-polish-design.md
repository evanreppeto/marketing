# Campaign workspace tabs — polish to the Media bar

**Date:** 2026-06-03
**Status:** Approved for planning (user delegated: "do your recommendations")
**Surfaces:** `src/app/campaigns/_components/` (the six campaign detail tabs)

## Problem

The Media tab (`campaign-media-board.tsx`) feels good because of a repeatable recipe:
content-fit layouts (gallery / players / list / cards rather than one uniform grid),
tone-coded section headers (color identity + eyebrow + one-line detail + count),
hover/zoom affordances (+ lightbox), adaptive auto-fill grids, and glanceable counts.

The other tabs don't all meet that bar, and the **Deliverables** tab shows each asset's *raw*
`campaign_assets.status` ("Pending approval") instead of a decision-aware status — inconsistent
with the decision-centric roll-up shipped earlier. This work lifts the other tabs to the Media
recipe and makes the Deliverables statuses decision-aware, **worst-first**.

## Goals

- Make Deliverable statuses **decision-aware** and improve their spacing/layout.
- Group **Audience & sources** by kind with content-fit treatments (biggest visual gap today).
- Make **Arc notes** editorial (featured reasoning, chips, a real timeline) instead of monotone panels.
- Give **Approvals** a tighter, risk-signalled decision-queue feel.
- Light polish on **Performance** to match the system.
- Extract the Media recipe's section-header pattern into one shared component so it's applied consistently.

## Non-goals

- No changes to the **Media** tab itself (it's the bar).
- No data-model / read-model / persistence changes — the read-model already exposes everything
  needed (`asset.approval`, `source.kind`, `reasoning`, `events`, etc.).
- No new approval/decision behavior; reuse `DecisionControls`, `StatusPill`, tones, and the
  existing Media patterns (link card, lightbox).

## Shared building blocks (new)

### `SectionHeader` — `src/app/campaigns/_components/section-header.tsx`
The tone-coded section header repeated in Media/Deliverables, extracted once.

```
SectionHeader({ tone, eyebrow, detail, count }: {
  tone: "blue" | "red" | "amber" | "green" | "gray";
  eyebrow: string;          // e.g. "Companies"
  detail?: string;          // one-line description
  count?: number;           // right-aligned item count
})
```
Renders: a small uppercase tone-colored eyebrow + optional detail line on the left, an
`N item(s)` mono count on the right (matching the existing Media `MediaSection` header markup).
Tone→text-color map mirrors `campaign-media-board.tsx`'s `toneText`.

### `assetDecisionStatus` — pure helper (in `status-tone.ts`)
```
assetDecisionStatus(asset: { approval: { status: string } | null; }): { label: string; tone: PillTone }
```
- If `asset.approval` exists → `{ label: approval.status, tone: statusTone(approval.status) }`.
  `approval.status` is already display-ready — the existing footer renders it directly
  (`<StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>`), so no
  humanization is needed here.
- Else → `{ label: "Draft", tone: "gray" }` (no approval item = no pending decision, consistent
  with the roll-up's decision-centric model).
Unit-tested in a co-located `__tests__` file.

## Per-tab changes

### 1. Deliverables — `creative-tab.tsx` (decision-aware + spread)
- Replace the card-header pill `<StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill>`
  with the decision-aware status from `assetDecisionStatus(asset)`.
- Footer: change the `approval === null` copy from "Not submitted for approval" to
  "Draft — not submitted", and drop the now-duplicate decided pill (header already shows it).
- Spacing/spread: change each section's card grid from `lg:grid-cols-2` to
  `grid-cols-[repeat(auto-fill,minmax(340px,1fr))]` so cards reflow 1→2→3 columns by width.
- Use `SectionHeader` for each category section (tone per category: physical=amber, virtual=blue,
  ads=red, media=green, other=gray), replacing the bespoke header markup.

### 2. Audience & sources — `audience-leads-tab.tsx` (group by kind)
Group `sources` by kind into ordered sections, each led by a `SectionHeader`:
- **Companies** (blue), **Contacts** (green), **Leads** (amber) → record-card grid
  (`grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`): kind badge, label, detail, and the existing
  "Record hidden" note (record kinds have no link).
- **Evidence** (web) → link-card grid reusing the Media link-card visual (host chip via `new URL().hostname`,
  title, detail, "Open original" affordance).
Empty-state unchanged.

### 3. Arc notes — `reasoning-tab.tsx` (editorial)
- **Featured reasoning:** combine "Why Arc built this" + "Recommended action" into one prominent
  accent-bordered callout at the top (larger lead type), instead of two identical small panels.
- **Tools used** → keep chips. **Guardrails** → warning-toned chips/rows (amber).
- **Prompt inputs** → keep the definition list inside a lighter panel.
- **Arc outputs** → keep the cards.
- **Campaign timeline** → render as a real vertical timeline: a left rail with dots, each event
  showing time + type + detail/actor — replacing the current grid-of-panels.

### 4. Approvals — `approvals-tab.tsx` (decision queue)
- Add a risk-coded left rail to each card: `border-l-4` colored via `riskTone(approval.riskLevel)`
  (keep the focused/decided border treatment otherwise).
- Use `SectionHeader` for the "Decision required" (amber, count = pending) and "Decided"
  (gray, count = decided) groupings; dim the decided group slightly.
- Keep collapse/expand, `DecisionControls`, and the focus-scroll behavior unchanged.

### 5. Performance — `performance-tab.tsx` (light polish)
- Swap the bespoke `signal-eyebrow` section intros for `SectionHeader` where it fits, to match the
  system. No structural/measurement changes. Lowest priority — keep minimal.

## Testing

- **Unit:** `assetDecisionStatus` (approval present → its status/tone; absent → Draft/gray).
- **Build + lint:** `pnpm build`, `pnpm lint` clean (these are server/client components; layout
  isn't unit-tested).
- **Live verification:** with the seeded campaign on the running dev server, confirm each tab
  renders the new layout and that Deliverable status chips now read decision-aware
  (the 5 no-approval assets show "Draft", the email shows "Approved", the two pending show "Pending approval").

## Files

- Create: `src/app/campaigns/_components/section-header.tsx` (+ a test for `assetDecisionStatus`).
- Modify: `status-tone.ts` (add `assetDecisionStatus`), `creative-tab.tsx`, `audience-leads-tab.tsx`,
  `reasoning-tab.tsx`, `approvals-tab.tsx`, `performance-tab.tsx`.
- Unchanged: `campaign-media-board.tsx` (the bar).
