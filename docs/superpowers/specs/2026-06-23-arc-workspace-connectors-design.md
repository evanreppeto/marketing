# Arc Workspace Connectors — Design

**Date:** 2026-06-23
**Status:** Approved direction (Approach C); Phase 1 specced in detail.

## Problem

Arc should work like the connector experience in Claude / ChatGPT / Codex: a workspace
browses a catalog, connects a provider (HubSpot, Slack, Klaviyo, Apollo, a fresh Gemini
key…), authenticates with an API key or OAuth, and the provider's capabilities become
available to Arc — scoped to that workspace, with the workspace choosing what's on.

Today that is not possible:

1. **Secrets are global env vars.** `CONNECTION_REGISTRY` (`src/domain/connections.ts`)
   and the `connections` table key off a single process-level env var per provider
   (`RESEND_API_KEY`, `META_*`…). Every workspace shares one credential. There is no
   "bring your own key."
2. **The registry is a hardcoded outbound list.** Six fixed providers
   (resend / google_drive / instagram / facebook / linkedin / x), all about *dispatch*
   (email/social) or *storage* (Drive). Connecting one does **not** give Arc new tools.
3. **No path from a connection to Arc's toolset.** Arc's tools are a fixed in-process MCP
   server (`createSdkMcpServer({ name: "arc" })` in `apps/arc-runner/src/arc.ts`). Nothing
   lets a workspace-enabled provider surface tools into a turn.

## Goal

A **workspace-scoped connector system** where connecting a provider both (a) stores its
credentials encrypted per workspace and (b) surfaces its tools to Arc at turn time —
composing with the skills gating from #209 and never violating Arc's non-negotiable rule:
**no outbound send/publish/launch/spend without explicit human approval.**

## Key decisions

### Substrate: MCP (remote HTTP/SSE)

Arc runs on the Claude Agent SDK, which already accepts external MCP servers in the same
`mcpServers` map used for the in-process `arc` server. Confirmed against the installed SDK
(`@anthropic-ai/claude-agent-sdk` → `coreTypes.d.ts`):

```ts
McpServerConfigForProcessTransport =
  | McpStdioServerConfig                       // { command, args, env }  — process, avoid
  | McpSSEServerConfig   // { type: 'sse',  url, headers? }
  | McpHttpServerConfig  // { type: 'http', url, headers? }   ← our connector shape
  | McpSdkServerConfig   // { type: 'sdk',  name }             ← today's `arc` server
```

A connector is a **remote HTTP/SSE MCP server**: a URL plus per-workspace auth injected as
`headers` (`Authorization: Bearer …`). We **avoid stdio** connectors — the runner is a
stateless Cloud Run container and should not spawn provider processes.

At turn time the runner merges enabled connectors into the existing map:

```ts
mcpServers: { arc: arcServer, ...enabledConnectorServers }
```

This is exactly how Claude/Codex do connectors; we are not inventing a transport.

### Credential vault: reuse Supabase Vault

The "encrypted per-workspace secret" primitive **already exists** in the codebase —
`src/lib/agent/secret.ts` uses `vault.create_secret` (write) and
`vault.decrypted_secrets` (read) and already scopes by `workspaceKey` / `org_id`. Connector
credentials reuse this pattern. We store a **secret ref** (uuid) on the connector row, never
the plaintext. Decryption happens **server-side in the Next.js app** (which holds the
service-role client); the stateless runner never reads the vault directly — it receives what
it needs over the existing bearer-gated `/api/v1/arc/*` channel at turn start.

### Action boundary: read-first, then approval-gated writes, never autonomous

- **Phase 1 connectors are read-only.** Their tools (search/fetch/list) run freely.
- **Phase 2 adds write/action tools, always through the approval gate.** A write tool does
  not execute directly — it stages an approval card (the campaigns/drafts pattern) and runs
  only after a human approves.
- **There is no "autonomous outbound" trust level.** This is the one place Arc must differ
  from Claude/ChatGPT, per `CLAUDE.md`.

### Composition with skills (#209)

Connector tools are just additional tool names. A skill's `allowedTools` already filters the
toolset (`filterToolsForSkill` in `apps/arc-runner/src/tools/index.ts`) and the SDK
`allowedTools` list. Connector tools flow through the same gate with **no new mechanism** —
a skill can include or exclude them like any built-in tool. Mode remains the ceiling; skill
narrows; connector enablement narrows further.

## Approaches considered

- **A — Full MCP catalog up front.** Faithful but front-loads OAuth + dynamic loading +
  write classification + approval routing simultaneously. High risk.
- **B — Curated native connectors + key vault.** Safe, controlled, but code-per-provider
  forever; not the Claude/ChatGPT experience. Rejected.
- **C — MCP catalog, read-first, phased (chosen).** A's architecture, B's caution in
  sequencing. Every phase ships something safe and usable.

## Phased plan

| Phase | Scope | Outbound risk |
|-------|-------|---------------|
| **1** | Pluggable connector registry + per-workspace credential vault + catalog UI; ship 1–2 **read-only** MCP connectors; runner loads enabled connectors per turn | none |
| **2** | Write/action tools auto-classified (read vs. write) with manual override; writes routed through the approval-card gate; per-connector enable + per-tool allowlist | gated |
| **3** | OAuth connector flows + broader catalog (HubSpot, Slack, Klaviyo, Apollo…) | gated |

---

## Phase 1 — detailed design

Ship the durable primitives and prove the end-to-end path with read-only connectors.

### 1. Schema (`supabase/migrations/`)

Today `connections` is **global** (`provider` is `unique`, no `workspace_id`). Phase 1
introduces a workspace-scoped connector model. New table rather than mutating the shipped one
(migrations are append-only; the existing `connections` table keeps serving the legacy
env-var outbound providers until Phase 2/3 fold them in).

New migration `..._workspace_connectors.sql`:

```sql
create table public.workspace_connectors (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    text not null,
  org_id          uuid,                       -- mirror the agent_connections tenancy pattern
  connector_key   text not null,              -- registry key, e.g. 'gemini-research', 'hubspot'
  enabled         boolean not null default false,
  -- non-secret config (endpoint overrides, account id, etc.)
  config          jsonb not null default '{}'::jsonb,
  -- secret ref into Supabase Vault (NOT the secret itself)
  credential_ref  uuid,
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_test_error text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, connector_key)
);
create index workspace_connectors_workspace_idx on public.workspace_connectors(workspace_id);
alter table public.workspace_connectors enable row level security;
create trigger workspace_connectors_set_updated_at
  before update on public.workspace_connectors
  for each row execute function public.set_updated_at();
```

RLS is a backstop only — the app uses the service-role client, so **every read/write path
must gate on workspace in code** (see memory: service-role bypasses RLS).

### 2. Connector registry (`src/domain/connectors.ts`)

Pure, no I/O — mirrors `src/domain/connections.ts`. Defines the **catalog** and the
credential contract per connector. Re-exported via `@/domain`.

```ts
export type ConnectorAuthKind = "api_key" | "oauth" | "none";
export type ConnectorAccess = "read_only" | "gated_write";   // Phase 1 = read_only only

export type ConnectorRegistryEntry = {
  key: string;                 // 'gemini-research', 'hubspot', …
  label: string;
  description: string;
  authKind: ConnectorAuthKind;
  access: ConnectorAccess;
  /** Remote MCP endpoint template; null for native (non-MCP) connectors. */
  mcpUrl: string | null;
  /** Which header carries the credential, e.g. 'Authorization'. */
  authHeader?: string;
  /** Tool-name prefix so connector tools are namespaced + classifiable. */
  toolNamespace: string;       // becomes the mcpServers map key
};

export const CONNECTOR_REGISTRY: ConnectorRegistryEntry[] = [ /* seed 1–2 read-only */ ];

// Pure status compute, like computeConnectionStatus:
export function computeConnectorStatus(input: {
  credentialPresent: boolean; enabled: boolean; lastTestOk: boolean | null;
}): "not_configured" | "disabled" | "error" | "connected";
```

Phase 1 seeds **1–2 read-only connectors** to prove the path end-to-end. Candidates:
a hosted read-only research/search MCP, or a read-only CRM-mirror connector. Final pick
deferred to the implementation plan.

### 3. Persistence + read-model (`src/lib/connectors/`)

Mirrors `src/lib/connections/`:

- `persistence.ts` — `upsertWorkspaceConnector`, `setConnectorEnabled`,
  `writeConnectorCredential(plaintext)` (reuses the `vault.create_secret` flow from
  `src/lib/agent/secret.ts`, returns a `credential_ref`), `recordConnectorTest`. All
  workspace-scoped via `getCurrentWorkspaceContext()`.
- `read-model.ts` — `listWorkspaceConnectors()` joins the registry (catalog) with rows
  (state) and computes status. **Never returns plaintext credentials** — only presence +
  status. Mirrors `connections/read-model.ts`.
- `resolve.ts` — `resolveEnabledConnectorServers(workspaceId)`: for each enabled connector,
  decrypt its `credential_ref` from Vault server-side and build the
  `McpHttpServerConfig` (`{ type: 'http', url, headers: { [authHeader]: `Bearer ${secret}` } }`).
  **This runs in the app, not the runner.**

### 4. API surface (`src/app/api/v1/arc/connectors/route.ts`)

Bearer-gated like the other `/api/v1/arc/*` routes (`arcGuard`). `GET` returns the enabled
connectors' **MCP server configs with credentials resolved** for the calling workspace, so
the runner can load them. This is the one place plaintext crosses the wire — over the
existing bearer-gated, server-to-server channel, same trust model as every other arc route.
No new public exposure.

Operator-facing reads/writes (catalog list, connect/disconnect, paste key, test) are
**server actions** in `src/app/settings/connectors-actions.ts`, gated by `requireOperator()`
+ `isSupabaseAdminConfigured()`, following the vault/campaigns wired-feature shape.

### 5. Runner integration (`apps/arc-runner/`)

- `connectors.ts` (new): `resolveConnectorServers(client)` calls the bearer-gated
  `GET /api/v1/arc/connectors` and returns a `Record<string, McpHttpServerConfig>`.
- `arc.ts`: in `runArcQuery`, fetch connector servers alongside `resolveBusinessContext` /
  `resolveRecallMemory`, then:

  ```ts
  const connectorServers = await resolveConnectorServers(client);   // {} if none/disabled
  // …
  mcpServers: { arc: arcServer, ...connectorServers },
  allowedTools: [...allowedToolNames(opts.mode, opts.skill), ...connectorToolNames],
  ```

  Because a Phase 1 connector is read-only **by registry guarantee** (`access: "read_only"`),
  we allow its entire MCP server rather than enumerating tools: `allowedTools` gets the
  server-level entry `mcp__${toolNamespace}` for each enabled connector (no per-turn tool
  discovery needed). Per-tool allowlisting and read/write classification arrive in Phase 2,
  when not-all-tools-are-safe. No approval routing is needed in Phase 1.
- Failure isolation: a connector that errors or times out must degrade to "skipped" and
  never block the turn (same posture as the defensive Gemini parser and the
  Supabase-unreachable AbortError handling).

### 6. UI (`src/app/settings/`)

Extend the existing settings connections surface (`connections-panel.tsx`,
`connection-controls.tsx`, `provider-logo.tsx`) with a **Connectors catalog**: each catalog
card shows label, description, status pill (`not_configured` / `connected` / `disabled` /
`error`), a connect action (paste API key for Phase 1), an enable/disable toggle, and a
"test connection" button. Reuse `PageHeader` / `Panel` / `StatusPill` primitives and follow
`DESIGN.md`. No new layout components if the existing ones fit.

## Data flow (Phase 1, read path)

```
Operator → settings catalog → connect (paste key)
  → connectors-actions.ts (requireOperator)
  → writeConnectorCredential → vault.create_secret → credential_ref stored on row
Operator → toggle enable → setConnectorEnabled

Arc turn (Cloud Run runner)
  → GET /api/v1/arc/connectors (bearer)
      app: listWorkspaceconnectors(enabled) → decrypt refs → build McpHttpServerConfig[]
  → runner merges into mcpServers + allowedTools
  → SDK loads remote MCP servers, their read tools join the toolset
  → skills (#209) filter the combined toolset as today
```

## Error handling

- Missing credential → connector status `not_configured`; never loaded into a turn.
- Connector MCP unreachable/timeout → skipped for that turn, logged, turn continues.
- Decryption failure → treated as `error` status; not loaded.
- Unknown `connector_key` (registry/row drift) → ignored by the read-model, surfaced as a
  catalog warning (mirrors `resolveArcSkill` throwing on unknown ids, but non-fatal here).

## Testing

- `src/domain/__tests__/connectors.test.ts` — registry integrity, `computeConnectorStatus`
  precedence (mirrors the connections status tests).
- `src/lib/connectors/*.test.ts` — read-model joins catalog+rows, never leaks plaintext;
  `resolve.ts` builds correct `McpHttpServerConfig` headers; persistence is workspace-scoped.
- `apps/arc-runner/src/connectors.test.ts` — server map assembly, failure isolation
  (unreachable connector → `{}`, turn proceeds).
- Route test for `/api/v1/arc/connectors` — bearer gate, workspace scoping, no plaintext for
  disabled connectors.

## Out of scope for Phase 1

- Write/action tools and approval routing (Phase 2).
- OAuth flows (Phase 3) — Phase 1 is API-key paste only.
- Folding the legacy env-var `connections` (resend/social/drive) into the new model.
- Per-tool allowlists within a connector (Phase 2).

## Security notes

- Plaintext credentials exist only: (a) momentarily in the connect server action before
  `vault.create_secret`, and (b) in the bearer-gated `GET /api/v1/arc/connectors` response to
  the runner. Never persisted on the connector row, never in the read-model, never in logs.
- Every connector read/write path gates on workspace in code (service-role bypasses RLS).
- Connector tools inherit Arc's approval rule in Phase 2; Phase 1 is read-only by
  construction.
