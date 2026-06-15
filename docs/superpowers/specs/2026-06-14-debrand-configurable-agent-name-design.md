# De-brand the Agent to a Configurable Name

**Date:** 2026-06-14
**Status:** Approved (pending spec review)

## Problem

The product hardcodes the agent persona name **"Mark"** in hundreds of user-facing
strings. The app is meant to be a broad, resellable product for other tenants, so
the agent's display name must be **operator-configurable**, not baked into copy.
A `assistantName` setting and resolver helpers already exist, but the UI ignores
them and renders the literal string "Mark" everywhere.

## Goal

Every **user-facing** "Mark" string renders the operator-configured agent name.
When no name is configured, the default is the generic **"Agent"** (editable in
Settings). Nothing about the internal worker identity ("Hermes"), code
identifiers, routes, module names, or env vars changes.

## Scope

### In scope (user-facing copy only)
- Hardcoded "Mark" in **rendered strings**: JSX text, `aria-label`, `title`,
  `placeholder`, `EmptyState` titles/details, `PageHeader` titles/descriptions,
  button labels, and copy produced by lib/domain functions that returns
  **displayed** strings (e.g. `lib/activity/read-model`, `lib/mark-chat/notify`,
  `lib/mark-chat/status-log`).
- Gendered pronouns referring to the agent ("he/him/his") → neutral phrasing.
- The shipped **default** name: `"Mark"` → `"Agent"` in the three fallback sites.
- Demo/preview framing copy (`src/app/mark/_data/demo.ts`).

### Explicitly out of scope
- The internal worker name **"Hermes"** (API tokens, orchestrator, runner contract).
- Code identifiers, file/module names (`mark-chat`, `agent-config`), the `/mark`
  route URL, the `/api/v1/hermes/*` namespace, env var names (`MARK_DISPLAY_NAME`,
  `MARK_RUNNER_URL`, `HERMES_AGENT_API_TOKEN`).
- Internal code comments.
- Test **fixture data** that is never rendered (e.g. domain tests using "Mark"
  as a sample actor). Tests that assert on **rendered copy** are updated.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Depth | User-facing copy only |
| Hermes | Leave as-is (internal worker identity) |
| Default name | `"Agent"` |
| Pronouns | Neutralize to "the agent" / "it" / "they" |

## Architecture

The configuration layer already exists and is the foundation:
- `AppSettings.assistantName` (persisted in `app_settings` k/v table) — operator-editable.
- `getAgentDisplayName(override)` resolves: DB override → `MARK_DISPLAY_NAME` env → fallback.
- `agentProfile(rawName)` derives `{ name, shortName, monogram }`.
- The root layout (`src/app/layout.tsx`) already fetches settings and passes
  `agentName={getAgentDisplayName(settings.assistantName)}` into the persistent
  `ConsoleFrame`.

We extend this with two thin distribution mechanisms so no component has to
hardcode "Mark":

### 1. Client side — context provider (chosen approach)
`ConsoleFrame` is a `"use client"` component rendered **once** in the root layout
and already receives `agentName`. Host an `AgentNameProvider` there, wrapping
`children`, exposing a `useAgentName()` hook. Any client component under the shell
reads the configured name with zero prop-drilling.

- New file: `src/app/_components/agent-name-context.tsx` —
  `AgentNameProvider` + `useAgentName(): string` (defaults to `"Agent"` if used
  outside a provider, so isolated previews don't crash).
- `console-frame.tsx` wraps its returned tree in `<AgentNameProvider value={agentName}>`.

### 2. Server side — cached helper
Server components fetch directly (existing pattern). Add a `cache()`-wrapped
helper so repeated reads within a single request collapse to one Supabase query:

- New export (in `src/lib/settings/store.ts` or a small `agent-name.ts`):
  `getAgentName(): Promise<string>` = `getAgentDisplayName((await getAppSettings()).assistantName)`,
  wrapped in React `cache()`.
- Server components that render agent copy call `await getAgentName()` and
  interpolate it instead of writing the literal "Mark".

### Rejected approaches
- **Prop-drill `assistantName` everywhere** — touches far more call sites, bloats
  component signatures, and duplicates what context/cache solve cleanly.
- **Static find-replace `"Mark"→"Agent"`** — destroys customizability, which is
  the entire point.

## Default-name flip (3 sites)

1. `DEFAULT_APP_SETTINGS.assistantName`: `"Mark"` → `"Agent"` (`src/lib/settings/store.ts`).
2. `getAgentDisplayName(...)` fallback: `|| "Mark"` → `|| "Agent"` (`src/lib/mark-chat/agent-config.ts`).
3. `agentProfile(...)` fallback: `|| "Mark"` → `|| "Agent"` (`src/lib/mark-chat/agent-config.ts`).

`getMarkDisplayName()` (function name) stays — internal identifier, not user-facing.

## Copy migration

Work surface-by-surface. For each rendered "Mark" literal:
- **Client component** → use `useAgentName()`; interpolate (`` `Ask ${name}` ``).
- **Server component** → `await getAgentName()`; interpolate.
- **lib/domain string producers** → accept the name as a parameter from the caller
  (which has it via hook/helper) rather than reading settings deep in pure logic;
  keep `src/domain/` free of I/O per the layering convention.

Surfaces (non-exhaustive; the implementation plan enumerates files):
- `src/app/agent-operations/**` (heavy: page, task board, kanban, ticket panels)
- `src/app/mark/**` (chat, composer, empty states, drawers)
- `src/app/campaigns/**` (mark-conversation, reasoning/creative tabs, audit log)
- `src/app/approvals/**`, `src/app/board/**`, `src/app/_components/**`
- `src/lib/activity/read-model`, `src/lib/mark-chat/{notify,status-log,inbox,enqueue}`
- `src/app/mark/_data/demo.ts` (preview framing copy → "Agent")

### Pronoun neutralization
Rewrite agent-referring gendered copy to neutral form during each swap:
- "what data **he** touched" → "what data **the agent** touched"
- "Mark should write run logs as **he** claims" → "the agent writes run logs as **it** claims"
- "Humans approve before **he** sends" → "Humans approve before the agent sends"

## Data flow

```
app_settings (Supabase)
  └─ getAppSettings().assistantName
       └─ getAgentDisplayName()  ──►  getAgentName() [cache]  ──►  server components
                                 └──►  layout → ConsoleFrame → AgentNameProvider ──► useAgentName() ──► client components
```

No new tables, migrations, or env vars. Degrades to "Agent" when Supabase is
unconfigured (existing graceful-degradation path).

## Error handling

- Unchanged graceful degradation: if `getAppSettings()` fails or Supabase is
  unconfigured, it returns defaults → name resolves to "Agent".
- `useAgentName()` outside a provider returns `"Agent"` rather than throwing, so
  standalone component previews/tests don't break.

## Testing

- Update tests that assert on **rendered copy** containing "Mark" to expect the
  new default "Agent" (or the injected name).
- Leave domain/lib tests that use "Mark" purely as **sample actor data** unchanged.
- New unit coverage: `agentProfile`/`getAgentDisplayName` return "Agent" on empty
  input; `useAgentName()` returns provider value and the "Agent" fallback.
- Verify: `pnpm test` (full) and `pnpm build` (type-check — `pnpm lint` does NOT
  type-check, per project memory). Scope eslint to changed files (lint scans vendor).

## Risks

- **Breadth:** ~190 files contain word-boundary "Mark". Most are mechanical,
  single-pattern swaps; risk is omission, not complexity. Mitigate by working
  route-by-route and re-grepping `\bMark\b` in `src/app` for rendered literals at
  the end.
- **False positives:** "Market", "marketing", "Markdown", "watermark" must not be
  touched — only the standalone agent name.
- **Over-reach:** resist renaming identifiers/files/routes; scope is copy only.
