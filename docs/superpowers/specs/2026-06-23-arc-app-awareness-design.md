# Arc App Awareness + Settings Reach — Slice 1 Design

**Date:** 2026-06-23
**Status:** Approved (design), pending implementation plan
**Author:** Arc / Evan

## Problem

Arc should "properly navigate the app — understanding image libraries, brand, CRM, personas, the brain, settings, literally everything." Today its reach is real but uneven, and there is no unifying layer that tells Arc what the app *is* or where things live.

Concretely, Arc's runner (`apps/arc-runner/src/tools/`) can read CRM, the brain, campaigns/approvals, performance, persona intelligence, vault notes, recent activity, brand documents, and library media, and can write (act/draft) CRM records, brain notes, interactions, campaign drafts, media, and brand proposals. But:

- **Settings / workspace config is invisible.** There is no `/api/v1/arc/settings` or `/api/v1/arc/workspace` route and no runner tool. Arc cannot see connected channels/connectors, brand-kit active-vs-draft status, the compliance/restricted-claims list, team/roles, approval-strictness defaults, media-model config, or persona configuration. The Settings page is genuinely deep (`connectors-panel`, `connections-panel`, `brand-kit-settings`, `agent-behavior-settings`, `media-models-settings`, `workspace-team-settings`, `system-status`) and Arc is blind to all of it.
- **The system prompt overclaims.** `prompt.ts` states the business context includes "connected channels, and compliance rules," but the only context Arc receives is the compressed 5-field business block from `GET /api/v1/arc/brand/context` (`resolveBusinessContext`). Arc is told it knows things it has no tool to fetch.
- **There is no canonical app map.** Arc emits `href`s ad hoc inside cards but has no source of truth for the app's surfaces, their routes, or which tool serves which domain. It cannot reliably route the operator ("go to Settings → Brand Kit to activate") or pick the right tool for a domain it has not been explicitly prompted about.

This is the spine slice. It does **not** by itself add the Library folder tree, persona playbooks, or full brain memory — those are tracked as later slices and plug into the registry this slice creates.

## Goal (direction)

Arc knows the **whole app's map**, where every capability lives, and has **baseline live awareness** of workspace state every turn — so "I can't see that" / "I don't know where that is" refusals disappear and Arc can wayfind the operator to the right surface. This serves the standing `arc-full-readwrite-direction`: full read/write participant across the app, brain-first, human-in-the-loop.

"Navigate" means **awareness + reach + wayfinding via APIs and deep-links** — explicitly **not** literal UI automation (clicking through pages). Arc is a backend control-plane agent under a human-in-the-loop rule; driving outbound UI controls would break that principle.

## Non-negotiable boundary

Slice 1 is **read-only plus wayfinding**. No new write or outbound capability. Settings *writes* — activating a brand kit, connecting/disconnecting a connector, changing approval strictness, editing team — stay **human-only** and are out of scope. Reading settings is approval-safe; changing them is not, and several settings (connector activation, brand-kit activation) are deliberately human gates elsewhere in the product.

## Approach

Make Arc app-aware via a **typed registry + a read tool + a live per-turn briefing** (chosen over a static prompt block, which goes stale and can't carry live state, and over runtime introspection, which is brittle/YAGNI when the surface is known statically).

New awareness data rides the **existing context plumbing**: the runner already fetches `GET /api/v1/arc/brand/context` each turn via `resolveBusinessContext` and injects it through `buildSystemPrompt`. The workspace-state briefing is fetched and injected the same way; the detailed settings tool and the app-map tool follow the existing `tool()/runTool(step, …)` + bearer-gated `/api/v1/arc/*` route patterns. Aggregation logic lives in a `src/lib/<feature>/` read-model, matching the reference shape (`lib read-model → api route → arc-runner tool`).

## Components

### 1. App-map registry (`apps/arc-runner/src/app-map.ts`)

A typed, runner-local source of truth for the app's surfaces:

```ts
type ArcSurface = {
  id: string;          // "crm" | "library" | "brand" | "personas" | "brain"
                       // | "settings" | "campaigns" | "opportunities" | "performance"
  label: string;       // "CRM"
  purpose: string;     // one line: what this surface is for
  route: string;       // "/crm" — deep-link base the operator can be sent to
  reads: string[];     // tool names Arc uses to read here
  writes: string[];    // tool names Arc uses to write/propose here (may be empty)
  approval: "read_only" | "direct_write" | "proposes_to_approval";
};
```

Covers all current surfaces: CRM, Library, Brand, Personas, Brain, Settings, Campaigns, Opportunities, Performance. Routes mirror the app's real nav (the rendered nav lives in `console-frame.tsx` per memory `nav-lives-in-console-frame` — mirror it, don't import it).

**Drift guard:** a unit test asserts every tool name referenced in `reads`/`writes` exists in the real tool registry (built from `toolsForMode`/`allowedToolNames`). This is the same drift class as memory `arc-tool-db-enum-drift` — fail it at test time, not as a runtime surprise. A surface only lists tools that exist *today*: e.g. `settings` lists `get_workspace_settings` (new this slice) and `personas` lists the existing `read_persona_intelligence`; surfaces whose richer tools land in later slices (e.g. Library's folder tree, persona playbooks) carry only their current tools, and a surface with none yet carries an empty array — also asserted, so the entry exists before its tools do.

### 2. `get_app_map` tool (`apps/arc-runner/src/tools/app-map.ts`)

Read tool, available in **every mode**. Returns the registry plus a short "how to use me" note so Arc can:

- answer "where do I do X / take me to Y,"
- pick the right tool for a domain, and
- deep-link the operator via `route` (rendered as a clickable `emit_card` result row).

No app route needed — the registry is runner-local static data.

### 3. Live workspace-state briefing

New aggregation route **`GET /api/v1/arc/workspace`** (bearer-gated, `isSupabaseAdminConfigured()` guard, `503 not_configured` fallback — same contract as sibling `/api/v1/arc` routes), backed by a new read-model `src/lib/workspace/summary.ts`. Returns a compact snapshot:

- brand kit: `active | draft | none`
- connectors: `N connected (names…)`, `M available`
- library: `N assets available to Arc`
- approvals: `N pending`
- personas: `N configured`
- channels configured

The runner fetches it like `resolveBusinessContext` and injects a one-paragraph `WORKSPACE STATE` block into the system prompt via `buildSystemPrompt`. **Fails silently to omitted** on any error (mirrors the `NEUTRAL_CONTEXT` fallback) so a workspace outage never breaks a turn. Kept compact — it rides every turn including the Haiku "fast" route.

### 4. `get_workspace_settings` tool (`apps/arc-runner/src/tools/settings.ts`)

Read tool, available in **every mode**. The on-demand detailed version of the briefing: full connector list + connection status, brand-kit details (active/draft, palette, identity), compliance / restricted-claims list, team members + roles, approval strictness, media-model configuration, persona configuration summary. Backed by the same `/api/v1/arc/workspace` route with a `detail=full` param (or a sibling `detail` shape). **Read-only.**

### 5. Prompt + skills updates (`apps/arc-runner/src/prompt.ts`, `skills.ts`, `context.ts`)

- Replace the line that *asserts* Arc knows "connected channels, and compliance rules" with the truth: a pointer to `get_workspace_settings` and the `WORKSPACE STATE` block.
- Add a short **wayfinding instruction**: use `get_app_map` to know the app's surfaces and routes; when telling the operator where to go, deep-link via the surface `route` (and prefer an `emit_card` result row over prose).
- Register `get_app_map` and `get_workspace_settings` in the relevant skills' `allowedTools` (at minimum `opportunity-discovery` and `approval-gated-drafting`; `get_app_map` is harmless everywhere).
- Add the `WORKSPACE STATE` block to `buildSystemPrompt`'s composed parts and thread the fetched summary through `ArcTurnContext`.

### 6. Wiring in the runner (`apps/arc-runner/src/tools/index.ts`)

Add `get_app_map` and `get_workspace_settings` to `readTools(...)` so they are present in every mode. No write/draft registration — Slice 1 adds no writes.

## Out of scope (YAGNI / later slices)

- **Slice 2 — Library folder tree:** read tree + approval-gated `create_folder`/`move_asset`. Plugs into the registry's `library` surface.
- **Slice 3 — Persona playbooks:** `get_persona` (full angle/proof/CTA/message) + propose persona edits (approval-gated). Plugs into the `personas` surface.
- **Slice 4 — Brain as full memory:** CRM→Brain ingestion + semantic retrieval (already a tracked initiative; `brain-as-arc-memory-initiative`).
- **Any settings writes** — connector activation, brand-kit activation, approval-strictness changes, team edits. Human-only.
- Literal UI automation / browser driving.
- Serving the app-map from a shared route for the UI to consume (runner-local registry is sufficient now).

## Testing

- **Registry drift test:** every tool name in `app-map.ts` `reads`/`writes` exists in the real tool registry; every nav surface has a registry entry.
- **Tool tests** (mock `ArcClient`, mirror existing `*.test.ts`): `get_app_map` returns the registry; `get_workspace_settings` calls `/api/v1/arc/workspace?detail=full` and shapes the result; both report running→done steps.
- **Route contract:** `GET /api/v1/arc/workspace` returns the compact snapshot and the `detail=full` shape; bearer enforcement; `503 not_configured` when Supabase admin is unset.
- **Context injection:** `buildSystemPrompt` includes a `WORKSPACE STATE` block when a summary is present and omits it cleanly when absent.
- **Prompt/registry presence:** `get_app_map` + `get_workspace_settings` present in ask/scan/act/draft.
- `pnpm lint` (scoped to changed files — memory `pnpm-lint-scans-vendor`), `tsc`/`pnpm build` for types (memory `lint-does-not-typecheck`).

## Risks

- **Overclaim regression:** the prompt currently lies about Arc's knowledge; verify the new `WORKSPACE STATE` block + `get_workspace_settings` actually back every claim the prompt makes, so we don't trade one overclaim for another.
- **Token cost of per-turn injection:** keep `WORKSPACE STATE` to one short paragraph; it rides the Haiku fast route too.
- **Registry drift:** mitigated by the drift test; without it, a renamed tool or new nav surface silently desyncs the map (memory `arc-tool-db-enum-drift`, `nav-lives-in-console-frame`).
- **Workspace summary cost/latency:** the briefing fetch runs every turn — keep the read-model cheap (counts/status, not full record loads) and fail silently on error so a slow/unavailable workspace never blocks a turn (memory `supabase-unreachable-slow-loads`).
- **Prod schema/route skew:** new route must deploy with/before the runner; runner falls back silently if the route 404s on an older app deploy (memory `vercel-deploy`, `prod-schema-drift`).
