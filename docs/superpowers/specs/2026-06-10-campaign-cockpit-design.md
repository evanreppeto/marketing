# Campaign Cockpit — Design (Sub-project 2)

**Date:** 2026-06-10
**Status:** Approved direction (Decision Cockpit + drawers), pending spec review
**Builds on:** the Reusable Product Shell (Sub-project 1).

## Goal

The individual campaign page (`/campaigns/[campaignId]`) is overloaded: a sticky bar, a header, an executive-overview panel, a dispatch panel, **7 tabs**, and an economics panel stacked down the page. Rebuild it as one calm **Decision Cockpit**: the operator sees what Arc made, why, and decides — everything secondary is one click away in a drawer, not stacked in their face. **Nothing is removed; it's re-composed.**

## The real decision model (must preserve)

- Approval is **per-deliverable**: each piece has Approve / Request rework / Remove (`DecisionControls`).
- The campaign-level action is **Launch**, enabled only once every required piece is approved (`LaunchTracker` in `campaign-package-panel.tsx`, driven by `launchState`).
- So the cockpit's "decision" surface = the launch tracker (progress + Launch) up top + the per-piece controls living on the creative itself. We do **not** invent a single approve button.

## Layout

A single screen, no tab bar:

1. **Header** (slim) — back-to-campaigns, name, lifecycle + outbound-lock pills. Reuse `CampaignHeader`.
2. **Launch tracker** — the decision/readiness strip with the Launch action. Reuse `LaunchTracker` (currently nested in `CampaignOverview`); surface it directly.
3. **Two-column body:**
   - **Left (wide) — the creative.** `CreativeTab` (the deliverables, each with its `DecisionControls`). This is the thing being approved; it dominates. Media folds in as a secondary drawer, not a peer.
   - **Right (narrow) — the "why / who / risk" rail.** A new compact `CockpitRail`: Why (`executiveOverview.why`), Who (`campaign.persona` + linked-source count), Risk (guardrail flags, green "No flags" when none), plus a couple of key facts (timeframe, how success is measured). Condensed from the existing `ExecutiveOverview`/`FullBrief` data — no new data.
4. **Secondary drawers (quiet triggers, not tabs).** A single right slide-over (`WorkspaceDrawer`) that renders one existing panel at a time. Triggers sit in a thin row under the header (a labeled button group). Drawers: **Talk to Arc** (`MarkConversation`), **Decision log** (`ApprovalsTab`), **Measurement** (`PerformanceTab`), **Audit** (`AuditLog`), **Dispatch** (`DispatchPanel`), **Media** (`CampaignMediaBoard`), **Economics** (`CampaignEconomicsPanel`), **Full brief** (the `FullBrief` details + audience/sources). Each shows its count where one exists.

The deep-link behavior (URL `?item=` opening the Decision log to a record) is preserved by mapping it onto the Decision-log drawer being open.

## Components

**New:**
- `src/app/campaigns/_components/workspace-drawer.tsx` — a generic right slide-over (same interaction contract as the Arc `AgentSettingsDrawer`: `role=dialog`, `aria-modal`, Escape + backdrop close, focus on open, CSS-only). Props: `{ open, title, onClose, children }`. One drawer, content swapped by the cockpit.
- `src/app/campaigns/_components/cockpit-rail.tsx` — the why/who/risk + key-facts rail (pure presentational, fed from `detail`).
- `src/app/campaigns/_components/campaign-cockpit.tsx` — the new client orchestrator: header + launch tracker + drawer-trigger row + two-column (creative | rail) + the `WorkspaceDrawer`. Manages which drawer is open (URL-synced, preserving `?item=` and deep-linkability).

**Reused as-is (rendered inside drawers or the cockpit):** `CampaignHeader`, `LaunchTracker` (extract it from `CampaignOverview` so it can stand alone, or render `CampaignOverview` minus the brief — see plan), `CreativeTab`, `MarkConversation`, `ApprovalsTab`, `PerformanceTab`, `AuditLog`, `DispatchPanel`, `CampaignMediaBoard`, `CampaignEconomicsPanel`, `AudienceLeadsTab`, the `FullBrief`.

**Changed:**
- `src/app/campaigns/_components/campaign-workspace.tsx` — becomes a thin wrapper that renders `CampaignCockpit` (or is replaced by it). The 7-tab `role=tablist` block is removed.
- `src/app/campaigns/[campaignId]/page.tsx` — economics moves into the cockpit's drawer set, so the page renders just `<CampaignCockpit detail … dispatches … economics … />` (passing economics down) instead of `<CampaignWorkspace/>` + a separate `<CampaignEconomicsPanel/>` below.

## What we explicitly keep (in drawers)

Talk to Arc, Decision log (+ history + `?item=` deep-link), Measurement, Audit, Dispatch, Media, Economics, full brief/audience/sources. None deleted — all reachable in one click.

## Non-goals

- No read-model / server-action / persistence changes. This is presentation-layer re-composition.
- No change to per-piece approval or launch logic.
- No new dependencies; CSS-only motion; Signal tokens only.

## Testing

- Reuse: existing tab-content components keep their behavior (already covered by their own logic/tests where present).
- New pure bits: if `CockpitRail` derives any non-trivial display strings, isolate them in a tiny tested helper (mirroring `library-model.ts`). Otherwise manual.
- Drawer open/close state mapping (which trigger → which panel, URL sync, `?item=` → Decision log) — extract to a small pure mapper with unit tests.
- Manual: load a campaign; confirm decide-per-piece + launch still work; every drawer opens the right panel; deep-link `?item=` opens Decision log; mobile stacks sanely; reduced-motion safe.

## Review gate

Spec to be reviewed before the plan. The earlier-deferred agent-name threading for the campaigns "Talk to {agent}" label (from Sub-project 1) lands here, since this reworks that surface.
