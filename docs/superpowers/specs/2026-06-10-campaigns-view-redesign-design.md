# Campaigns View Redesign — Design Spec

**Date:** 2026-06-10
**Status:** Approved (brainstorm), pending implementation plan
**Surface:** `/campaigns` library list (`src/app/campaigns/_components/campaign-library.tsx` + `page.tsx`)

## Problem

The Campaigns tab is Mark's (Hermes') approval queue — the ContentEngine-style human gate where
the operator reviews drafted work and approves before outbound unlocks. Today the list shows nine
visually identical "NEEDS YOU" rows carrying only `name · persona · channel · asset-count · "Drafted
by Mark · date"`. The decision the operator must make — *should this go out?* — is unsupported:

1. **Decision-relevant data is discarded.** The read model (`CampaignWorkspaceListItem`) already
   delivers `whyBuilt`, `objective`, `previewText`, `previewLabel`, and `thumbnailUrl` to the client,
   and the row renders none of it. You must open all nine to triage.
2. **No content preview.** You can't tell a strong draft from a weak one without opening it.
3. **Everything looks equally urgent.** Four near-identical internal "CRM Population" batches get the
   same gold weight as a real outbound partner email.
4. **Time isn't framed as urgency.** "Drafted by Mark · Jun 1" is a passive stamp, not "waiting 9d".
5. **Per-row Mark branding is redundant** — the "M" chip + "Drafted by Mark" repeats on every row.
6. **No sense of pipeline / momentum** — Ready/Live/Drafts all read 0; the screen is one big pile.

## Goal

Primary: **decide faster, with confidence** — make each row self-sufficient for triage so the
operator can choose *which* campaign to open and *in what order* without opening every one.
Secondary: **feel the operation** — a light momentum layer so the queue reads as a command center.

Non-goal (explicit operator decision): **no state changes from the list.** Approve / decline /
request-revision continue to happen inside the campaign workspace, where full context is visible.
This keeps outbound safe — no campaign can go out from a quick list click. The list's only action is
**Review**, which routes into the workspace. No inline actions, no bulk-select.

## Design

### 1. Enriched row (the decision surface)

Each campaign row becomes a three-part block:

- **Title line:** campaign name + lifecycle pill (e.g. gold "Needs you").
- **Why line:** one line of `whyBuilt` (fallback `objective`) — *why Mark built this*.
- **Meta line:** `persona · channel-summary · N assets · wait-time` (relative, e.g. "waiting 4h").

The redundant per-row "M / Drafted by Mark" attribution is removed; the entire tab is Mark's work, so
it becomes implicit. (Attribution is reserved for future non-Mark rows, e.g. operator-created.)

### 2. Content preview (outbound rows only)

Outbound campaign rows additionally render a compact preview panel: `previewLabel` +
`previewText` (e.g. "Email · subject" → the subject + first line), or `thumbnailUrl` for visual
assets. This lets the operator judge Mark's actual draft quality before opening. Preview is **omitted
for internal CRM-population batches** (see §3) and when no preview data exists.

### 3. Internal vs. outbound split

A pure domain helper classifies each list item as **internal** (CRM-population / enrichment batch) or
**outbound** (real campaign) from its `assetTypes`/objective. Within *Awaiting your approval*:

- **Outbound** items render as full enriched rows with preview, floated to the top.
- **Internal** batches collapse into a single fold:
  *"CRM Population — 4 batches · enrich 4 records · oldest waiting 9d · expand ▾"*.
  Expanding reveals the individual compact rows. This stops internal busywork from competing
  visually with partner-facing outbound.

If there is only one internal batch, it renders as a normal compact row (no fold).

### 4. Momentum header

A slim strip above the list, built **only from data this read model already has**:

- **Live** — count of `lifecycle === "Live"`.
- **Awaiting you** — count of `lifecycle === "In review"` (the existing `pendingCount`).
- **Drafts** — count of `lifecycle === "Drafting"`.
- **Assets** — `totals.assets`.

Engagement metrics ("Sent / 7d", "Opens") are **out of scope for this pass** — they require the
`src/lib/performance/` read-model, which isn't wired here. The strip is built so those stats can be
added later without restructuring; it never renders a faked or zero engagement number. The strip
degrades gracefully (renders nothing) when the list is empty.

### 5. Kept as-is

- Lifecycle grouping: Awaiting → Ready → Live → Drafts.
- Filter chips with counts (All / Awaiting approval / Ready / Live / Drafts).
- `PageHeader` with the "N awaiting you" pill and "＋ Ask Mark to build one".
- Empty lifecycle groups get a one-line affordance ("Nothing ready yet — approved campaigns land
  here.") instead of disappearing, so the pipeline shape stays legible.

### 6. Sort order

Within *Awaiting your approval*: **outbound first, then internal**, each sorted by **wait-time
descending** (longest-waiting first) so nothing rots silently. Other lifecycle groups keep their
existing `updated_at desc` order.

## Data wiring (free vs. new)

| Need | Source | Status |
|------|--------|--------|
| "Why" line | `whyBuilt` / `objective` | **Free** — already on list item |
| Content preview | `previewText` / `previewLabel` / `thumbnailUrl` | **Free** — already on list item |
| Channels, asset count, persona | `assetTypes`, `assetCount`, `persona` | **Free** |
| Relative wait-time | raw `campaign.updated_at` | **New** — add `updatedAtIso` to `CampaignWorkspaceListItem` (the raw value is already in the loop at read-model.ts:454; keep `updatedAt` formatted, add ISO alongside) |
| Internal vs outbound | `assetTypes` / objective | **New** — pure domain helper `classifyCampaignKind({ assetTypes, objective })` in `src/domain/` (primitives in, no `lib/` dependency) |
| Momentum counts | lifecycle field + `totals.assets` | **Free** — derived in the page/component |
| Engagement (sent/opens) | `src/lib/performance/` | **Out of scope** — follow-up |

## Component shape

`campaign-library.tsx` (~230 lines today) stays the orchestrator. Extract focused, independently
testable units, matching the existing colocated-`_components` convention:

- `<MomentumStrip>` — renders the lifecycle-count strip; pure presentational, props = counts.
- `<CampaignRow>` — the enriched row (title / why / meta / wait-time / CTA). Used by all groups.
- `<CampaignPreview>` — the outbound content-preview panel; renders null without preview data.
- `<CollapsedBatchGroup>` — the internal-batch fold (client component for expand/collapse).
- `classifyCampaignKind(input: { assetTypes: string[]; objective: string }): "internal" | "outbound"`
  — pure helper in `src/domain/`, unit-tested. Takes **primitives** (not the `CampaignWorkspaceListItem`
  type) so `domain/` stays decoupled from the `lib/` read-model, per the layering rule.
- `relativeTime(iso): string` — small helper (or reuse existing if one exists), unit-tested.

Each unit answers: *what does it do, how is it used, what does it depend on?* — and can be tested
without the others. The collapse state is the only client-side interactivity; everything else stays a
server component.

## Testing

- `classifyCampaignKind` — unit tests in `src/domain/__tests__/` covering CRM-population batches,
  email/social outbound, and ambiguous/empty `assetTypes`.
- `relativeTime` — unit tests for minutes/hours/days boundaries (deterministic: pass "now" in).
- Read-model: a test asserting `updatedAtIso` is populated and ISO-shaped on the list item.
- Component-level: the existing `_components/__tests__` pattern for row rendering (why line present,
  preview omitted for internal rows, fold collapses multiple batches).

## Out of scope

- Inline / bulk approve-decline from the list (operator chose workspace-only decisions).
- Engagement/performance metrics in the momentum strip (needs performance read-model).
- Any change to the campaign workspace (`[campaignId]`) itself.
- Changes to how Mark drafts campaigns or the approval backend.

## Design system

Follows `DESIGN.md`: Command Charcoal / Canvas White / Restoration Red (gold accent) palette, existing
CSS-var tokens (`--accent`, `--surface-panel`, `--ok`, etc.), no emojis, no equal-column dashboard
rows. The momentum strip is a single horizontal band, not a 3-card row.
