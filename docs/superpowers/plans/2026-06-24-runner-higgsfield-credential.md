# Auto-Refreshing Higgsfield Runner Credential Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The deployed headless Arc runner always receives a valid, non-expired Higgsfield access token — refreshed automatically server-side from a stored refresh token — with the runner code unchanged.

**Architecture:** A pure domain module models the credential (a bare bearer string *or* a refreshable OAuth bundle) and the refresh math. An I/O helper refreshes a stale access token via Higgsfield's public/PKCE token endpoint and best-effort-persists the new bundle into the Vault secret in place. The connectors resolution path (`resolveRemoteConnectorsForRunner`) calls it before handing the runner a token, so the runner keeps sending `Authorization: Bearer <token>` exactly as today. A server-side capture script onboards the single tenant, and the Settings health-check learns to validate Higgsfield.

**Tech Stack:** TypeScript, Vitest, Supabase (admin client + Vault RPCs), Next.js 16 server actions, Node `fetch`.

**Spike-validated facts (see `docs/superpowers/specs/2026-06-24-runner-higgsfield-credential-design.md`):** token endpoint `https://mcp.higgsfield.ai/oauth2/token`; `refresh_token` grant + public client (`token_endpoint_auth_methods: ["none",...]`, no secret); access-token TTL ~24h; refresh requires only `grant_type`, `refresh_token`, `client_id`.

---

## File Structure

**Create:**
- `src/domain/oauth-refresh.ts` — pure credential model + refresh math.
- `src/domain/__tests__/oauth-refresh.test.ts` — domain tests.
- `src/lib/connectors/oauth-refresh.ts` — `ensureFreshAccessToken` (I/O: fetch + persist).
- `src/lib/connectors/__tests__/oauth-refresh.test.ts` — I/O tests.
- `src/lib/connectors/higgsfield-health.ts` — raw MCP `balance` probe for the health-check.
- `scripts/connectors/capture-higgsfield.ts` — single-tenant onboarding script.

**Modify:**
- `src/domain/index.ts` — barrel-export `./oauth-refresh`.
- `src/lib/connectors/credentials.ts` — add `updateConnectorCredential` (in-place Vault update).
- `src/lib/connectors/runner-connectors.ts` — parse credential + refresh before returning the token.
- `src/lib/connectors/__tests__/runner-connectors.test.ts` — wiring tests (create if absent).
- `src/app/settings/connectors-actions.ts` — `testConnectorAction` learns `higgsfield`.
- `package.json` — add the `connectors:capture-higgsfield` script.

---

## Task 1: Domain — credential model + refresh math

**Files:**
- Create: `src/domain/oauth-refresh.ts`
- Test: `src/domain/__tests__/oauth-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/oauth-refresh.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseConnectorCredential,
  isAccessTokenStale,
  buildRefreshRequest,
  applyRefreshResponse,
} from "../oauth-refresh";

const bundle = {
  type: "oauth_refresh" as const,
  accessToken: "oat_old",
  refreshToken: "rt_old",
  expiresAt: 1_000_000,
  clientId: "client_123",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
};

describe("parseConnectorCredential", () => {
  it("parses an oauth_refresh JSON bundle", () => {
    const c = parseConnectorCredential(JSON.stringify(bundle));
    expect(c).toEqual({
      kind: "oauth_refresh",
      accessToken: "oat_old",
      refreshToken: "rt_old",
      expiresAt: 1_000_000,
      clientId: "client_123",
      tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
    });
  });

  it("treats a bare string as a bearer credential", () => {
    expect(parseConnectorCredential("oat_plain")).toEqual({ kind: "bearer", token: "oat_plain" });
  });

  it("treats malformed JSON or non-refresh JSON as a bearer string (never throws)", () => {
    expect(parseConnectorCredential("{not json")).toEqual({ kind: "bearer", token: "{not json" });
    expect(parseConnectorCredential('{"type":"other"}')).toEqual({ kind: "bearer", token: '{"type":"other"}' });
  });
});

describe("isAccessTokenStale", () => {
  it("is fresh well before expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 500_000)).toBe(false);
  });
  it("is stale within the default 120s skew of expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 1_000_000 - 60_000)).toBe(true);
  });
  it("is stale after expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 1_500_000)).toBe(true);
  });
});

describe("buildRefreshRequest", () => {
  it("builds a form-encoded refresh_token grant with client_id, no secret", () => {
    const req = buildRefreshRequest(bundle);
    expect(req.url).toBe("https://mcp.higgsfield.ai/oauth2/token");
    const params = new URLSearchParams(req.body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt_old");
    expect(params.get("client_id")).toBe("client_123");
    expect(params.get("client_secret")).toBeNull();
  });
});

describe("applyRefreshResponse", () => {
  it("updates access token + expiry, rotates refresh token when returned", () => {
    const next = applyRefreshResponse(bundle, { access_token: "oat_new", expires_in: 3600, refresh_token: "rt_new" }, 2_000_000);
    expect(next.accessToken).toBe("oat_new");
    expect(next.refreshToken).toBe("rt_new");
    expect(next.expiresAt).toBe(2_000_000 + 3600 * 1000);
    expect(next.clientId).toBe("client_123");
  });
  it("keeps the old refresh token when the response omits one", () => {
    const next = applyRefreshResponse(bundle, { access_token: "oat_new" }, 2_000_000);
    expect(next.refreshToken).toBe("rt_old");
    expect(next.expiresAt).toBe(2_000_000 + 86_400 * 1000); // 24h default when expires_in absent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/oauth-refresh.test.ts`
Expected: FAIL — "Cannot find module '../oauth-refresh'".

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/oauth-refresh.ts`:

```ts
/**
 * Pure model + math for refreshable OAuth connector credentials. No I/O.
 *
 * A stored connector credential is either a bare bearer string (legacy / manually
 * pasted, not refreshable) or a JSON "oauth_refresh" bundle carrying the refresh
 * token + token endpoint so the access token can be auto-renewed server-side.
 */

export type OAuthRefreshBundle = {
  kind: "oauth_refresh";
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  clientId: string;
  tokenEndpoint: string;
};

export type ConnectorCredential = { kind: "bearer"; token: string } | OAuthRefreshBundle;

const DEFAULT_SKEW_MS = 120_000; // refresh 2 min before expiry
const DEFAULT_TTL_S = 86_400; // 24h, when the token response omits expires_in

/** Parse a stored credential. Bundles are JSON with type:"oauth_refresh"; anything
 *  else (bare token, malformed JSON, other JSON) is treated as a bearer string. */
export function parseConnectorCredential(raw: string): ConnectorCredential {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o && o.type === "oauth_refresh") {
      return {
        kind: "oauth_refresh",
        accessToken: String(o.accessToken ?? ""),
        refreshToken: String(o.refreshToken ?? ""),
        expiresAt: Number(o.expiresAt ?? 0),
        clientId: String(o.clientId ?? ""),
        tokenEndpoint: String(o.tokenEndpoint ?? ""),
      };
    }
  } catch {
    // not JSON — fall through to bearer
  }
  return { kind: "bearer", token: raw };
}

export function isAccessTokenStale(c: { expiresAt: number }, nowMs: number, skewMs = DEFAULT_SKEW_MS): boolean {
  return c.expiresAt - nowMs <= skewMs;
}

export function buildRefreshRequest(c: Pick<OAuthRefreshBundle, "tokenEndpoint" | "refreshToken" | "clientId">): {
  url: string;
  body: string;
} {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: c.refreshToken,
    client_id: c.clientId,
  }).toString();
  return { url: c.tokenEndpoint, body };
}

export type OAuthTokenResponse = { access_token: string; expires_in?: number; refresh_token?: string };

export function applyRefreshResponse(prev: OAuthRefreshBundle, res: OAuthTokenResponse, nowMs: number): OAuthRefreshBundle {
  return {
    ...prev,
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? prev.refreshToken,
    expiresAt: nowMs + (res.expires_in ?? DEFAULT_TTL_S) * 1000,
  };
}

/** Serialize a bundle back to the stored JSON shape (type tag included). */
export function serializeOAuthBundle(b: OAuthRefreshBundle): string {
  return JSON.stringify({
    type: "oauth_refresh",
    accessToken: b.accessToken,
    refreshToken: b.refreshToken,
    expiresAt: b.expiresAt,
    clientId: b.clientId,
    tokenEndpoint: b.tokenEndpoint,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/oauth-refresh.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the barrel export**

In `src/domain/index.ts`, append after the last export line:

```ts
export * from "./oauth-refresh";
```

- [ ] **Step 6: Run the domain suite (incl. barrel guard)**

Run: `pnpm test src/domain`
Expected: PASS, including the barrel-completeness guard.

- [ ] **Step 7: Commit**

```bash
git add src/domain/oauth-refresh.ts src/domain/__tests__/oauth-refresh.test.ts src/domain/index.ts
git commit -m "feat(domain): refreshable OAuth connector credential model + math"
```

---

## Task 2: Vault — in-place credential update

`writeConnectorCredential` always *creates* a new Vault secret. Refresh needs to update the existing secret in place (so the `credential_ref` on the row never changes and no orphan secrets accumulate). Add an `update_secret` wrapper, mirroring the existing direct→vault-schema fallback pattern. It is **best-effort**: returns `false` on failure so the caller can still use the freshly-minted token for the current request.

**Files:**
- Modify: `src/lib/connectors/credentials.ts`
- Test: `src/lib/connectors/__tests__/credentials.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/__tests__/credentials.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { updateConnectorCredential } from "../credentials";

function clientWithDirectRpc(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) } as never;
}

describe("updateConnectorCredential", () => {
  it("returns true when the direct update_secret RPC succeeds", async () => {
    const client = clientWithDirectRpc({ data: "ok", error: null });
    const ok = await updateConnectorCredential(client, "ref-1", "new-secret");
    expect(ok).toBe(true);
  });

  it("returns false (best-effort) when the RPC errors and no schema fallback exists", async () => {
    const client = clientWithDirectRpc({ data: null, error: { message: "nope" } });
    const ok = await updateConnectorCredential(client, "ref-1", "new-secret");
    expect(ok).toBe(false);
  });

  it("returns false when ref is null", async () => {
    const client = clientWithDirectRpc({ data: "ok", error: null });
    expect(await updateConnectorCredential(client, null, "x")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/__tests__/credentials.test.ts`
Expected: FAIL — `updateConnectorCredential` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/connectors/credentials.ts` (and extend the `VaultSecretClient` type's rpc union to include `update_secret`):

```ts
type UpdateSecretArgs = { secret_id: string; new_secret: string };

/** Update an existing Vault secret in place. Best-effort: returns false on any
 *  failure (caller can still use a freshly-minted token for the current request).
 *  Mirrors writeConnectorCredential's direct → vault-schema fallback. */
export async function updateConnectorCredential(
  client: SupabaseClient,
  ref: string | null,
  plaintext: string,
): Promise<boolean> {
  if (!ref) return false;
  const args: UpdateSecretArgs = { secret_id: ref, new_secret: plaintext };

  try {
    const direct = await client.rpc("update_secret", args);
    if (!direct.error) return true;
  } catch {
    // fall through to scoped attempt
  }

  if (typeof client.schema === "function") {
    try {
      const scoped = await (client as unknown as {
        schema(s: "vault"): { rpc(fn: "update_secret", a: UpdateSecretArgs): Promise<{ error: { message: string } | null }> };
      })
        .schema("vault")
        .rpc("update_secret", args);
      if (!scoped.error) return true;
    } catch {
      return false;
    }
  }
  return false;
}
```

> **Note:** the existing `client.rpc("create_secret", ...)` is called untyped in this file already; `update_secret` follows the same loose-typing approach. If TS complains about the `rpc` overload, cast `client.rpc as (fn: string, args: unknown) => Promise<{ error: { message: string } | null }>` locally, matching how `create_secret` is handled.

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/lib/connectors/__tests__/credentials.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/credentials.ts src/lib/connectors/__tests__/credentials.test.ts
git commit -m "feat(connectors): in-place Vault secret update (best-effort)"
```

---

## Task 3: I/O — `ensureFreshAccessToken`

**Files:**
- Create: `src/lib/connectors/oauth-refresh.ts`
- Test: `src/lib/connectors/__tests__/oauth-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/__tests__/oauth-refresh.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureFreshAccessToken } from "../oauth-refresh";
import type { OAuthRefreshBundle } from "@/domain";

const credentials = vi.hoisted(() => ({ updateConnectorCredential: vi.fn(async () => true) }));
vi.mock("../credentials", () => credentials);

const baseBundle: OAuthRefreshBundle = {
  kind: "oauth_refresh",
  accessToken: "oat_old",
  refreshToken: "rt_old",
  expiresAt: 0, // always stale relative to Date.now()
  clientId: "client_123",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
};

afterEach(() => {
  vi.restoreAllMocks();
  credentials.updateConnectorCredential.mockClear();
});

describe("ensureFreshAccessToken", () => {
  it("returns the current token without fetching when not stale", async () => {
    const fresh = { ...baseBundle, expiresAt: Date.now() + 3_600_000 };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await ensureFreshAccessToken({} as never, "ref-1", fresh);
    expect(res).toEqual({ ok: true, accessToken: "oat_old" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes a stale token, persists the new bundle, returns the new token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "oat_new", expires_in: 3600, refresh_token: "rt_new" }) })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res).toEqual({ ok: true, accessToken: "oat_new" });
    expect(credentials.updateConnectorCredential).toHaveBeenCalledTimes(1);
    const [, ref, serialized] = credentials.updateConnectorCredential.mock.calls[0];
    expect(ref).toBe("ref-1");
    expect(serialized).toContain("oat_new");
    expect(serialized).toContain("rt_new");
  });

  it("still returns the fresh token even if persistence fails (best-effort)", async () => {
    credentials.updateConnectorCredential.mockResolvedValueOnce(false);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "oat_new" }) })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res).toEqual({ ok: true, accessToken: "oat_new" });
  });

  it("returns needs_reconnect when the token endpoint rejects the refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => "invalid_grant" })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("needs_reconnect");
  });

  it("returns needs_reconnect on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/__tests__/oauth-refresh.test.ts`
Expected: FAIL — cannot find `../oauth-refresh`.

- [ ] **Step 3: Implement**

Create `src/lib/connectors/oauth-refresh.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  applyRefreshResponse,
  buildRefreshRequest,
  isAccessTokenStale,
  serializeOAuthBundle,
  type OAuthRefreshBundle,
  type OAuthTokenResponse,
} from "@/domain";

import { updateConnectorCredential } from "./credentials";

export type EnsureFreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "needs_reconnect"; error: string };

/**
 * Return a valid Higgsfield access token, refreshing it via the OAuth token
 * endpoint when stale and best-effort-persisting the new bundle into the Vault
 * secret in place. Refresh failure → needs_reconnect (caller drops the connector).
 */
export async function ensureFreshAccessToken(
  client: SupabaseClient,
  credentialRef: string | null,
  bundle: OAuthRefreshBundle,
): Promise<EnsureFreshResult> {
  const now = Date.now();
  if (!isAccessTokenStale(bundle, now)) {
    return { ok: true, accessToken: bundle.accessToken };
  }

  const { url, body } = buildRefreshRequest(bundle);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "needs_reconnect", error: `refresh failed (${res.status}): ${detail.slice(0, 200)}` };
    }
    const json = (await res.json()) as OAuthTokenResponse;
    if (!json.access_token) {
      return { ok: false, reason: "needs_reconnect", error: "refresh response missing access_token" };
    }
    const next = applyRefreshResponse(bundle, json, Date.now());
    await updateConnectorCredential(client, credentialRef, serializeOAuthBundle(next)); // best-effort
    return { ok: true, accessToken: next.accessToken };
  } catch (error) {
    return { ok: false, reason: "needs_reconnect", error: error instanceof Error ? error.message : "refresh error" };
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/lib/connectors/__tests__/oauth-refresh.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/oauth-refresh.ts src/lib/connectors/__tests__/oauth-refresh.test.ts
git commit -m "feat(connectors): ensureFreshAccessToken — refresh + persist Higgsfield token"
```

---

## Task 4: Wire refresh into the runner connector resolution

**Files:**
- Modify: `src/lib/connectors/runner-connectors.ts`
- Test: `src/lib/connectors/__tests__/runner-connectors.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/__tests__/runner-connectors.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const readModel = vi.hoisted(() => ({
  listWorkspaceConnectors: vi.fn(),
  resolveConnectorCredentialRef: vi.fn(async () => "ref-1"),
}));
vi.mock("../read-model", () => readModel);

const creds = vi.hoisted(() => ({ readConnectorCredential: vi.fn() }));
vi.mock("../credentials", () => creds);

const refresh = vi.hoisted(() => ({ ensureFreshAccessToken: vi.fn() }));
vi.mock("../oauth-refresh", () => refresh);

import { resolveRemoteConnectorsForRunner } from "../runner-connectors";

beforeEach(() => {
  readModel.listWorkspaceConnectors.mockResolvedValue([{ key: "higgsfield", enabled: true, credentialPresent: true }]);
});

describe("resolveRemoteConnectorsForRunner", () => {
  it("passes a bare bearer credential through unchanged (no refresh)", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce("oat_plain");
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(1);
    expect(out[0].token).toBe("oat_plain");
    expect(refresh.ensureFreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes an oauth_refresh bundle and returns the fresh token", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce(
      JSON.stringify({ type: "oauth_refresh", accessToken: "old", refreshToken: "rt", expiresAt: 0, clientId: "c", tokenEndpoint: "https://t" }),
    );
    refresh.ensureFreshAccessToken.mockResolvedValueOnce({ ok: true, accessToken: "fresh" });
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(1);
    expect(out[0].token).toBe("fresh");
  });

  it("omits the connector when refresh needs reconnect", async () => {
    creds.readConnectorCredential.mockResolvedValueOnce(
      JSON.stringify({ type: "oauth_refresh", accessToken: "old", refreshToken: "rt", expiresAt: 0, clientId: "c", tokenEndpoint: "https://t" }),
    );
    refresh.ensureFreshAccessToken.mockResolvedValueOnce({ ok: false, reason: "needs_reconnect", error: "x" });
    const out = await resolveRemoteConnectorsForRunner({} as never, "ws-1");
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/__tests__/runner-connectors.test.ts`
Expected: FAIL — current code returns the raw credential as `token`, so the oauth_refresh test gets the JSON string, not "fresh"; and the needs_reconnect test gets length 1.

- [ ] **Step 3: Implement**

Edit `src/lib/connectors/runner-connectors.ts`. Add imports:

```ts
import { CONNECTOR_REGISTRY, parseConnectorCredential } from "@/domain";
import { ensureFreshAccessToken } from "./oauth-refresh";
```

Replace the loop body (lines 30-36) so the token is resolved per credential kind:

```ts
  for (const entry of CONNECTOR_REGISTRY) {
    if (!entry.mcpUrl || !entry.authHeader || !enabledKeys.has(entry.key)) continue;
    const ref = await resolveConnectorCredentialRef(client, workspaceId, entry.key);
    const raw = await readConnectorCredential(client, ref);
    if (!raw) continue;

    const cred = parseConnectorCredential(raw);
    let token: string;
    if (cred.kind === "oauth_refresh") {
      const fresh = await ensureFreshAccessToken(client, ref, cred);
      if (!fresh.ok) continue; // needs reconnect — drop connector, runner degrades
      token = fresh.accessToken;
    } else {
      token = cred.token;
    }
    out.push({ toolNamespace: entry.toolNamespace, mcpUrl: entry.mcpUrl, authHeader: entry.authHeader, token });
  }
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/lib/connectors/__tests__/runner-connectors.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/runner-connectors.ts src/lib/connectors/__tests__/runner-connectors.test.ts
git commit -m "feat(connectors): auto-refresh Higgsfield token in runner resolution"
```

---

## Task 5: Higgsfield health-check

**Files:**
- Create: `src/lib/connectors/higgsfield-health.ts`
- Test: `src/lib/connectors/__tests__/higgsfield-health.test.ts`
- Modify: `src/app/settings/connectors-actions.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/__tests__/higgsfield-health.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { checkHiggsfieldToken } from "../higgsfield-health";

afterEach(() => vi.restoreAllMocks());

describe("checkHiggsfieldToken", () => {
  it("returns ok when balance comes back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      text: async () => 'data: {"result":{"structuredContent":{"credits":10,"subscription_plan_type":"ultra"}},"jsonrpc":"2.0","id":1}\n',
    })));
    const res = await checkHiggsfieldToken("oat_x");
    expect(res.ok).toBe(true);
  });

  it("returns not-ok on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, headers: new Headers(), text: async () => "unauthorized" })));
    const res = await checkHiggsfieldToken("oat_bad");
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/__tests__/higgsfield-health.test.ts`
Expected: FAIL — cannot find `../higgsfield-health`.

- [ ] **Step 3: Implement**

Create `src/lib/connectors/higgsfield-health.ts` (the spike-proven raw MCP shape — `initialize` then `tools/call balance`, parsing an SSE or JSON body):

```ts
const MCP_URL = "https://mcp.higgsfield.ai/mcp";

function parseMcpBody(text: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream")) {
    const lines = text.split(/\n/).filter((l) => l.startsWith("data:"));
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l.slice(5).trim());
      } catch {
        return null;
      }
    });
    return parsed;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Validate a Higgsfield access token by calling the zero-credit `balance` tool. */
export async function checkHiggsfieldToken(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  try {
    const init = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "arc-health", version: "0" } } }),
    });
    if (init.status === 401 || init.status === 403) return { ok: false, error: `auth rejected (${init.status})` };
    const sid = init.headers.get("mcp-session-id");
    const callHeaders = sid ? { ...headers, "Mcp-Session-Id": sid } : headers;
    const call = await fetch(MCP_URL, {
      method: "POST",
      headers: callHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "balance", arguments: {} } }),
    });
    if (call.status !== 200) return { ok: false, error: `balance call failed (${call.status})` };
    const body = parseMcpBody(await call.text(), call.headers.get("content-type") ?? "");
    const ok = JSON.stringify(body).includes("subscription_plan_type") || JSON.stringify(body).includes("credits");
    return ok ? { ok: true } : { ok: false, error: "unexpected balance response" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "health check error" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/connectors/__tests__/higgsfield-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `testConnectorAction`**

In `src/app/settings/connectors-actions.ts`, add imports:

```ts
import { parseConnectorCredential } from "@/domain";
import { ensureFreshAccessToken } from "@/lib/connectors/oauth-refresh";
import { checkHiggsfieldToken } from "@/lib/connectors/higgsfield-health";
```

Replace the early `if (connectorKey !== "gemini-research")` rejection (line 94) with branch handling, and add the Higgsfield path after the workspace + credential are resolved. Concretely, after the existing `const key = ref ? await readConnectorCredential(...)` block (keep it), restructure so each connector has its own probe. Minimal change: keep the gemini path, and **before** it, add:

```ts
  if (connectorKey === "higgsfield") {
    let workspaceId: string;
    try {
      ({ workspaceId } = await workspaceScope());
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "No workspace." };
    }
    const client = getSupabaseAdminClient();
    const ref = await resolveConnectorCredentialRef(client, workspaceId, connectorKey);
    const raw = ref ? await readConnectorCredential(client, ref) : null;
    if (!raw) {
      await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "No credential stored." } }).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message: "Connect and enable Higgsfield first." };
    }
    const cred = parseConnectorCredential(raw);
    const access = cred.kind === "oauth_refresh" ? await ensureFreshAccessToken(client, ref, cred) : { ok: true as const, accessToken: cred.token };
    if (!access.ok) {
      await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "Token refresh failed — reconnect Higgsfield." } }).catch(() => undefined);
      revalidatePath("/settings");
      return { ok: false, message: "Higgsfield token expired — reconnect required." };
    }
    const health = await checkHiggsfieldToken(access.accessToken);
    await recordConnectorTest(client, { workspaceId, connectorKey, result: health }).catch(() => undefined);
    revalidatePath("/settings");
    return health.ok ? { ok: true, message: `${entry.label} is healthy.` } : { ok: false, message: health.error ?? "Health check failed." };
  }

  if (connectorKey !== "gemini-research") return { ok: false, message: "No live test for this connector yet." };
```

> Keep the rest of the gemini-research path exactly as-is below this.

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `pnpm test src/lib/connectors && npx tsc --noEmit && npx eslint src/app/settings/connectors-actions.ts src/lib/connectors/higgsfield-health.ts`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/connectors/higgsfield-health.ts src/lib/connectors/__tests__/higgsfield-health.test.ts src/app/settings/connectors-actions.ts
git commit -m "feat(connectors): live Higgsfield health-check via MCP balance"
```

---

## Task 6: Single-tenant onboarding capture script

A thin, operator-run script. The pure bundle-builder is unit-tested; the script wraps it with file + Vault I/O.

**Files:**
- Create: `scripts/connectors/capture-higgsfield.ts`
- Test: `src/lib/connectors/__tests__/capture-bundle.test.ts`
- Create: `src/lib/connectors/capture-bundle.ts` (the testable pure helper)
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/__tests__/capture-bundle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHiggsfieldBundleFromMcpEntry } from "../capture-bundle";

describe("buildHiggsfieldBundleFromMcpEntry", () => {
  it("builds a serialized oauth_refresh bundle from a Claude .credentials.json mcpOAuth entry", () => {
    const serialized = buildHiggsfieldBundleFromMcpEntry({
      accessToken: "oat_a",
      refreshToken: "rt_a",
      expiresAt: 123,
      clientId: "client_a",
    });
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual({
      type: "oauth_refresh",
      accessToken: "oat_a",
      refreshToken: "rt_a",
      expiresAt: 123,
      clientId: "client_a",
      tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
    });
  });

  it("throws when a required field is missing", () => {
    expect(() => buildHiggsfieldBundleFromMcpEntry({ accessToken: "", refreshToken: "rt", expiresAt: 1, clientId: "c" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/__tests__/capture-bundle.test.ts`
Expected: FAIL — cannot find `../capture-bundle`.

- [ ] **Step 3: Implement the pure helper**

Create `src/lib/connectors/capture-bundle.ts`:

```ts
import { serializeOAuthBundle } from "@/domain";

const HIGGSFIELD_TOKEN_ENDPOINT = "https://mcp.higgsfield.ai/oauth2/token";

export type McpOAuthEntry = { accessToken: string; refreshToken: string; expiresAt: number; clientId: string };

/** Build the serialized oauth_refresh credential bundle from a Claude client's
 *  mcpOAuth entry for Higgsfield. Throws if any required field is empty. */
export function buildHiggsfieldBundleFromMcpEntry(entry: McpOAuthEntry): string {
  if (!entry.accessToken || !entry.refreshToken || !entry.clientId || !entry.expiresAt) {
    throw new Error("mcpOAuth entry missing required fields (accessToken/refreshToken/clientId/expiresAt)");
  }
  return serializeOAuthBundle({
    kind: "oauth_refresh",
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    expiresAt: entry.expiresAt,
    clientId: entry.clientId,
    tokenEndpoint: HIGGSFIELD_TOKEN_ENDPOINT,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/connectors/__tests__/capture-bundle.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the script**

Create `scripts/connectors/capture-higgsfield.ts`:

```ts
/**
 * One-shot single-tenant onboarding: read the Higgsfield OAuth bundle from the
 * local Claude client's credential store and store it (enabled) on a workspace's
 * higgsfield connector. Run locally by an operator, never in the request path.
 *
 *   pnpm connectors:capture-higgsfield -- --workspace <workspaceId> [--org <orgId>]
 *
 * Requires the same Supabase admin env the app uses (NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY). Prints only masked confirmation — never tokens.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildHiggsfieldBundleFromMcpEntry } from "@/lib/connectors/capture-bundle";
import { writeConnectorCredential } from "@/lib/connectors/credentials";
import { setConnectorCredentialRef, setConnectorEnabled } from "@/lib/connectors/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const workspaceId = arg("workspace");
  const orgId = arg("org") ?? null;
  if (!workspaceId) throw new Error("--workspace <workspaceId> is required");
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase admin env not configured");

  const credsPath = join(homedir(), ".claude", ".credentials.json");
  const creds = JSON.parse(readFileSync(credsPath, "utf8")) as { mcpOAuth?: Record<string, McpEntry> };
  const key = Object.keys(creds.mcpOAuth ?? {}).find((k) => /higgs/i.test(k));
  if (!key) throw new Error(`No higgsfield entry found in ${credsPath} (connect Higgsfield in a Claude client first)`);
  const e = creds.mcpOAuth![key];

  const serialized = buildHiggsfieldBundleFromMcpEntry({
    accessToken: e.accessToken,
    refreshToken: e.refreshToken,
    expiresAt: e.expiresAt,
    clientId: e.clientId,
  });

  const client = getSupabaseAdminClient();
  const ref = await writeConnectorCredential(client, { workspaceId, connectorKey: "higgsfield", plaintext: serialized });
  await setConnectorCredentialRef(client, { workspaceId, orgId, connectorKey: "higgsfield", credentialRef: ref });
  await setConnectorEnabled(client, { workspaceId, connectorKey: "higgsfield", enabled: true });

  const exp = new Date(e.expiresAt).toISOString();
  console.log(`Stored higgsfield credential for workspace ${workspaceId}: accessToken oat_…${e.accessToken.slice(-4)}, refresh present, expiresAt ${exp}, enabled.`);
}

type McpEntry = { accessToken: string; refreshToken: string; expiresAt: number; clientId: string };

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 6: Add the pnpm script**

In `package.json` `"scripts"`, add (use the repo's existing script-runner — check whether other scripts use `tsx` or `dotenv -e .env.local -- tsx`; match them, e.g. the `seed:arc-demo` script):

```json
"connectors:capture-higgsfield": "tsx scripts/connectors/capture-higgsfield.ts"
```

> **Note:** match the EXACT runner used by the neighboring scripts (e.g. if `seed:arc-demo` is `dotenv -e .env.local -- tsx scripts/...`, mirror that so env loading works). Read `package.json` scripts first.

- [ ] **Step 7: Typecheck + run the helper test**

Run: `npx tsc --noEmit && pnpm test src/lib/connectors/__tests__/capture-bundle.test.ts`
Expected: clean + PASS. (The script itself isn't unit-tested; its logic lives in the tested helper.)

- [ ] **Step 8: Commit**

```bash
git add scripts/connectors/capture-higgsfield.ts src/lib/connectors/capture-bundle.ts src/lib/connectors/__tests__/capture-bundle.test.ts package.json
git commit -m "feat(connectors): single-tenant Higgsfield capture script"
```

---

## Task 7: Full verification + PR

- [ ] **Step 1: Full app test suite**

Run: `pnpm test`
Expected: PASS (no new failures).

- [ ] **Step 2: Build (real typecheck gate)**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint $(git diff --name-only main...HEAD -- '*.ts' '*.tsx')`
Expected: clean.

- [ ] **Step 4: Open the PR**

Use `superpowers:finishing-a-development-branch`. In the PR body: note this unblocks Slice 1's video scoring in prod; explain the capture-script onboarding step; restate the shared refresh-token-lineage caveat; and that the runner code is unchanged.

---

## Self-Review

**Spec coverage:**
- Credential bundle model + backward-compatible bearer parsing → Task 1. ✓
- Auto-refresh (refresh_token grant, public client) → Tasks 1 (math) + 3 (I/O). ✓
- In-place Vault persistence of the rotated bundle → Task 2 + used in Task 3. ✓
- Runner-untouched wiring in the resolution path; needs_reconnect drops the connector → Task 4. ✓
- Higgsfield health-check → Task 5. ✓
- Single-tenant capture-script onboarding → Task 6. ✓
- Error handling (malformed→bearer, refresh-fail→needs_reconnect, best-effort persist) → Tasks 1, 3, 4. ✓
- Out of scope (OAuth UI, race locking, Cloud API, runner changes) — respected; no task builds them. ✓

**Placeholder scan:** One intentional implementer note in Task 6 Step 6 (match the neighboring pnpm script's runner/env-loading) — flagged with how to resolve, not silent. No TBD/TODO in code.

**Type consistency:** `OAuthRefreshBundle` (with `kind:"oauth_refresh"`) + `serializeOAuthBundle` are defined in Task 1 and consumed identically in Tasks 3, 5, 6. `ensureFreshAccessToken(client, credentialRef, bundle)` signature matches across Tasks 3, 4, 5. `EnsureFreshResult` discriminated on `ok` used consistently. The pure `serializeOAuthBundle` emits the same `type:"oauth_refresh"` JSON that `parseConnectorCredential` reads — round-trip verified by Task 1's parse test + Task 6's build test. Note the bundle's in-memory `kind` field is NOT serialized (serializer writes `type`), and `parseConnectorCredential` re-adds `kind` on read — consistent.
