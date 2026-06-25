# Arc Premium Redesign — Design Spec

**Date:** 2026-06-24
**Status:** Draft for approval
**Look/feel source of truth:** the 20 Higgsfield mockups (gallery at `localhost:8910`; PNGs in `%TEMP%\arc-ui-mockups`).
**Builds on:** [`2026-06-24-app-redesign-foundation-design.md`](./2026-06-24-app-redesign-foundation-design.md) — the **#259 Foundation Pass (already shipped to `main`)**.

## 1. Goal

Make the real app look and feel **exactly like the 20 premium mockups** — a calm, premium, AI-native marketing OS in the spirit of Linear / Claude / Gemini. The mockups are the concrete visual target for the page-by-page rollout that #259 already teed up.

This is **calibrate-and-refine**, not a rebuild. Audit (2026-06-24, re-verified against `origin/main` after rebasing past #259/#260) confirms the foundation is in place.

## 2. Relationship to #259 (critical context)

#259 "App Redesign — Foundation Pass" **already shipped** and is the foundation this extends. It established the **Refined Dark** direction (keep obsidian+gold, strip decoration), and did the global pass:

- Removed the 360-particle `FlowFieldBackground`, hero auras, rail/section glow washes, and bloom hovers → **calm flat canvas**.
- **Flattened `.signal-panel`** to hairline-bordered surfaces (dropped sheen + inner highlight). ← already our mockup direction.
- **Regrouped the rail** to: top **Home · Arc**; **Work** (Campaigns, CRM, Opportunities); **Studio** (Brand & Files, Gallery, Board); **Intelligence** (Analytics, Brain, Personas); base **Settings**.
- **Relocated routes:** Activity → a tab under Analytics; Outbox → a tab/column under Board; Usage → Settings (all old routes still reachable).
- Added **calm principles** to `DESIGN.md` (one focal moment, one accent, one Fraunces title, whitespace+hairlines, calm motion).
- Defined the **page rollout order** (highest-traffic first): Home → Campaigns → CRM → Opportunities → Analytics → Brand/Library → Personas → Brain → Board → Settings → long tail.

**Therefore:** this spec = (a) finish the small amount of *remaining* foundation the mockups need that #259 didn't cover, then (b) execute #259's page rollout, with each mockup as that page's visual spec.

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **Extend #259, calibrate-and-refine** | Foundation + tokens + primitives + flat panels + calm IA already shipped. |
| Nav / IA | **Adopt the shipped IA** (Home·Arc / Work / Studio / Intelligence / Settings) | It's live and intentional. The renders' "Growth/Assets" labels predate #259; the *visual language* is identical, only section names differ. |
| Theme | **Dark-first** | Tokens + primary mockups are warm-obsidian dark; light is a later parallel set, out of scope. |
| Canvas warmth | **Calibrate `--canvas` `#080b0d` → warm `#16161a` family** | The renders Evan approved read warmer than the shipped cool-obsidian. Subtle, deliberate divergence from #259's "keep tokens"; a few tokens in `globals.css`. Re-verify surface-step separation. |
| Serif | **Realize the Fraunces display-moment** via a shared title primitive | #259's calm principles already mandate "one Fraunces title per screen," but fonts ship all-Geist (Fraunces auth-only). Implement the documented rule. |
| Fidelity | **Direction + judgment** | Pixel-faithful on hero screens (Home, Arc); high-fidelity-pragmatic elsewhere, reusing components. |
| CRM data | **Do the migration** | Renders show numeric confidence/scores/sparklines; faking violates the project's "don't fake data" rule. Typed columns + backfill (CRM phase). |
| Scaffold screens | **Restyle now, wire persistence right after** (per-screen) | Fast visual win, then real `requireOperator()`-gated persistence (vault/campaigns pattern). Never ship a no-op button as real — mark preview until wired. |
| Arc / Mark | **Refine toward the mockup, keep their richer "alive" identity** | #259 keeps `/arc` + `/mark` as the deliberate rich exception. Mockup 02 is calm-premium and compatible; apply evidence chips + approval card + thought-trace polish without flattening their character. |
| Shipping | **Incremental PRs, one per page cycle** | Safer vs fast-moving `main`. Rebase on fresh `origin/main` + regenerate `pnpm-lock.yaml` locally per PR; run `tsc`/`build` after each merge. |
| Showcase data | **Gated demo data** (`isDemoDataEnabled()`) | Screens look full immediately without leaking to real workspaces. |

## 4. Remaining foundation (Phase 0 — the part #259 didn't do)

#259 did decoration-kill + flat panels + calm IA + principles. The mockups still need:

1. **Warm-canvas calibration.** `--canvas`/`--canvas-deep`/surface tiers toward `#16161a`; re-verify every tier separates. Reconcile accent to one value (renders `#c8a24a` vs shipped `#d3aa4b` — pick one). One-file token edit; QA in preview.
2. **Fraunces title primitive.** Extend `PageHeader` (or a small `<DisplayTitle>`) so each screen renders exactly one Fraunces serif title (weights 400/500/600 only), everything else Geist. Realizes the already-documented calm principle.
3. **App-wide top bar + ⌘K-as-search.** Lift `WorkbenchTopBar` out of `/arc`-only into the global shell: slim bar (breadcrumb/title left, **⌘K as a slim search field** — restyle the existing overlay trigger, keep its command list synced to the real nav, avatar/status right).
4. **Two new primitives** the mockups lean on everywhere:
   - `EvidenceChip` (extends `StatusPill`): numbered/source chip (`[1] NOAA`, confidence %), optional link.
   - `InlineApprovalCard`: in-flow approve/revise/decline where **gold Approve is the singular focal action**, ghost revise/decline, plus an **"Outbound stays locked"** badge.
5. **Rail/icon polish:** gold active tick/dot on the shipped 4-group rail; unify monoline icons (`nav-icons.tsx` + `ticket-icons.tsx`) to one stroke; soften `StatusPill` 3px corners.
6. **Chart-rule cleanup:** remove dead `recharts` from `package.json` (the live `@mui/x-charts` `TrendChart` rewrite happens in the Analytics cycle).

**Exit criteria:** Home renders in the warm palette with the app-wide top bar, a Fraunces title, and both new primitives visible — verified in the browser preview, build/lint/test green.

## 5. Page rollout (follows #259's order; each = its own PR; mockup = its spec)

1. **Home / Command Center** (mockup 01) — ~70% aligned already: wire `StatStrip` sparklines into the metric strip, add `EvidenceChip` + confidence bar to the focal card, split right rail into Signals + Arc-activity, apply the new top bar. *No backend.*
2. **Arc Chat** (mockup 02) — restyle the rich exception toward the render: thought-trace, numbered citations as `EvidenceChip`, gold Approve via `InlineApprovalCard`, "Arc is thinking" polish. *No backend.* (Home + Arc together are the **flagship proof** that de-risks everything.)
3. **Campaigns** list + builder (mockups 04, 05) — already **wired**: aligned table columns w/ reply-rate sparkline; builder tabs (Brief/Audience/Email/SMS/Ad/Landing), provenance badge on media, audience+guardrail rail, sticky approval bar w/ lock state.
4. **CRM** list + record (mockups 06, 07) — **backend migration** (new `supabase/migrations/`): promote `confidence` (numeric %), `revenue_score`, `relationship_score`, `journey_stage`, `next_best_action` from `metadata` JSONB to typed columns; backfill; update read-model + repos. Then the contacts table + record (persona chips w/ confidence, three numeric readouts w/ sparklines, wired timeline). *Only phase with mandatory backend.*
5. **Opportunities** (mockup 03) — master-detail: evidence/confidence/recommended-action/approval-path; restyle now, wire after.
6. **Analytics** (mockup 09) — **rewrite `TrendChart` off `@mui/x-charts` to inline SVG**; KPI band, attribution table, Arc-next-iteration card; surface the relocated **Activity tab** (mockup 08) here.
7. **Brand & Files / Library** (mockups 13, 12) — provenance badges on assets, brand fact cards w/ citation/trust chips.
8. **Personas** (mockup 11) — playbook roster + detail rail.
9. **Brain** (mockup 10) — Cytoscape styling pass (note: a "premium knowledge web" pass already landed; refine to match).
10. **Board** (mockup 15) — lanes Backlog→Drafting→In review→Approved→Live; surface the relocated **Outbox tab** (mockup 14) w/ locked-vs-cleared states.
11. **Settings** (mockup 16) — connectors + team; surface the relocated **Usage**.
12. **Long tail** — Onboarding (17), Auth (18, already wired — restyle only).

## 6. Risks & mitigations

- **Stale-worktree surveys** (this already bit us): always re-verify against fresh `origin/main` before each cycle; rebase + regenerate lockfile per PR.
- **Scaffold-vs-wired** (Activity/Outbox/Board/Opportunities/Analytics/Settings are read-models feeding preview pages): don't ship approve/decline that silently no-ops — wire persistence per the chosen plan, or mark preview until wired.
- **Persona-RI backend gap:** CRM numbers require the migration; never fake in the frontend.
- **Chart rule:** inline SVG / Cytoscape only; fix `TrendChart` in the Analytics cycle; remove dead `recharts` in Phase 0.
- **Demo-data leakage:** all demo intelligence behind `isDemoDataEnabled()`; no demo values hardcoded in components.
- **Merge collisions:** `console-frame.tsx` nav and `src/domain/index.ts` silently drop parallel entries; web-editor merges corrupt `pnpm-lock.yaml`. Rebase fresh + regenerate lockfile locally; `tsc` after merges.
- **Canvas warmth vs #259:** warming `--canvas` is a deliberate divergence from #259's "keep tokens" to match the renders — keep it subtle and re-verify contrast/step separation.
- **⌘K is wired, not missing:** restyle/reposition only; keep command list synced to real nav.

## 7. Verification

- Per page: browser preview (`preview_*`) — console clean, snapshot matches mockup intent, interactions work; screenshot as proof. (Note: content pages had a particle-canvas screenshot hang — removed in #259, so screenshots should work now; if not, fall back to DOM/computed-style checks.)
- Logic (migration, read-models, wiring): vitest; mock `next/cache` per-file where `revalidatePath` is used.
- Every PR gates on CI (typecheck + lint + test + build); scope eslint to changed files when self-checking.

## 8. Out of scope (now)

Light theme; mobile-native app; new features beyond what the mockups depict; any backend work other than the CRM migration; `/arc` + `/mark` character changes beyond the mockup-aligned refinements.

## 9. Sequencing summary

**Phase 0 (remaining foundation)** → **Home + Arc (flagship proof)** → Campaigns → CRM (+migration) → Opportunities → Analytics (+Activity tab, TrendChart rewrite) → Brand/Library → Personas → Brain → Board (+Outbox tab) → Settings (+Usage) → long tail. Each page = its own PR. `writing-plans` will detail **Phase 0 first**; later cycles get their own plans as we reach them.
