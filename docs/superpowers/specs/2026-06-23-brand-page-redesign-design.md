# Brand Page Redesign — Arc-Assisted, Human-Controlled, Calm

**Date:** 2026-06-23
**Status:** Approved direction, pending spec review
**Surface:** `src/app/library/brand/page.tsx` (re-exported by `src/app/brand/page.tsx`)

## Problem

The brand page is overwhelming. Concretely, not subjectively:

- **Duplicate stat rows.** The "Brand knowledge" command center shows `New / Learned / Review / Blocked`; the `SourceControlCenter` immediately below shows `Sources / Drive / Ready / Learned / Review / Blocked`. Same numbers, twice, ~10px apart.
- **Duplicate file lists.** "Source inventory" (inside `SourceControlCenter`) and "Knowledge sources" (lower-right column) are both lists of the same brand source files.
- **Four competing accent colors.** `SECTION_TONE` paints four section themes (red/amber/green/blue), each as a colored top bar *and* a colored left border. Nothing reads as primary.
- **Pill overload.** File rows carry 3–4 `StatusPill`s plus a row of inline metadata spans.
- **Seven stacked full-width panels** with no hierarchy: intake → source pipeline → snapshot → facts+sources → personas → editor.
- **Arc narrates but doesn't help.** Every panel says "what Arc uses / Teach Arc," yet the human still fills in seven panels and a long form by hand. Arc is described, not employed.

## Goal

Make the page easy to navigate and easy to add documents / media / brand details, with Arc doing more of the work — **without ever removing the human's ability to edit, upload, or delete.** Human changes must continue to flow into what Arc sees (brand profile, Brain, media Library) via the already-wired actions.

Non-negotiable (from CLAUDE.md): Arc proposes, the human approves; nothing reaches the outside world without a human gate. This redesign makes that gate *more* visible, not less.

## Approach

**Arc-assisted, human-controlled.** This is a UI / information-architecture restructure of the existing page. It reuses every wired action — no new persistence or outbound behavior. The win is consolidation + hierarchy + an inviting AI-led intake.

Rejected alternatives:
- *Arc fully drives (chat/wizard only):* hides the direct edit/upload/delete controls the user explicitly wants kept.
- *Just declutter, no AI emphasis:* leaves Arc as narrator-only; misses the "AI can be a big help here" intent.

## New structure — four calm zones (top to bottom)

Replaces the current seven panels. One accent moment (the intake hero); everything else is hairlines and quiet text.

### Zone 1 — "Add to brand" (hero; the only loud element)
- Reuses `BrandSourceUpload` (`placement="hero"`) — drop files / paste a URL / import website pages. Already wired to `uploadAndAnalyzeBrandSourcesAction`, `importAndAnalyzeBrandUrlAction`, `importAndAnalyzeBrandWebsiteAction`.
- Remove the surrounding "Command center" wrapper and its 4 `MiniStat`s (the duplicate stat row).
- This is where "Arc helps": the user supplies raw material, Arc reads it and proposes brand details/facts/media.

### Zone 2 — "Needs your review" (single approval queue)
- Merges the old *Approved facts* panel's review affordance and the `SourceControlCenter` *Brain review* column into one list of proposed items awaiting a human (Brain nodes with `trustTier === "proposed"`, source-linked or not).
- Per item: **Approve / Reject** (reuse `approveNodeAction` / `rejectNodeAction` from `@/app/brain/actions`), plus a link to edit in `/brain` for deeper changes.
- Empty state is calm and reassuring: "You're all caught up." Not scary.
- This is the human-in-the-loop gate, made the page's second-most-prominent element.

### Zone 3 — "Brand at a glance" (read-only summary; edit on demand)
- Replaces the 4 `SnapshotCard`s **and** the always-open `BrandProfileEditor`.
- Quiet, read-only summary of: Company, Voice, Offerings, Rules, Palette. Built from `BusinessProfile` (same data as today's snapshot cards + palette strip).
- Each area's **Edit** affordance reveals the existing `BrandProfileEditor` form **in place** (expand/disclosure, preserving today's `#edit-brand` anchor target), which already writes to the brand profile Arc reads (gated by `requireOperator()` + `isSupabaseAdminConfigured()`). No drawer component dependency, no data model change — the form is the same one that ships today, just collapsed by default.
- Approved Brain facts ("what Arc knows") appear here as a compact, secondary, read-only list with a count and a "Review all in Brain" link — not a full panel.

### Zone 4 — "Sources & media" (ONE consolidated list)
- Replaces the two overlapping file lists (`Knowledge sources` + `Source inventory`) with a single source list.
- Per source: filename/label, one meaningful status, and controls — enable/hide for Arc (`toggleAvailableToArcAction`), sync Drive (`syncGoogleDriveSourceAction`), delete (`deleteGoogleDriveSourceAction`). Humans add via Zone 1 / `/library`; humans remove here.
- Drive sources fold into the same list (grouped or labeled), not a separate sub-panel.
- Collapsible / capped with "view all in Library" so it never dominates the page.

### Secondary — Personas
- `BrandPersonas` kept, moved to the bottom as reference. No redesign required beyond fitting the new visual language.

## Visual treatment (DESIGN.md + anti-slop)

- **One accent** (Restoration Red) reserved for the Zone 1 hero + primary actions. Remove the `SECTION_TONE` four-color scheme and the colored top-bars/left-borders. Use hairlines (`--border-hairline`) to separate.
- **No duplicate stat rows.** Counts live inline in section headers ("2 to review", "8 sources").
- **At most one status pill** per row, and only when it carries real meaning.
- **Drop the uppercase `signal-eyebrow` kickers** on sub-headers (consistent with the title-first `PageHeader` treatment already adopted elsewhere).
- One confident type moment (page title / a single editorial heading), the rest calm — restraint without going flat.

## Data & propagation

No new persistence. All reads stay as they are in `page.tsx`:
`loadBrandProfile`, `listNodes`, `getMediaLibraryData`, `getAgentName`, `getPersonaIntelligenceData`, `loadSourceControlData`.

Human edits/uploads/deletes route through the existing wired actions, which already update:
- **Brand profile** (what Arc reads) — `BrandProfileEditor` → `brand-kit` persistence.
- **Brain** (knowledge graph facts) — approve/reject node actions.
- **Media Library** (sources Arc can learn from) — upload/analyze + toggle/sync/delete.

**CRM is out of scope.** Brand edits do not currently propagate to CRM records; this redesign does not change that. If desired, wiring brand→CRM is a separate, flagged follow-up — not faked here.

## Out of scope

- New backend fields, migrations, or routes.
- Any automatic outbound/publish behavior.
- CRM propagation from brand edits.
- Higgsfield / AI creative generation (stays operationally off).

## Success criteria

- No duplicated stats or file lists remain.
- ≤ 1 accent color in use; section separation is hairline-based.
- Page reads top-to-bottom as: add → review → know → manage, with a clear single focal point.
- Every current capability (upload, URL/website import, approve/reject facts, enable/hide/sync/delete sources, edit full profile, view personas) is still reachable.
- All existing tests for the reused components/actions still pass; `pnpm build` (tsc) is clean.
