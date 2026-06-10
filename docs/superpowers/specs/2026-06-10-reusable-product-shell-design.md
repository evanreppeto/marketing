# Reusable Product Shell — Design

**Date:** 2026-06-10
**Status:** Approved design, pending spec review
**Sub-project 1 of 2** (the second, Campaigns Workspace simplification, is scoped at the end as a follow-up.)

## Goal

Make the app shell feel like a *product* that any customer could adopt by connecting their own Hermes agent — while staying inside the existing Signal design system (obsidian/gold tokens, `theme.ts`, `nav-icons.tsx`, CSS-only motion). Three pieces:

1. A **collapsible icon-rail sidebar** — more room for content, more "product."
2. **Agent identity as configuration** — de-hardcode "Mark" so a customer's agent name flows through the whole UI.
3. A **connect-your-agent onboarding state** — the literal "all you do is connect your agent" hook.

This originated from a magic-MCP (21st.dev) sidebar component the user liked. The component itself is **not** integrated — it is generic shadcn (framer-motion, lucide, blue accents, white/black surfaces, duplicate primitives) and violates ~6 `DESIGN.md` rules. The workflow we adopt instead: **harvest the pattern, rebuild on Signal tokens.** No new dependencies are added.

## Non-goals

- No shadcn/ui adoption, no `framer-motion`, no `lucide-react`. Motion stays CSS-only.
- No change to the campaigns workspace (that is Sub-project 2).
- No backend/auth changes beyond reading existing config to detect agent connection state.

## Current state (what we're changing)

- `src/app/_components/console-frame.tsx` — the persistent chrome, rendered once in the root layout. Holds the brand wordmark, `<SideNav>`, and `<OperatorProfile>` inside an `<aside className={theme.shell.sidebar}>`. Layout grid is `lg:grid-cols-[280px_minmax(0,1fr)]` (`theme.shell.layout`).
- `src/app/_components/side-nav.tsx` — renders nav items as full-width `Link`s (icon + label), with pending/prefetch state and the active treatment (`bg-surface-raised` + `shadow-[inset_3px_0_0_var(--accent)]`).
- `src/app/_components/nav-icons.tsx` — hand-rolled SVG line icons (`currentColor`, 24 viewBox, 1.75 stroke).
- Nav items today (in `console-frame.tsx`): **Mark** (`/mark`) and **Campaigns** (`/campaigns`).
- "Mark" is hardcoded in: the nav label + brand aria-label (`console-frame.tsx`), the campaigns workspace tab "Talk to Mark" (`campaign-workspace.tsx`), `MarkConversation`, and various copy.
- Hermes agent connection is gated by `HERMES_AGENT_API_TOKEN` (validated via `checkBearerToken` in `src/lib/auth/api-token.ts`); `src/app/settings/system-status.tsx` already surfaces configuration status.

## Design

### Unit 1 — Collapsible icon-rail sidebar

**What it does:** The sidebar defaults to a compact ~56px icon rail and expands to ~240px on hover or keyboard focus-within, revealing labels. A pin toggle locks it open; the preference persists in `localStorage`.

**Behavior**
- **Collapsed (default):** icon-only. Brand → "BS" monogram. `OperatorProfile` → avatar tile only. Each nav icon exposes its label via an accessible tooltip (native `title` + `aria-label`) so collapsed nav stays usable.
- **Expanded (hover / focus-within / pinned):** full wordmark, nav labels, full operator profile — i.e. today's appearance.
- **Pin toggle:** a small control at the rail foot toggles `pinned` (persisted). Pinned = always expanded; unpinned = hover-to-expand. Default unpinned.
- **Active item:** unchanged gold treatment (`shadow-[inset_3px_0_0_var(--accent)]`), visible in both states.
- **Motion:** CSS transition on the grid column width + label opacity. `prefers-reduced-motion` → no width animation (instant snap), labels still toggle. No hover levitation, no glow (per `DESIGN.md` §6/§8).
- **Mobile:** below `lg` the shell is already a horizontal scroll strip; the collapse behavior is desktop-only (`lg:`). Mobile is unchanged.

**How it's used:** Rebuild within `console-frame.tsx` + `side-nav.tsx`. Introduce a small client state holder (collapsed vs expanded vs pinned) in `ConsoleFrame`. `theme.shell.layout` grid becomes responsive to the collapsed/expanded width (e.g. swap the fixed `280px` column for a CSS variable driven by state). `SideNav` gains a `collapsed` prop that controls label rendering + tooltips. No change to `nav-icons.tsx`.

**Depends on:** `theme.ts` shell tokens, `nav-icons.tsx`, `localStorage` (guarded for SSR).

**Accessibility:** focus-within expands the rail so keyboard users always see labels; tooltips cover pointer users in collapsed state; pin toggle is a real `<button>` with `aria-pressed`.

### Unit 2 — Agent identity as configuration

**What it does:** Provides one source of truth for the agent's presentation so "Mark" is no longer hardcoded.

**Shape:** `src/lib/agent/profile.ts` exporting `getAgentProfile(): AgentProfile` where
`AgentProfile = { name: string; shortName: string; monogram: string }`.
Default `{ name: "Mark", shortName: "Mark", monogram: "M" }`. Overridable via env (e.g. `NEXT_PUBLIC_AGENT_NAME`) with the default applied when unset — so existing behavior is byte-identical until a customer overrides it.

**How it's used:** Replace hardcoded "Mark" strings in the nav label, brand aria-label, the campaigns "Talk to {name}" tab, and `MarkConversation` headers with values from the profile. The nav icon `"mark"` stays (it's a message-square glyph, agent-agnostic).

**Depends on:** env / a future settings record. Pure read; no I/O beyond env access.

**Boundary check:** consumers read `getAgentProfile()` and never hardcode the name; the internals (env vs settings table later) can change without touching consumers.

### Unit 3 — Connect-your-agent onboarding state

**What it does:** When no Hermes agent is configured, the app surfaces a clean onboarding panel guiding the operator to connect one — instead of silently degrading.

**Detection:** a server-side guard `isAgentConnected()` (in `src/lib/agent/`) returning whether `HERMES_AGENT_API_TOKEN` (and any required endpoint env) is present — mirroring the existing `isSupabaseAdminConfigured()` pattern.

**Surface:** a single reusable `ConnectAgentPanel` component (composed from the shared `EmptyState` primitive) titled "Connect your {agentName}", with the concrete steps (set the bearer token + endpoint, verify via the existing Hermes `ping`/`health` route) and a link to `settings/system-status`. It renders in exactly two places: (1) on the Mark surface and the Campaigns library when `isAgentConnected()` is false, replacing those routes' normal empty states; and (2) as a block in `settings/system-status`. One component, two mount points — no third variant.

This reuses `settings/system-status.tsx`'s existing status logic rather than re-deriving it.

**Depends on:** existing Hermes env + `system-status` read logic. No new auth surface.

## Data flow

1. Root layout renders `ConsoleFrame` (server) → reads `getAgentProfile()` + `isAgentConnected()` server-side, passes them as props into the client chrome.
2. Client `ConsoleFrame` manages collapse/pin UI state (`localStorage`), renders `SideNav` with `collapsed` + agent label.
3. Page content (Mark, Campaigns) reads `isAgentConnected()` to decide between normal content and the connect-your-agent panel.

## Error / edge handling

- `localStorage` unavailable (SSR / privacy mode): default to unpinned/hover behavior; never throw.
- Agent name unset: default "Mark" — no visual change from today.
- Reduced motion: honored (no width animation).
- Connected-but-misconfigured (token set, endpoint missing): `isAgentConnected()` requires both, so partial config still shows onboarding.

## Testing

- `getAgentProfile()` — unit tests: default when env unset, override when set.
- `isAgentConnected()` — unit tests: false when token/endpoint missing, true when both present.
- Sidebar collapse logic (pure helper for width/label state from `{collapsed, pinned, hovered, focusWithin}`) — extract to a tested pure function (`sidebar-state.ts`), mirroring how `library-model.ts` / `status-tone.ts` isolate logic from the component.
- Manual: keyboard focus expands rail; tooltips present collapsed; reduced-motion snaps; mobile unaffected.

## Magic-MCP workflow (documented outcome)

The repeatable pattern this establishes, for future component harvesting:
1. Generate/inspect the magic component for its **structure and interaction idea** only.
2. Re-implement on Signal primitives (`theme.ts`, `page-header.tsx`, `nav-icons.tsx`), never importing its deps.
3. Drop generic concerns (shadcn primitives, framer-motion, lucide, foreign palette).

## Sub-project 2 (follow-up, not in this spec)

**Campaigns Workspace simplification.** Locked direction for when we spec it:
- **Library → light Inbox triage** — process the awaiting-approval queue (next/skip), not one campaign at a time.
- **Workspace → Decision Cockpit** — single screen: creative centered, decision rail (why/who/risk + approve/decline/revise) beside it; collapse today's 7 tabs.
- **Talk to {agent} → slide-over drawer** — folds in the conversation-led idea without betting the primary UI on it.
- Secondary views (Record = decision log + audit merged; Measurement) move to drawers/sections. Presentation-layer only; no read-model changes.

This gets its own spec → plan cycle after the shell ships.
