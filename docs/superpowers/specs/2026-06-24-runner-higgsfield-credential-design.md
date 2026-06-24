# Headless Runner Higgsfield Credential (auto-refreshing OAuth) — design

**Date:** 2026-06-24
**Status:** Approved design, pending spec review
**Author:** Arc / Evan

## Context

This is **Slice 0** of the "make Arc more like Higgsfield" program — the keystone that makes
real Higgsfield calls work from the **deployed, headless Arc runner** (Cloud Run). Without it,
Slice 1's virality loop (and all future creative-firepower slices) cannot run in production:
they call Higgsfield's hosted MCP, which the runner can only reach with a valid credential.

### What we learned from the spike (2026-06-24)

A live spike (documented inline here; the throwaway script was deleted) established the facts
this design rests on — they are not assumptions:

- **Two separate Higgsfield auth worlds.** The **Cloud API** (`cloud.higgsfield.ai`) uses static
  API keys but is **generation-only** (`POST /v1/generations`) and bills separately — it does
  **not** expose `virality_predictor`, Marketing Studio, etc. The **hosted MCP**
  (`mcp.higgsfield.ai/mcp`) is **OAuth-only**, draws on the Ultra subscription credits, and is the
  **only** surface with the advanced tools Arc needs. So the runner must use the OAuth/MCP path.
- **Headless replay works.** A captured OAuth access token, sent as `Authorization: Bearer <token>`
  in a raw HTTP MCP call from a headless Node process (no browser, no Claude client), successfully
  called the MCP `balance` tool and returned live Ultra data. The 406 transport gotcha is avoided
  with `Accept: application/json, text/event-stream`.
- **The token is refreshable.** The stored credential carries an **`offline_access`** scope, a
  **refresh token**, an opaque access token (`oat_…`), and an `expiresAt` ≈ **24h** out. OAuth
  discovery confirms: token endpoint `https://mcp.higgsfield.ai/oauth2/token`, `refresh_token` grant
  supported, and `token_endpoint_auth_methods` includes `"none"` → it is a **public/PKCE client**,
  so refresh needs only `client_id` (no client secret).
- **Cost note (for Slice 1, not this slice):** the single `virality_predictor` run during the spike
  cost ~887 credits (balance 1965 → 1078). Scoring is the expensive op; Slice 1 should revisit its
  "score all N variants" default. Out of scope here.

### What already exists (the path is ~90% built)

The connector infrastructure is in place and unchanged by this slice except where noted:
- Per-workspace credential stored in **Supabase Vault** (`workspace_connectors.credential_ref` →
  `vault.create_secret` / `vault.decrypted_secrets`), via `src/lib/connectors/credentials.ts`.
- `GET /api/v1/arc/connectors` → `resolveRemoteConnectorsForRunner`
  (`src/lib/connectors/runner-connectors.ts`) decrypts the credential and returns
  `{ toolNamespace, mcpUrl, authHeader, token }`.
- The runner (`apps/arc-runner/src/connectors.ts`) sends it as
  `Authorization: Bearer <token>` to `mcp.higgsfield.ai/mcp` (draft/act modes only).
- A connector test/health path exists (`testConnectorAction`) but currently only implements
  `gemini-research`.

The single missing piece: the stored access token expires in ~24h, and nothing refreshes it.

## Goal

The deployed runner always receives a **valid, non-expired** Higgsfield access token, refreshed
automatically server-side using the stored refresh token — **no daily manual re-auth**. Add a real
Higgsfield health-check. Onboard the single tenant via a server-side capture script. Defer the
in-app OAuth onboarding UI (multi-tenant).

## Decisions (locked with Evan)

- **Approach A** (over B "re-paste runbook" and C "full in-app OAuth onboarding now").
- Credential stored as a **JSON bundle** for refreshable connectors; reader stays backward
  compatible with a bare-string (legacy/manual) credential.
- Refresh happens **server-side in the app** (in the connectors resolution path), so the **runner is
  untouched** — it keeps receiving a plain token string.
- Single-tenant onboarding via a **server-side capture script** (keeps the long-lived refresh token
  off the browser); in-app OAuth UI deferred.

## Architecture & data flow

```
runner turn (draft/act)
  └─ GET /api/v1/arc/connectors  (arcGuard, bearer)
       └─ resolveRemoteConnectorsForRunner(workspaceId)
            ├─ readConnectorCredential(ref)               → raw (string | JSON bundle)
            ├─ parseConnectorCredential(raw)  [domain]    → bearer | oauth_refresh
            ├─ if oauth_refresh && isAccessTokenStale():
            │     ensureFreshAccessToken()  [lib]
            │       ├─ POST tokenEndpoint (grant_type=refresh_token, refresh_token, client_id)
            │       ├─ applyRefreshResponse()  [domain]   → new bundle
            │       └─ writeConnectorCredential(new bundle)  → Vault (rotated RT persisted)
            └─ returns { token: <fresh accessToken>, mcpUrl, authHeader, toolNamespace }
  └─ buildRemoteMcp → Authorization: Bearer <fresh token> → mcp.higgsfield.ai/mcp   (UNCHANGED)
```

## Components

### 1. Pure domain — `src/domain/oauth-refresh.ts` (no I/O, unit-tested, exported via `@/domain`)

```ts
export type ConnectorCredential =
  | { kind: "bearer"; token: string }
  | { kind: "oauth_refresh"; accessToken: string; refreshToken: string;
      expiresAt: number; clientId: string; tokenEndpoint: string };

export function parseConnectorCredential(raw: string): ConnectorCredential;
//   - JSON with type==="oauth_refresh" → that bundle; otherwise → { kind:"bearer", token: raw }
//   - malformed JSON → treated as a bare bearer string (never throws)

export function isAccessTokenStale(c: { expiresAt: number }, nowMs: number, skewMs?: number): boolean;
//   - default skewMs = 120_000 (refresh 2 min before expiry)

export function buildRefreshRequest(c: { tokenEndpoint: string; refreshToken: string; clientId: string }):
  { url: string; body: string };  // body = URLSearchParams(grant_type, refresh_token, client_id)

export type OAuthTokenResponse = { access_token: string; expires_in?: number; refresh_token?: string };
export function applyRefreshResponse(
  prev: Extract<ConnectorCredential, { kind: "oauth_refresh" }>,
  res: OAuthTokenResponse, nowMs: number,
): Extract<ConnectorCredential, { kind: "oauth_refresh" }>;
//   - new accessToken; expiresAt = nowMs + (expires_in ?? 86400)*1000;
//     refreshToken = res.refresh_token ?? prev.refreshToken (handles rotation AND non-rotation)
```

### 2. I/O — `src/lib/connectors/oauth-refresh.ts`

```ts
export type EnsureFreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "needs_reconnect"; error: string };

export async function ensureFreshAccessToken(
  client: SupabaseClient, workspaceId: string, connectorKey: string,
  cred: Extract<ConnectorCredential, { kind: "oauth_refresh" }>, credentialRef: string,
): Promise<EnsureFreshResult>;
//   - if !isAccessTokenStale → { ok:true, accessToken: cred.accessToken }
//   - else POST buildRefreshRequest via fetch; on 2xx → applyRefreshResponse →
//     writeConnectorCredential(updated bundle) → { ok:true, accessToken: new }
//   - on non-2xx / network error / invalid_grant → { ok:false, reason:"needs_reconnect", error }
```

`nowMs` is passed in (or read via `Date.now()` only here, never in the pure module) so the domain
stays deterministic/testable.

### 3. Wiring — `src/lib/connectors/runner-connectors.ts`

In `resolveRemoteConnectorsForRunner`, after `readConnectorCredential`:
- `parseConnectorCredential(raw)`.
- `bearer` → use `token` as today (no behavior change for legacy/manual creds).
- `oauth_refresh` → `ensureFreshAccessToken(...)`; on `ok` use the returned access token; on
  `needs_reconnect` **omit** this connector from the runner response (runner degrades gracefully,
  no Higgsfield tools) and let the status surface as `error` for the operator.

### 4. Onboarding — `scripts/connectors/capture-higgsfield.ts`

A one-shot Node/tsx admin script (run locally by an operator, not in prod request path):
- Reads `~/.claude/.credentials.json` → `mcpOAuth["higgsfield|…"]` →
  `{ accessToken, refreshToken, expiresAt, clientId }`.
- Composes the bundle (adds `type:"oauth_refresh"`, `tokenEndpoint`).
- Writes it to the target workspace's `higgsfield` connector credential via the existing
  `writeConnectorCredential` + connector persistence (creates/updates the `workspace_connectors`
  row, `enabled=true`).
- Prints only a masked confirmation (never the tokens).
- Added as a `pnpm` script (e.g. `pnpm connectors:capture-higgsfield -- --workspace <id>`).

### 5. Health-check — extend `testConnectorAction` (`src/app/settings/connectors-actions.ts`)

Add a `higgsfield` branch: load credential → `ensureFreshAccessToken` → a raw MCP
`initialize` + `tools/call balance` (zero credit) → `recordConnectorTest(ok/err)`. Reuses the same
masked, safe call shape proven in the spike.

## Error handling

- **Refresh failure** (revoked/expired refresh token) → `needs_reconnect`: connector dropped from
  the runner payload, status `error`, operator sees a "reconnect Higgsfield" hint. The runner turn
  proceeds without Higgsfield tools (it already treats `fetchRemoteConnectors` as best-effort).
- **Malformed credential** → `parseConnectorCredential` falls back to `bearer` (never throws).
- **Refresh race** (two concurrent runner requests both refresh): acceptable at single-tenant
  volume — last write wins; a non-rotating refresh token makes this harmless, and a rotating one
  self-heals on the next request. Locking is explicitly out of scope (noted).

## Known caveat — shared refresh-token lineage

The captured refresh-token lineage becomes **app-owned**. If Higgsfield **rotates** refresh tokens on
use, then the same Higgsfield login used simultaneously by a personal interactive Claude client and
by the app could require an occasional re-auth on one side (whoever refreshes second). For the
single-tenant prototype this is acceptable. The clean fix — a **dedicated app OAuth registration**
(its own `client_id`/refresh lineage) obtained via a one-time in-app OAuth flow — rides with the
deferred onboarding UI (Approach C). Documented, not solved here.

## Testing

- **Domain** (`src/domain/__tests__/oauth-refresh.test.ts`): `parseConnectorCredential` (bundle vs
  bare vs malformed), `isAccessTokenStale` (fresh / stale / within-skew, with injected `nowMs`),
  `buildRefreshRequest` (exact form body), `applyRefreshResponse` (rotation present, rotation
  absent → keeps old RT, `expires_in` present/absent → 24h default).
- **I/O** (`src/lib/connectors/__tests__/oauth-refresh.test.ts`): `ensureFreshAccessToken` —
  fresh (no fetch), stale→refresh→persist (mock fetch + `writeConnectorCredential`), refresh-fail →
  `needs_reconnect`.
- **Wiring**: `resolveRemoteConnectorsForRunner` returns a fresh token for an `oauth_refresh` cred,
  passes a `bearer` cred through unchanged, and omits a connector on `needs_reconnect`.
- **Health-check**: mocked MCP `balance` call records `lastTestOk`.
- Barrel-completeness guard updated (`export * from "./oauth-refresh"`). `pnpm build` typechecks.

## Out of scope (YAGNI)

- In-app OAuth redirect/onboarding UI and dynamic client registration (Approach C / multi-tenant).
- Refresh-race locking.
- Migrating the Slice 1 credit-cost default ("score all N").
- Any runner-side code change (the runner already sends `Bearer <token>`).
- The Cloud-API-key path (rejected: generation-only, no virality).
