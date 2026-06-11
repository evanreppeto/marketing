# Agent Connection — Pluggable Hermes Design Spec

**Date:** 2026-06-11
**Status:** Approved direction. Sub-project 1 of the "others use it with their own Hermes agent" goal.

## Problem

The app is a control plane for *an agent* (surfaced as **Mark**, run by **Hermes**). It already talks to that agent through a clean two-way contract, but the connection is **single-tenant and env-only**: the webhook URL, signing secret, API token, agent key, and display name all live in environment variables, and `app_settings` is one global row. There is no self-serve way to register an agent, issue/rotate its token, set its webhook from the UI, or see real connection health. To make this a product others can plug their own Hermes into, the connection must become a **first-class, operator-managed, set-up-able** thing — without yet building multi-tenancy.

## Goal & non-goals

**Goal:** Promote the env-var "agent port" into a first-class **Agent Connection**: operator-managed config + app-issued tokens (issue/rotate/revoke) + webhook URL/secret + connectivity test + live health, with a **published v1 contract** others build their Hermes against. Designed so multi-tenancy or self-host can layer on later with no rework.

**Distribution model:** Hybrid — design cleanly for either path; defer the multi-tenant-vs-self-host choice.

**Setup model:** Guided hybrid — the app issues/rotates the API token and runs the connectivity test; the webhook URL + secret can be set in-app **or** via env, with **env taking precedence** when present.

**Non-goals (deferred, explicitly out of scope):** multi-tenancy (workspaces, auth, RLS isolation); billing; packaging a runnable reference Hermes agent (lives in the separate `marketing-classifier-agent` repo). The only seam left for these is the `workspace_id` column.

## Architecture

### The Agent Port module — `src/lib/agent/`

Consolidate connection resolution (today scattered across `src/lib/mark-chat/agent-config.ts` and `notify.ts` reading `process.env`/`getAppSettings` directly) into one module. Every caller uses one resolver:

```
resolveAgentConnection(): Promise<EffectiveAgentConnection>
```

Each field resolves as **`env override ?? DB ?? default`**, so existing env-only deployments behave identically and the DB layer is purely additive. `EffectiveAgentConnection` carries: `displayName`, `agentKey`, `webhookUrl`, `enabled`, `health` (`lastSeenAt`, `lastStatus`, `lastError`), and per-field `source` markers (`"env" | "db" | "default"`) so the UI can show which layer is winning. The webhook **secret** is never returned in this object; it is resolved only at signing time (see below).

Files:
- `src/lib/agent/connection.ts` — `resolveAgentConnection()`, the `env ?? db ?? default` precedence, and `EffectiveAgentConnection`.
- `src/lib/agent/tokens.ts` — issue / hash / verify / revoke app-issued API tokens.
- `src/lib/agent/secret.ts` — resolve + write the webhook signing secret (env or Supabase Vault).
- `src/lib/agent/health.ts` — `recordAgentSeen()` / `recordTestResult()` writers for health telemetry.
- `src/lib/agent/__tests__/` — unit tests.

All persistence is guarded by `isSupabaseAdminConfigured()`. With no Supabase, the resolver returns env/default values and token verification falls back to the env token — i.e. **exactly today's behavior**.

### Data model (new migration, additive)

`agent_connections` — one row per `workspace_id` (singleton `"default"` now; later a tenant FK):

| column | type | purpose |
|---|---|---|
| `workspace_id` | text PK | `"default"` today |
| `display_name` | text null | replaces `MARK_DISPLAY_NAME` |
| `agent_key` | text null | attach key; replaces `MARK_AGENT_KEY` |
| `webhook_url` | text null | agent wake endpoint; `MARK_RUNNER_URL` override target |
| `webhook_secret_ref` | uuid null | Supabase Vault secret id for the HMAC secret |
| `enabled` | boolean default true | operator kill-switch; folds in `markWebhookEnabled` |
| `last_seen_at` | timestamptz null | last inbound call or successful test |
| `last_status` | text null | `"ok" \| "error" \| "unreachable"` |
| `last_error` | text null | short last failure reason |
| `created_at` / `updated_at` | timestamptz | — |

`agent_api_tokens` — app-issued bearers the agent uses to call back:

| column | type | purpose |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | text | scope |
| `token_hash` | text | SHA-256 hex of the plaintext; **plaintext never stored** |
| `prefix` | text | first ~12 chars (`sk_live_a1b2…`) for display |
| `label` | text null | operator note |
| `created_at` | timestamptz | — |
| `last_used_at` | timestamptz null | bumped on successful auth |
| `revoked_at` | timestamptz null | soft revoke; revoked tokens never match |

Indexes: unique on `agent_api_tokens.token_hash`; lookup on `(workspace_id, revoked_at)`.

### Credentials

**App-issued API token (inbound, agent → app).** New async `checkAgentBearer(request)`:
1. If env `HERMES_AGENT_API_TOKEN` is set and the `Authorization: Bearer` matches it → ok (back-compat, unchanged).
2. Else SHA-256-hash the presented token, look up a non-revoked `agent_api_tokens` row; on match, bump `last_used_at` + `recordAgentSeen()` → ok.
3. Else `401`. If neither env token nor any DB token exists → `503 not_configured` (preserves current "refuse until configured" semantics).

All `/api/v1/hermes/*` routes switch from `checkBearerToken(req, "HERMES_AGENT_API_TOKEN")` to `checkAgentBearer(req)`. The sync `checkBearerToken` stays for non-agent routes (lead intake). Token generation: 32 random bytes, base64url, prefixed `sk_live_`; the plaintext is returned **once** from the issue action and shown once in the UI, then only `prefix` is ever displayed.

**Webhook signing secret (outbound, app → agent).** Resolved at signing time as `env MARK_WEBHOOK_SECRET ?? Vault(webhook_secret_ref)`. Stored via **Supabase Vault** (`vault.create_secret` → uuid in `webhook_secret_ref`; read via the `vault.decrypted_secrets` view with the service role). If neither env nor Vault yields a secret, `notifyMarkWebhook` omits the signature exactly as today, and the UI flags "signing secret managed via env / not set." This keeps plaintext secrets out of our own application tables while still allowing in-app setup.

## Behavior

### Connectivity test

Operator-gated server action `testAgentConnection()`. Signs `{ type: "ping", workspaceId, nonce, at }` with the resolved secret and POSTs it to the resolved `webhook_url` (short timeout, best-effort, never throws). Writes the outcome via `recordTestResult()` (`last_seen_at` on 2xx, `last_status`/`last_error` always) and returns `{ ok, status, roundTripMs, error? }`. This exercises the **outbound** path (URL + secret + HMAC) identically to a real wake. The **inbound** path proves itself whenever the agent calls back (`/api/v1/hermes/ping` or any task/message call), which also stamps `last_seen_at` — so the header health line reads "connected · last seen 2s ago" for both directions.

### Surfaces refactored to the resolver (sourcing change only, no behavior change)

- `notifyMarkWebhook` (`src/lib/mark-chat/notify.ts`) → URL + `enabled` from `resolveAgentConnection()`; secret from `src/lib/agent/secret.ts`.
- `markAgentKeys`, `getMarkDisplayName`, `isMarkRunnerConfigured` (`agent-config.ts`) → thin wrappers over the resolver (kept as the public API so existing imports don't churn).
- `MarkConnection` header component + the `getMarkAgentStatus()` skeleton → fed by `last_seen_at`/`last_status`, so the live presence reflects real health.

### UI — Settings → Agent (`src/app/settings/agent/`)

Wired (real `"use server"` actions gated by `requireOperator()` + `isSupabaseAdminConfigured()`, persisting through `src/lib/agent/` + `revalidatePath`), following the vault/campaigns reference shape. Built on `page-header.tsx` primitives + `DESIGN.md` tokens; no emojis.

- **Identity:** display name, agent key (editable; "overridden by env" badge when an env var wins).
- **Inbound (agent → app):** token table (prefix · label · last used · revoke); "Generate token" reveals plaintext once into a copy field; a read-only reference panel listing the endpoints the agent calls + a copy-paste `curl` for `/api/v1/hermes/ping`.
- **Outbound (app → agent):** webhook URL field; "Set / rotate signing secret" (writes Vault); enabled toggle; **Test connection** button + live health line (`last_status`, `last_seen_at`, round-trip ms). Each env-overridden field shows the badge so hybrid precedence is always visible.

Add a `Settings → Agent` nav entry; reuse existing settings layout.

### Published contract — `docs/agent-contract/v1.md`

Versioned `v1` doc, the artifact others build their Hermes against:
- **Wake (app → agent):** `POST {webhookUrl}` body `{ type: "mark_chat_message", ...MarkNotifyPayload }`; header `X-Webhook-Signature` = HMAC-SHA256 hex of the raw body keyed by the signing secret; 2xx ack; idle = no calls.
- **Auth (agent → app):** `Authorization: Bearer <token>` against `/api/v1/hermes/*`.
- **Inbound endpoints:** tasks (claim / complete / block / log), messages, steps, drafts, approvals — request/response shapes referencing the existing routes.
- **Reply contract:** how Mark posts his reply/steps/actions back.
- **Fallback:** inbox poll when a wake isn't delivered.

## Back-compat & testing

- **Zero-config / env-only deploys are unchanged:** resolver returns env values; `checkAgentBearer` matches the env token; no Supabase needed.
- **Unit tests:** resolver precedence (env vs DB vs default + `source` markers); token issue/hash/verify/revoke; secret resolution with env, with Vault, and with neither; HMAC signing determinism.
- **Route test:** `checkAgentBearer` accepts the env token **and** a DB token, rejects a revoked token, returns `503` when nothing is configured. Existing Hermes route tests (`ping`, `tasks`, `messages`, `health`, `drafts`) must stay green after the swap to `checkAgentBearer`.
- **Migration:** one new timestamped file; no edits to shipped migrations. Enable the `supabase_vault` extension in that migration if not already enabled.
- **Verification:** `pnpm exec tsc --noEmit` clean; eslint clean on changed files; `pnpm test` green; manual: Settings → Agent issues a token, sets a webhook, Test connection reports status, header health reflects it.

## Components touched / created

- **Create:** `src/lib/agent/{connection,tokens,secret,health}.ts` + tests; `supabase/migrations/<ts>_agent_connections.sql`; `src/app/settings/agent/{page.tsx,actions.ts,_components/*}`; `docs/agent-contract/v1.md`.
- **Modify:** `src/lib/auth/api-token.ts` (add `checkAgentBearer`); all `src/app/api/v1/hermes/**/route.ts` (swap to `checkAgentBearer`); `src/lib/mark-chat/{agent-config,notify}.ts` (source from resolver); `MarkConnection` + `getMarkAgentStatus()`; settings nav.

## Open risk

Supabase Vault read patterns vary by project setup; the `secret.ts` layer must degrade gracefully to env-only if the `vault` schema/view isn't reachable (treated as "secret managed via env"), never throwing into the send path.
