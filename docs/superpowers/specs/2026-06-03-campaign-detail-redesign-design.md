# Campaign Detail Workspace — Visual Redesign

**Date:** 2026-06-03
**Route:** `/campaigns/[campaignId]`
**Status:** Approved (visual direction validated via brainstorming companion)

## Problem

The individual campaign workspace is directionally right but has four operator-reported friction points:

1. **Section headers** (Digital outreach, Paid ads, Images & video…) don't visually divide — they're colored text with no structural break, so groups blur together.
2. **Email bodies are unreadable** — the deliverable body sits in a short fixed scroll box (`max-h-80 overflow-auto`) with no way to open/expand the full email.
3. **The top half is two stacked equal 4-column rows** (metric cells + brief boxes) plus a separate amber decision strip — visually heavy and against the design system's "no equal dashboard rows" rule. The Audience/Offer/Persona/Guardrails boxes and the approval "quick bar" both feel undercooked.
4. **Full brief & compliance** reads as an undifferentiated key/value dump; compliance (the load-bearing field) isn't emphasized.

This is purely a **presentation-layer** redesign. No read-model, persistence, action, or auth changes. All four validated directions reuse existing data (`CampaignWorkspaceAsset`, `CampaignWorkspaceMeta`, `CampaignWorkspaceApproval`) and the Signal design tokens in `globals.css`.

## Approved Directions

| Area | Chosen | Rejected |
| --- | --- | --- |
| Section dividers | **A · Line** — tone rule + dot tick + count | Box (framed module), Numbered circle |
| Email preview | **A · Expand inline** — clamp + fade + "Read full" | Reader modal, Side drawer |
| Top half | **A · Fused command panel** | Identity + decision rail |
| Sticky approve-bar | **Keep, slimmer** (single line, on scroll) | Retire, Jump-up button |

## Design

### 1. Section dividers — `section-header.tsx`

Rework `SectionHeader` from text-only to a **line divider**:

- A `2px` top border in the section's tone color (`SECTION_TONE` already maps physical→amber, virtual→blue, ads→red, media→green, other→gray).
- A tone-colored dot tick (`8px` round) with a soft ring (`box-shadow: 0 0 0 3px <tone>/0.16`) at the start of the title row.
- Title stays uppercase/bold/tone-colored; detail sits below; the `N items` count chip right-aligns on the rule.

Keep the existing `tone` / `eyebrow` / `detail` / `count` prop API so both `creative-tab.tsx` and `campaign-media-board.tsx` (the two callers) pick it up unchanged.

### 2. Email / body preview — `asset-preview.tsx`

Mark `asset-preview.tsx` `"use client"` and make `ReadableCopy` stateful:

- Render the parsed body with a collapsed default: clamp to ~6 lines (`max-height` on the prose block) with a bottom fade gradient (`linear-gradient(transparent, var(--surface-soft))`).
- Add a **"Read full email" / "Collapse"** toggle button (accent, ghost-weight) below the fade. Expanded state removes the clamp and fade and shows the entire body.
- Only clamp when the content actually overflows (measure or use a height threshold); short bodies render fully with no toggle.
- The deliverable **title already acts as the subject line** in the card header (`AssetCard`), so no new field is needed; no read-model change.

### 3. Top half — fused command panel

Replace the current stack (`CampaignHeader` + `DecisionStepper` + metric-cell grid + four `BriefCard`s + `FullBrief`) with two components driven from `campaign-workspace.tsx`:

**`CampaignCommandHeader`** (new, client — replaces `campaign-header.tsx` + the `DecisionStepper` half of `campaign-package-panel.tsx`):
- One hero panel. Top zone (radial accent glow, as today): back link, `Campaign package` eyebrow, status pills (status, Outbound locked, Approved draft), title (`clamp` display), objective, and the meta chips (Persona / Focus / Owner / Updated).
- Fused **decision zone** divided from the identity zone by a `2px` amber top border on an amber-soft fill:
  - *Pending:* warn dot + `Decision required · N pending` + risk pill, the current item's title + truncated preview, a `1 / N` prev/next stepper, `See full context` toggle (expands `ApprovalContext`), `Open in Approvals ↗`, and the `DecisionControls` (Approve/Decline).
  - *None pending:* the calm green "No decision pending / outbound stays locked" state + `View approval history`.
- Carries the scroll **sentinel** at the bottom of the decision zone so the sticky bar appears once the decision leaves view.

**`CampaignBriefStrip`** (new, client — replaces the metric grid + `BriefCard`s + `FullBrief`):
- **Facts** as a single bordered panel: a 4-up definition list (`Audience`, `Offer`, `Persona`, `Guardrails`) split by vertical hairline dividers (`border-right`), tone-colored labels, value below. Collapses to 2-col then 1-col on small screens (dividers become bottom borders). Guardrails cell is red when flags exist, green/"clear" when none. **Replaces the four boxes.**
- **Metrics** become a compact inline row of small **clickable stat chips** (Deliverables / Media / Sources / Approvals) that still call `onOpenTab` — preserving today's tab-jump affordance — with the `Full brief & compliance` toggle pushed to the row's right end.
- **Full brief & compliance** (restyled `FullBrief`): same collapsible, but **Compliance gets a distinct emphasized block** at the top (tone-tinted, labeled) since it's the load-bearing field; the remaining rows (Objective, Audience, Offer, Persona, Restoration focus, Owner, Linked sources, Updated) follow as a clean line-divided list.

`CampaignOverview` is retired; `campaign-workspace.tsx` renders `CampaignCommandHeader` then `CampaignBriefStrip` then the existing sentinel/tablist/tabpanel.

### 4. Sticky approve-bar — `sticky-decision-bar.tsx`

Keep the existing scroll-triggered behavior (appears after the sentinel passes the viewport top). Tighten to a **single line**: warn dot · `Decision required · N pending` · item title (truncated) · risk pill · `DecisionControls`. Reduce vertical padding. No behavioral change to the Intersection/scroll logic.

## Components touched

| File | Change |
| --- | --- |
| `_components/section-header.tsx` | Line-divider treatment (same API) |
| `_components/asset-preview.tsx` | `"use client"`; inline expand/collapse for body |
| `_components/campaign-command-header.tsx` | **new** — fused identity + decision hero |
| `_components/campaign-brief-strip.tsx` | **new** — facts list + inline metrics + restyled full brief |
| `_components/campaign-header.tsx` | removed (folded into command header) |
| `_components/campaign-package-panel.tsx` | removed (`DecisionStepper`/`BriefCard`/`FullBrief` rehomed) |
| `_components/sticky-decision-bar.tsx` | slim single-line restyle |
| `_components/campaign-workspace.tsx` | render the two new components; keep sentinel + tabs |

## Constraints & non-goals

- Follow `DESIGN.md`: tokens only, no new hex, no nested panels, no equal dashboard rows, no side-stripe accent borders (the section "line" is a **top** border, allowed), no emojis.
- Preserve all existing behavior: deep-linkable tabs, URL-driven focus item, per-asset Approve/Decline + Request revision, prev/next stepper, scroll-triggered sticky bar, `prefers-reduced-motion`.
- No changes to `actions.ts`, the read-model, persistence, or auth.
- Keep `status-tone.ts` helpers as the single source for tone/risk mapping.

## Testing

- `status-tone.test.ts` stays green (no logic change). Add no new domain logic.
- Manual: run `pnpm dev`, open a seeded campaign (`pnpm seed:test-campaign`), verify: section lines divide groups; a long email expands/collapses; the hero shows the pending decision and approve works; facts list + inline metrics jump to tabs; full brief emphasizes compliance; sticky bar appears on scroll and approves.
- `pnpm lint` + `pnpm build` clean.
