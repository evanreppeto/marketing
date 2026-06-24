# Arc Premium Redesign — Design Spec

**Date:** 2026-06-24
**Status:** Draft for approval
**Owner:** Evan + Claude
**Source of truth for the look/feel:** the 20 Higgsfield mockups (gallery served locally; PNGs in `%TEMP%\arc-ui-mockups`).

## 1. Goal

Make the real app look and feel **exactly like the 20 premium mockups**: a calm, premium, AI-native marketing operating system in the spirit of Linear / Claude / Gemini — warm obsidian, antique gold used sparingly, an editorial serif moment, hairline structure, real evidence + approval cues. The bar is "a product you open every morning," not "a dashboard with AI bolted on."

This is a **calibrate-and-refine** of the existing Signal design system, **not a rebuild**. A multi-agent audit (2026-06-24) confirmed the foundation is ~75% there.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **Extend & calibrate** (not restart) | Token system, `theme.ts`, primitives, ⌘K, and four-section sidebar already exist and are good. |
| Nav grouping | **Keep four sections** (Workspace / Growth / Intelligence / Assets) | It's what ships in `main` and matches the mockups. The "#259 three-section regroup" is not in git (HEAD is #257); treat as speculative. |
| Serif | **Adopt the Fraunces display-moment** (one serif title per screen) | It's the signature that makes the mockups feel authored, not generic. Net-new convention via a shared primitive. |
| Theme | **Dark-first** | The token system and all primary mockups are warm-obsidian dark. Light is a later parallel token set, out of scope now. |
| Fidelity | **Direction + judgment** | Pixel-faithful on hero screens (Home, Arc); high-fidelity-but-pragmatic elsewhere, reusing components. |
| CRM data | **Do the migration** | Renders show numeric confidence/scores/sparklines; the project rule forbids faking data. Promote to typed columns + backfill (Phase 3). |
| Scaffold screens | **Restyle now, wire right after** (per-screen) | Fast visual win, then real persistence following the campaigns/vault pattern. Never ship a no-op button as if it's real — mark preview until wired. |
| Shipping | **Incremental PRs**, phase by phase | Safer against fast-moving `main`. Rebase on fresh `origin/main` + regenerate `pnpm-lock.yaml` locally per PR. |
| Showcase data | **Gated demo data** (`isDemoDataEnabled()`) | Screens look full immediately without leaking demo data to real workspaces. |

## 3. Approaches considered

1. **Full restart** (new design system) — rejected: throws away a mature, consumed token layer and 200+ wired components for no gain.
2. **Theme-only retint** (recolor, nothing else) — rejected: misses the genuinely-missing chrome (app-wide top bar) and primitives (evidence chip, approval card) the mockups depend on.
3. **Extend & calibrate (CHOSEN)** — recolor tokens to target, add the two missing primitives, lift the top bar app-wide, then refine screen-by-screen. Highest leverage, lowest risk.

## 4. What already exists (reuse as-is)

- **Token layer** (`src/app/globals.css`): stepped surfaces (`--canvas` → `--surface-panel` → `--surface-inset` → `--surface-soft` → `--surface-raised`, `--surface-sidebar`), ivory text tiers, hairline/panel/strong borders, antique-gold `--accent`, status hues (`--ok`/`--warn`/`--priority`), elevation shadows. **No hex in components** — recoloring is a token edit.
- **`theme.ts` contract**: button variants (primary/priority/ghost/approve/decline/archive/revision), 6 pill tones, control + text classes — consumed app-wide.
- **Primitives** (`page-header.tsx`): `PageHeader`, `Panel`, `StatusPill`, `StatCard`/`StatStrip`, and a **working inline `Sparkline`** (`StatItem.spark?: number[]`).
- **⌘K**: `CommandMenuProvider` + ⌘K trigger already wired (currently a full-screen overlay).
- **Sidebar**: already grouped into four sections via `SidebarSection` in `console-frame.tsx`.

## 5. The real gap (verified, corrected from the raw audit)

- Canvas ships as **`#080b0d`** (cool/dark), not the mockups' warm **`#16161a`** → token recalibration.
- Fonts are **all-Geist**; Fraunces is loaded but scoped to auth only → the serif moment is net-new.
- **Two missing primitives**: an evidence/citation chip and an inline approval card.
- The persistent **top bar** (`WorkbenchTopBar` with ⌘K + avatar) renders **only on `/arc`** → must go app-wide.
- Accent gold is currently `#d3aa4b` vs mockups' `~#c8a24a` → reconcile to one value.
- `TrendChart` (Analytics) uses `@mui/x-charts`; dead `recharts` is still in `package.json` → chart-rule cleanup (inline SVG / Cytoscape only).

## 6. Design — Phase 0 (Foundation; everything inherits this)

**6.1 Token recalibration.** Shift `--canvas`/`--canvas-deep`/surface tiers from `#080b0d` toward warm-obsidian `#16161a` family; re-verify every surface step still visibly separates (panel lifts off canvas, inset recedes). Pick one accent gold (`#c8a24a`). One-file change in `globals.css`; visually QA in the preview at each tier.

**6.2 Serif display-moment convention.** A shared title treatment (extend `PageHeader`, or a small `<DisplayTitle>`): exactly one Fraunces serif title per screen (the page hero / record name / greeting), everything else Geist. Loaded weights 400/500/600 only (never 700+). Codifies the "authored journal" feel.

**6.3 App-wide top bar.** Lift `WorkbenchTopBar` out of `/arc`-only scope into the global shell (`console-frame.tsx`): slim bar with breadcrumb/title left, **⌘K as a slim search field** (restyle the existing overlay trigger), avatar + status on the right. Keep the command list synced to the real nav.

**6.4 Two new primitives.**
- `EvidenceChip` — extends `StatusPill`: small numbered/source chip (`[1] NOAA`, confidence %), optional link. Used in Home focal card, Opportunities, Arc citations, Brand facts.
- `InlineApprovalCard` — in-flow approve/revise/decline where **gold Approve is the singular focal action**, ghost Request-revision / Decline, plus an **"Outbound stays locked"** lock badge. Used in Arc replies, Activity, Campaign builder, Outbox.

**6.5 Sidebar + icon polish.** Section labels + hairline dividers + a **gold active tick/dot** on the four-section rail. Unify monoline icons (`nav-icons.tsx` + `ticket-icons.tsx`) to one stroke weight. Soften `StatusPill` 3px corners.

**6.6 Chart-rule cleanup.** Remove dead `recharts` from `package.json`; codify "inline SVG + Cytoscape only" (TrendChart rewrite happens in Phase 4).

**Phase 0 exit criteria:** Home renders in the new warm palette with the app-wide top bar, a Fraunces title, and the two new primitives visible — verified in the browser preview.

## 7. Design — Phases 1–4 (screens)

**Phase 1 — Flagship proof: Home + Arc Chat** (mockups 01, 02). Home is ~70% aligned: wire `StatStrip` sparklines into the metric strip, add `EvidenceChip` + confidence bar to the focal card, split the right rail into distinct Signals + Arc-activity panels, apply the new top bar. Arc: elevate the "Thought for Ns" trace, render numbered citations as `EvidenceChip`, make gold Approve the focal action via `InlineApprovalCard`, polish the "Arc is thinking" shimmer. **No backend changes** — restyle of existing, feature-complete components. This phase proves the whole system end-to-end.

**Phase 2 — Approval/operational loop** (mockups 04, 05, 03, 08, 14, 15). Campaigns list + builder (already **wired**), Opportunities, Activity, Outbox, Board. Reuse the Phase-0 approval/evidence primitives; add locked-vs-cleared states; align Board lanes Backlog → Drafting → In review → Approved → Live. **Restyle now; wire persistence per-screen right after** (vault/campaigns pattern + `requireOperator()` gate). Preview-only actions stay clearly marked until wired.

**Phase 3 — CRM list + record** (mockups 06, 07). **Backend migration** (new `supabase/migrations/` file): promote `confidence` (numeric %), `revenue_score`, `relationship_score`, `journey_stage`, `next_best_action` from `metadata` JSONB to first-class typed columns; backfill; update read-model + repos. Then build the contacts table (persona chip w/ confidence, score/stage/next-best-action columns) and the record (multiple persona chips, three numeric readouts with sparklines, wired activity timeline). The only phase with mandatory backend work.

**Phase 4 — Intelligence + remaining** (mockups 09, 10, 11, 12, 13, 16, 17, 18). Analytics (rewrite `TrendChart` to inline SVG), Brain (Cytoscape styling pass), Personas, Library + Brand (provenance + citation chips), Settings (connectors + team), Onboarding + Auth (restyle; Auth already wired). Independent — parallelizable.

## 8. Risks & mitigations

- **Scaffold-vs-wired** (Activity/Outbox/Board/Opportunities/Analytics/Settings are read-models feeding preview pages): don't ship approve/decline buttons that silently no-op. Either wire persistence (per the chosen plan) or visibly mark preview until wired.
- **Persona-RI backend gap**: CRM numbers require the Phase-3 migration; do not fake in the frontend.
- **Chart rule**: inline SVG / Cytoscape only; `TrendChart` (`@mui/x-charts`) is the live violation to fix in Phase 4; remove dead `recharts` in Phase 0.
- **Demo-data leakage**: all demo intelligence stays behind `isDemoDataEnabled()`; no demo values hardcoded into components.
- **Merge collisions**: `console-frame.tsx` nav and `src/domain/index.ts` silently drop parallel entries; web-editor merges corrupt `pnpm-lock.yaml`. Rebase on fresh `origin/main` + regenerate the lockfile locally per PR; run `tsc`/`pnpm build` after each merge.
- **⌘K mis-shaped, not missing**: restyle/reposition; keep the command list synced to real nav.

## 9. Verification

- Per screen: browser preview (`preview_*`) — console clean, snapshot matches the mockup intent, interactions work; screenshot as proof.
- Logic (migrations, read-models, wiring): vitest; mock `next/cache` per-file where `revalidatePath` is used.
- Every PR gates on the new CI (typecheck + lint + test + build). Scope eslint to changed files when self-checking.

## 10. Out of scope (for now)

Light theme, mobile-native app, new features beyond what the mockups depict, and any backend work other than the Phase-3 CRM migration.

## 11. Sequencing summary

Phase 0 (Foundation, ~1–2 wk, M) → Phase 1 (Home + Arc, M) → Phase 2 (approval loop, M) → Phase 3 (CRM + migration, L) → Phase 4 (intelligence + rest, L, parallelizable). Each phase = its own PR(s).
