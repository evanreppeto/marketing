# Reusable Product Shell — Design

**Date:** 2026-06-10
**Status:** Approved design, pending spec review
**Sub-project 1 of 2** (the second, Campaigns Workspace simplification, is scoped at the end as a follow-up.)

## Goal

Make the app shell feel like a *product* that any customer could adopt by connecting their own Arc agent — while staying inside the existing Signal design system (obsidian/gold tokens, `theme.ts`, `nav-icons.tsx`, CSS-only motion). Four pieces:

1. A **collapsible icon-rail sidebar** — more room for content, more "product."
2. **Agent identity as configuration** — the agent's name flows through the UI from one place, and is operator-editable.
3. A **connect-your-agent onboarding state** — shown where work would appear when no agent is wired.
4. An **Agent settings drawer in the Arc tab** — configure/connect the agent in context.

This originated from a magic-MCP (21st.dev) sidebar component the user liked. The component itself is **not** integrated — it is generic shadcn (framer-motion, lucide, blue accents, white/black surfaces, duplicate primitives) and violates ~6 `DESIGN.md` rules. The workflow we adopt instead: **harvest the pattern, rebuild on Signal tokens.** No new dependencies are added.

## Non-goals

- No shadcn/ui adoption, no `framer-motion`, no `lucide-react`. Motion stays CSS-only.
- No change to the campaigns workspace (that is Sub-project 2).
- **No in-UI secret entry.** Agent credentials (`ARC_AGENT_API_TOKEN`, `ARC_RUNNER_URL`/`ARC_WEBHOOK_URL`) stay in env per the existing architecture. The Arc drawer shows their status and setup instructions and lets the operator edit the display *name* — it does not store secrets in the DB. (Full in-UI credential storage is a deferred follow-up; see end.)

## Reconcile with existing code (important)

The codebase **already has** an agent-config seam — `src/lib/arc-chat/agent-config.ts`:
- `getMarkDisplayName()` → `ARC_DISPLAY_NAME` env, default `"Arc"`. Comment: "surfaced in the UI from ONE place… so a different workspace can point the same UI at their own Arc agent."
- `isMarkRunnerConfigured()` → true when `ARC_RUNNER_URL` / `ARC_WEBHOOK_URL` is set.
- `markAgentKeys()` → `ARC_AGENT_KEY`, default `["arc","arc"]`.

And the Arc surface already renders `MarkConnection` (a live attached/not-attached pill polling `getMarkAgentStatusAction()`), and `getAppSettings()` already persists operator-editable prefs (`workspaceName`) in `app_settings`.

**We extend these rather than duplicate them.** No new `src/lib/agent/` connection module; reuse `agent-config.ts`.

## Current state (what we're changing)

- `src/app/_components/console-frame.tsx` — persistent chrome (brand wordmark, `<SideNav>`, `<OperatorProfile>`), grid `lg:grid-cols-[280px_minmax(0,1fr)]`. Nav items: **Arc** (`/arc`), **Campaigns** (`/campaigns`).
- `src/app/_components/side-nav.tsx` — full-width icon+label `Link`s with the active gold inset.
- `src/lib/arc-chat/agent-config.ts` — the agent identity/connection seam (above).
- `src/lib/settings/store.ts` — `app_settings` read/merge; `saveAppSettings`. `src/app/settings/app-settings-actions.ts` — `saveGeneralSettingsAction` (the form-action pattern to mirror).
- `src/app/arc/_components/arc-connection.tsx` + `src/app/arc/actions.ts` `getMarkAgentStatusAction()` — live connection signal.
- `src/app/settings/system-status.tsx` — health rows (already shows "Arc agent API" via `ARC_AGENT_API_TOKEN`).

## Design

### Unit 1 — Collapsible icon-rail sidebar

**What it does:** The sidebar defaults to a compact ~72px icon rail and expands to ~280px on hover or keyboard focus-within, revealing labels. A pin toggle locks it open; the preference persists in `localStorage`.

**Behavior**
- **Collapsed (default):** icon-only. Brand → "BS" monogram. `OperatorProfile` → avatar only. Each nav icon exposes its label via tooltip (`title` + `aria-label`).
- **Expanded (hover / focus-within / pinned):** full wordmark, labels, full operator profile (today's look).
- **Pin toggle:** a foot control toggles `pinned` (persisted). Default unpinned.
- **Active item:** unchanged gold treatment.
- **Motion:** CSS transition on the grid column width + label opacity. `prefers-reduced-motion` → no width animation. No hover levitation/glow.
- **Mobile:** below `lg` the shell is already a horizontal strip; collapse is desktop-only (`lg:`). Mobile unchanged.

**How it's used:** Rebuild within `console-frame.tsx` + `side-nav.tsx`. Pure helper `isSidebarExpanded({pinned,hovered,focusWithin})` + `localStorage` pin helpers extracted to `sidebar-state.ts` (tested), mirroring how `library-model.ts` isolates logic.

### Unit 2 — Agent identity as configuration (built on `agent-config.ts`)

**What it does:** One resolved agent display name flows through the shell, and the operator can edit it.

- **Resolver:** `getAgentDisplayName(settings)` = `settings.agentName.trim() || getMarkDisplayName()`. Precedence: operator-set value (DB) → `ARC_DISPLAY_NAME` (env) → `"Arc"`. Lives in `agent-config.ts` (sync core stays; add a small resolver that takes settings).
- **Editable:** add `agentName` to `AppSettings` (default `""` so an unset value falls through to env). New `saveAgentNameAction` mirrors `saveGeneralSettingsAction` (operator-gated, persists key `agent_name`, revalidates `/` layout + `/arc`).
- **Profile derivation:** pure `agentProfile(name)` → `{ name, shortName, monogram }` for the nav label + brand monogram. New, no duplication.
- **Threads through now:** the shell nav label + brand monogram (server layout resolves the name and passes it into `ConsoleFrame`). The campaigns "Talk to Arc" rename is deferred to Sub-project 2 (which reworks that tab).

### Unit 3 — Connect-your-agent onboarding state

**What it does:** When no agent connection is configured, surface a clean onboarding panel instead of an empty/dead surface.

- **Detection:** add `isAgentConfigured()` to `agent-config.ts` = `isMarkRunnerConfigured() || Boolean(env.ARC_AGENT_API_TOKEN?.trim())` — "some agent link exists." Reuses the existing runner check; no parallel module.
- **Surface:** a single reusable `ConnectAgentPanel` (composes the shared `EmptyState`) titled "Connect your {agentName} agent", with setup steps (env credentials), a link to System status, and — on Arc — a button to open the Agent settings drawer (Unit 4). It renders in two config surfaces: the **Campaigns library** (when `!isAgentConfigured()` and no campaigns) and a block in **`settings/system-status`** (when unconfigured). One component, reused.

### Unit 4 — Agent settings drawer in the Arc tab

**What it does:** Lets the operator configure/connect their agent in context, from the Arc surface — the "connect your Arc agent" entry point the product needs.

- **Entry point:** a gear `IconButton` (existing component) in the Arc surface header, beside the `MarkConnection` pill. Opens a slide-over drawer (uses `theme.shell.overlay` + a right-anchored panel; CSS-only, Escape + backdrop-click close, focus-trapped).
- **Drawer contents (lightweight scope):**
  1. **Live status** — reuse the `MarkConnection` signal / `getMarkAgentStatusAction()`: attached vs. queueing.
  2. **Display name** — an editable field (mirrors `GeneralSettingsForm`) that saves via `saveAgentNameAction`. The one truly editable setting.
  3. **Connection checklist (read-only)** — Runner endpoint (`isMarkRunnerConfigured()`), Agent API token (`ARC_AGENT_API_TOKEN` presence) — each a ✓/✗ row with the env var to set and a one-line how-to.
  4. **Link** to full System status.
- **Explicitly not here:** pasting a token/endpoint that persists to the DB. That's the deferred follow-up. The drawer says so plainly ("Credentials are set via environment variables for security").

## Data flow

1. Root layout (server) resolves `getAgentDisplayName(await getAppSettings())` → `agentProfile(name)` → passes `agentName`/`agentMonogram` into `ConsoleFrame` (client).
2. `ConsoleFrame` manages collapse/pin UI state (`localStorage`); renders `SideNav` with `collapsed` + the agent label.
3. Campaigns + System status call `isAgentConfigured()` to choose normal content vs. `ConnectAgentPanel`.
4. Arc surface renders the gear → drawer; the drawer reads status via `getMarkAgentStatusAction()` and saves the name via `saveAgentNameAction`.

## Error / edge handling

- `localStorage` unavailable: default unpinned/hover; never throw.
- Agent name unset (DB + env): default "Arc" — no visual change.
- Reduced motion: honored.
- Save name with Supabase unconfigured: action returns the existing "not configured" state (same as `saveGeneralSettingsAction`).
- Drawer with no agent attached: status shows "not attached"; checklist shows what's missing — exactly the connect path.

## Testing

- `agentProfile()` — defaults to Arc/M; first-word shortName; uppercase monogram; trims; non-alnum leading char.
- `getAgentDisplayName(settings)` — DB value wins; falls back to env; falls back to "Arc".
- `isAgentConfigured(env)` — false when nothing set; true when runner OR token set.
- `app_settings` merge — `agentName` defaults to `""` and reads `agent_name`.
- Sidebar pure helper (`isSidebarExpanded`, pin read/write) — truth table + null-storage safety.
- Manual: rail collapse/hover/focus/pin/persist; reduced-motion snap; onboarding gating; drawer open/close/save/Escape; mobile unchanged.

## Magic-MCP workflow (documented outcome)

1. Inspect the magic component for its **structure and interaction idea** only.
2. Re-implement on Signal primitives (`theme.ts`, `page-header.tsx`, `nav-icons.tsx`); never import its deps.
3. Drop generic concerns (shadcn primitives, framer-motion, lucide, foreign palette).

## Deferred follow-ups (not in this spec)

1. **Full in-UI credential storage** — a backend project so a customer pastes token + endpoint in the drawer and they're stored securely per-tenant (new migration, encrypted storage, rewire the Arc API + `agent-config.ts` to read per-tenant creds). Its own spec/plan; real security work. The Unit 4 drawer is built to grow into this.
2. **Campaigns Workspace simplification (Sub-project 2).** Locked direction: Library → light Inbox triage; Workspace → Decision Cockpit (single screen, decision rail, collapse the 7 tabs); "Talk to {agent}" → slide-over drawer; Record (decision log + audit) and Measurement → drawers/sections. Presentation-layer only. Own spec → plan cycle. The agent-name threading (Unit 2) finishes there.
