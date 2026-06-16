# Agent Connection — Pluggable Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the env-only agent "port" into a first-class, operator-managed Agent Connection — DB-backed config with `env ?? db ?? default` precedence, app-issued API tokens (issue/rotate/revoke, hashed), webhook URL/secret (env or Supabase Vault), connectivity test + live health, and a published v1 contract.

**Architecture:** A new `src/lib/agent/` module owns connection resolution, tokens, secret, and health. A pure merge helper makes precedence unit-testable; async functions do I/O through an injectable `SupabaseClient` (untyped, matching the vault/settings layers since these tables aren't in generated `database.types`). `checkAgentBearer` extends auth to accept DB token hashes alongside the env token. The Settings UI follows the existing `SettingsShell` panel pattern.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase (Postgres + Vault), vitest. `node:crypto` for hashing/HMAC.

---

## File structure

- Create `supabase/migrations/<ts>_agent_connections.sql` — two tables + vault extension.
- Create `src/lib/agent/connection.ts` — `EffectiveAgentConnection`, `AgentConnectionRow`, pure `mergeConnection()`, async `resolveAgentConnection()`.
- Create `src/lib/agent/tokens.ts` — `hashToken`, `generateToken`, `issueAgentToken`, `listAgentTokens`, `verifyAgentToken`, `revokeAgentToken`.
- Create `src/lib/agent/secret.ts` — `resolveWebhookSecret`, `writeWebhookSecret` (env or Vault, graceful).
- Create `src/lib/agent/health.ts` — `recordAgentSeen`, `recordTestResult`.
- Create `src/lib/agent/__tests__/{connection,tokens,secret}.test.ts`.
- Modify `src/lib/auth/api-token.ts` — add async `checkAgentBearer`.
- Modify every `src/app/api/v1/arc/**/route.ts` — swap `checkBearerToken(req,"ARC_AGENT_API_TOKEN")` → `checkAgentBearer(req)`.
- Modify `src/lib/arc-chat/agent-config.ts` + `notify.ts` — source config/secret from the resolver.
- Create `src/app/settings/agent-panel.tsx` + `src/app/settings/agent-actions.ts`; modify `settings-sections.ts` + `page.tsx`.
- Modify `src/app/arc/actions.ts` (`getMarkAgentStatusAction` health) — additive.
- Create `docs/agent-contract/v1.md`.

A note on the untyped client: import `type { SupabaseClient } from "@supabase/supabase-js"` and type every function's client param as `SupabaseClient` (not the generated `TypedSupabaseClient`), exactly like `src/lib/settings/store.ts`. `getSupabaseAdminClient()` is assignable to it. This avoids type errors on `.from("agent_connections")` (tables not in `database.types`).

---

## Task 1: Migration — agent_connections + agent_api_tokens

**Files:**
- Create: `supabase/migrations/20260611160000_agent_connections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Agent Connection: promotes the env-only agent "port" into operator-managed,
-- DB-backed config. Effective values resolve as env ?? db ?? default, so env-only
-- deployments are unaffected. workspace_id is a singleton ("default") today and
-- the only seam for future multi-tenancy.
--
-- Secrets policy: the app-issued API token is stored ONLY as a SHA-256 hash. The
-- outbound webhook signing secret is NOT stored here — it lives in Supabase Vault
-- (webhook_secret_ref) or in env. No plaintext secrets in application tables.

create extension if not exists supabase_vault with schema vault;

create table public.agent_connections (
  workspace_id        text primary key check (length(btrim(workspace_id)) > 0),
  display_name        text,
  agent_key           text,
  webhook_url         text,
  webhook_secret_ref  uuid,
  enabled             boolean not null default true,
  last_seen_at        timestamptz,
  last_status         text check (last_status in ('ok','error','unreachable')),
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.agent_connections enable row level security;

create trigger agent_connections_set_updated_at
before update on public.agent_connections
for each row execute function public.set_updated_at();

create table public.agent_api_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null default 'default',
  token_hash    text not null unique,
  prefix        text not null,
  label         text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index agent_api_tokens_active_idx
  on public.agent_api_tokens (workspace_id, revoked_at);

alter table public.agent_api_tokens enable row level security;

-- Seed the singleton connection row so reads/upserts always have a target.
insert into public.agent_connections (workspace_id) values ('default')
on conflict (workspace_id) do nothing;
```

- [ ] **Step 2: Verify it parses / file is well-formed**

Run: `git add supabase/migrations/20260611160000_agent_connections.sql && pnpm exec eslint --no-error-on-unmatched-pattern supabase/migrations/20260611160000_agent_connections.sql; echo "sql is not linted; visual check only"`
Expected: no crash. (Migrations apply via Supabase, not in CI; the `set_updated_at()` trigger fn and `gen_random_uuid()` already exist from earlier migrations.)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): migration for agent_connections + agent_api_tokens"
```

---

## Task 2: Connection resolver (pure merge + async resolve)

**Files:**
- Create: `src/lib/agent/connection.ts`
- Test: `src/lib/agent/__tests__/connection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { mergeConnection, DEFAULT_CONNECTION } from "../connection";

describe("mergeConnection", () => {
  it("uses defaults when no env and no row", () => {
    const c = mergeConnection({}, null);
    expect(c.displayName).toBe(DEFAULT_CONNECTION.displayName);
    expect(c.enabled).toBe(true);
    expect(c.source.displayName).toBe("default");
  });

  it("uses the db row when present and no env", () => {
    const c = mergeConnection({}, {
      workspace_id: "default", display_name: "Atlas", agent_key: "atlas",
      webhook_url: "https://x/hook", webhook_secret_ref: null, enabled: false,
      last_seen_at: "t", last_status: "ok", last_error: null,
    });
    expect(c.displayName).toBe("Atlas");
    expect(c.agentKey).toBe("atlas");
    expect(c.webhookUrl).toBe("https://x/hook");
    expect(c.enabled).toBe(false);
    expect(c.health.lastStatus).toBe("ok");
    expect(c.source.webhookUrl).toBe("db");
  });

  it("env overrides the db row", () => {
    const c = mergeConnection(
      { ARC_DISPLAY_NAME: "EnvName", ARC_RUNNER_URL: "https://env/hook", ARC_AGENT_KEY: "envkey" },
      { workspace_id: "default", display_name: "Atlas", agent_key: "atlas", webhook_url: "https://db/hook", webhook_secret_ref: null, enabled: true, last_seen_at: null, last_status: null, last_error: null },
    );
    expect(c.displayName).toBe("EnvName");
    expect(c.webhookUrl).toBe("https://env/hook");
    expect(c.agentKey).toBe("envkey");
    expect(c.source.displayName).toBe("env");
    expect(c.source.webhookUrl).toBe("env");
  });

  it("honors ARC_WEBHOOK_URL as a webhook fallback alias", () => {
    const c = mergeConnection({ ARC_WEBHOOK_URL: "https://legacy/hook" }, null);
    expect(c.webhookUrl).toBe("https://legacy/hook");
    expect(c.source.webhookUrl).toBe("env");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/agent/__tests__/connection.test.ts`
Expected: FAIL — cannot find module `../connection`.

- [ ] **Step 3: Implement `connection.ts`**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentConnectionRow = {
  workspace_id: string;
  display_name: string | null;
  agent_key: string | null;
  webhook_url: string | null;
  webhook_secret_ref: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  last_status: "ok" | "error" | "unreachable" | null;
  last_error: string | null;
};

export type FieldSource = "env" | "db" | "default";

export type EffectiveAgentConnection = {
  workspaceId: string;
  displayName: string;
  agentKey: string;
  webhookUrl: string | null;
  /** Vault ref for the signing secret; resolved separately in secret.ts. */
  webhookSecretRef: string | null;
  enabled: boolean;
  health: { lastSeenAt: string | null; lastStatus: "ok" | "error" | "unreachable" | null; lastError: string | null };
  source: { displayName: FieldSource; agentKey: FieldSource; webhookUrl: FieldSource; enabled: FieldSource };
};

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_CONNECTION = { displayName: "Arc", agentKey: "arc" };

type EnvLike = Record<string, string | undefined>;

/** Pure precedence: env ?? db ?? default, with a source marker per field. */
export function mergeConnection(env: EnvLike, row: AgentConnectionRow | null): EffectiveAgentConnection {
  const envWebhook = env.ARC_RUNNER_URL ?? env.ARC_WEBHOOK_URL ?? undefined;
  const pick = <T>(envVal: T | undefined, dbVal: T | null | undefined, def: T): [T, FieldSource] =>
    envVal != null && envVal !== "" ? [envVal, "env"] : dbVal != null ? [dbVal as T, "db"] : [def, "default"];

  const [displayName, dnSrc] = pick(env.ARC_DISPLAY_NAME?.trim() || undefined, row?.display_name, DEFAULT_CONNECTION.displayName);
  const [agentKey, akSrc] = pick(env.ARC_AGENT_KEY?.trim() || undefined, row?.agent_key, DEFAULT_CONNECTION.agentKey);
  const [webhookUrl, urlSrc] = pick<string | null>(envWebhook, row?.webhook_url ?? null, null);
  // enabled: env presence of ARC_WEBHOOK_DISABLED=1 forces off; else db; else default true.
  const envDisabled = env.ARC_WEBHOOK_DISABLED === "1" ? false : undefined;
  const [enabled, enSrc] = pick<boolean>(envDisabled, row?.enabled, true);

  return {
    workspaceId: row?.workspace_id ?? DEFAULT_WORKSPACE_ID,
    displayName,
    agentKey,
    webhookUrl,
    webhookSecretRef: row?.webhook_secret_ref ?? null,
    enabled,
    health: { lastSeenAt: row?.last_seen_at ?? null, lastStatus: row?.last_status ?? null, lastError: row?.last_error ?? null },
    source: { displayName: dnSrc, agentKey: akSrc, webhookUrl: urlSrc, enabled: enSrc },
  };
}

/** Fetch the singleton row (or null) and merge with env. Never throws. */
export async function resolveAgentConnection(client?: SupabaseClient): Promise<EffectiveAgentConnection> {
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return mergeConnection(process.env, null);
  try {
    const { data } = await supabase
      .from("agent_connections")
      .select("*")
      .eq("workspace_id", DEFAULT_WORKSPACE_ID)
      .maybeSingle<AgentConnectionRow>();
    return mergeConnection(process.env, data ?? null);
  } catch {
    return mergeConnection(process.env, null);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/agent/__tests__/connection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/connection.ts src/lib/agent/__tests__/connection.test.ts
git commit -m "feat(agent): connection resolver with env?db?default precedence"
```

---

## Task 3: API tokens (hash, generate, issue, verify, revoke)

**Files:**
- Create: `src/lib/agent/tokens.ts`
- Test: `src/lib/agent/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { hashToken, generateToken, verifyAgentToken } from "../tokens";

describe("token primitives", () => {
  it("hashes deterministically to 64 hex chars", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates an sk_live_ token whose hash/prefix match the plaintext", () => {
    const t = generateToken();
    expect(t.plaintext.startsWith("sk_live_")).toBe(true);
    expect(t.prefix).toBe(t.plaintext.slice(0, 12));
    expect(t.hash).toBe(hashToken(t.plaintext));
  });
});

describe("verifyAgentToken", () => {
  function fakeClient(row: { workspace_id: string } | null) {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    return {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
        update,
      }),
      _update: update,
    } as never;
  }

  it("returns the workspace for a known, non-revoked token", async () => {
    const res = await verifyAgentToken("sk_live_known", fakeClient({ workspace_id: "default" }));
    expect(res).toEqual({ ok: true, workspaceId: "default" });
  });

  it("returns not-ok for an unknown token", async () => {
    const res = await verifyAgentToken("sk_live_nope", fakeClient(null));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/agent/__tests__/tokens.test.ts`
Expected: FAIL — cannot find module `../tokens`.

- [ ] **Step 3: Implement `tokens.ts`**

```typescript
import { createHash, randomBytes } from "node:crypto";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = "sk_live_" + randomBytes(24).toString("base64url");
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashToken(plaintext) };
}

export type AgentTokenSummary = {
  id: string;
  prefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Issue a token. Returns the plaintext ONCE — it is never recoverable after. */
export async function issueAgentToken(
  label: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ plaintext: string; summary: AgentTokenSummary }> {
  const { plaintext, prefix, hash } = generateToken();
  const { data, error } = await client
    .from("agent_api_tokens")
    .insert({ workspace_id: DEFAULT_WORKSPACE_ID, token_hash: hash, prefix, label: label.trim() || null })
    .select("id, prefix, label, created_at, last_used_at, revoked_at")
    .single<{ id: string; prefix: string; label: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }>();
  if (error || !data) throw new Error(`agent_api_tokens insert: ${error?.message ?? "no row"}`);
  return {
    plaintext,
    summary: { id: data.id, prefix: data.prefix, label: data.label, createdAt: data.created_at, lastUsedAt: data.last_used_at, revokedAt: data.revoked_at },
  };
}

export async function listAgentTokens(client: SupabaseClient = getSupabaseAdminClient()): Promise<AgentTokenSummary[]> {
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("id, prefix, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`agent_api_tokens list: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string, prefix: r.prefix as string, label: (r.label as string | null), createdAt: r.created_at as string,
    lastUsedAt: r.last_used_at as string | null, revokedAt: r.revoked_at as string | null,
  }));
}

export type VerifyResult = { ok: true; workspaceId: string } | { ok: false };

/** Match a presented token against a non-revoked hash; bump last_used on hit. */
export async function verifyAgentToken(plaintext: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<VerifyResult> {
  const hash = hashToken(plaintext);
  const { data, error } = await client
    .from("agent_api_tokens")
    .select("workspace_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle<{ workspace_id: string }>();
  if (error || !data) return { ok: false };
  await client.from("agent_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
  return { ok: true, workspaceId: data.workspace_id };
}

export async function revokeAgentToken(id: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<void> {
  const { error } = await client.from("agent_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`agent_api_tokens revoke: ${error.message}`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/agent/__tests__/tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tokens.ts src/lib/agent/__tests__/tokens.test.ts
git commit -m "feat(agent): app-issued API tokens (hash/issue/verify/revoke)"
```

---

## Task 4: checkAgentBearer (env token OR DB token hash)

**Files:**
- Modify: `src/lib/auth/api-token.ts`
- Test: `src/lib/auth/__tests__/check-agent-bearer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkAgentBearer } from "../api-token";

function req(token?: string): Request {
  return new Request("https://x/api", { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

describe("checkAgentBearer", () => {
  beforeEach(() => { delete process.env.ARC_AGENT_API_TOKEN; });

  it("accepts the env token (back-compat)", async () => {
    process.env.ARC_AGENT_API_TOKEN = "env-secret";
    const res = await checkAgentBearer(req("env-secret"));
    expect(res.ok).toBe(true);
  });

  it("accepts a DB token when env token does not match", async () => {
    process.env.ARC_AGENT_API_TOKEN = "env-secret";
    const verify = vi.fn().mockResolvedValue({ ok: true, workspaceId: "default" });
    const res = await checkAgentBearer(req("sk_live_db"), { verify, anyConfigured: async () => true });
    expect(res.ok).toBe(true);
    expect(verify).toHaveBeenCalledWith("sk_live_db");
  });

  it("401s on a bad token when something is configured", async () => {
    const res = await checkAgentBearer(req("nope"), { verify: async () => ({ ok: false }), anyConfigured: async () => true });
    expect(res).toMatchObject({ ok: false, status: 401 });
  });

  it("503s when nothing is configured at all", async () => {
    const res = await checkAgentBearer(req("nope"), { verify: async () => ({ ok: false }), anyConfigured: async () => false });
    expect(res).toMatchObject({ ok: false, status: 503 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/auth/__tests__/check-agent-bearer.test.ts`
Expected: FAIL — `checkAgentBearer` is not exported.

- [ ] **Step 3: Implement — append to `api-token.ts`**

```typescript
import { verifyAgentToken } from "@/lib/agent/tokens";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

type AgentBearerDeps = {
  verify: (plaintext: string) => Promise<{ ok: boolean }>;
  /** True when an env token OR Supabase (where DB tokens live) is configured. */
  anyConfigured: () => Promise<boolean>;
};

const DEFAULT_DEPS: AgentBearerDeps = {
  verify: (p) => verifyAgentToken(p),
  anyConfigured: async () => Boolean(process.env.ARC_AGENT_API_TOKEN) || isSupabaseAdminConfigured(),
};

/**
 * Bearer auth for the agent (Arc) API surface. Accepts the env
 * ARC_AGENT_API_TOKEN (back-compat) OR any non-revoked app-issued DB token.
 * 503 when nothing is configured; 401 on mismatch.
 */
export async function checkAgentBearer(
  request: HeaderCarrier,
  deps: AgentBearerDeps = DEFAULT_DEPS,
): Promise<BearerTokenResult> {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : null;

  const envToken = process.env.ARC_AGENT_API_TOKEN;
  if (envToken && presented === envToken) return { ok: true };

  if (presented) {
    const r = await deps.verify(presented);
    if (r.ok) return { ok: true };
  }

  if (!(await deps.anyConfigured())) return { ok: false, status: 503, reason: "not_configured" };
  return { ok: false, status: 401, reason: "unauthorized" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/auth/__tests__/check-agent-bearer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/api-token.ts src/lib/auth/__tests__/check-agent-bearer.test.ts
git commit -m "feat(agent): checkAgentBearer accepts env or DB-issued tokens"
```

---

## Task 5: Swap Arc routes to checkAgentBearer

**Files:**
- Modify: every `src/app/api/v1/arc/**/route.ts` that calls `checkBearerToken(request, "ARC_AGENT_API_TOKEN")` (NOT the lead-intake route, which keeps `checkBearerToken`).

- [ ] **Step 1: Find call sites**

Run: `grep -rln 'checkBearerToken(request, "ARC_AGENT_API_TOKEN")' src/app/api/v1/arc`
Expected: a list of route files (runs, ping, messages, steps, tasks/*, drafts, approvals, crm/*, etc.).

- [ ] **Step 2: For EACH file, replace the call**

Change the import `import { checkBearerToken } from "@/lib/auth/api-token";` → `import { checkAgentBearer } from "@/lib/auth/api-token";`
Change `const auth = checkBearerToken(request, "ARC_AGENT_API_TOKEN");` → `const auth = await checkAgentBearer(request);`
(The handler is already `async`; the `auth.ok`/`auth.status`/`auth.reason` shape is unchanged, so nothing else moves.)

- [ ] **Step 3: Verify existing route tests still pass**

Run: `pnpm vitest run src/app/api/v1/arc`
Expected: PASS — existing `ping`, `tasks`, `messages`, `health`, `drafts` tests green (they set `ARC_AGENT_API_TOKEN`, which the env branch still honors).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/app/api/v1/arc
git commit -m "refactor(agent): arc routes authenticate via checkAgentBearer"
```

---

## Task 6: Webhook signing secret (env or Supabase Vault)

**Files:**
- Create: `src/lib/agent/secret.ts`
- Test: `src/lib/agent/__tests__/secret.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveWebhookSecret } from "../secret";

describe("resolveWebhookSecret", () => {
  beforeEach(() => { delete process.env.ARC_WEBHOOK_SECRET; });

  it("prefers the env secret over vault", async () => {
    process.env.ARC_WEBHOOK_SECRET = "env-secret";
    const client = { from: vi.fn() } as never;
    expect(await resolveWebhookSecret("vault-ref", client)).toBe("env-secret");
    expect((client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("reads vault when no env secret and a ref exists", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { decrypted_secret: "vault-secret" }, error: null }) }) }) }),
    } as never;
    expect(await resolveWebhookSecret("vault-ref", client)).toBe("vault-secret");
  });

  it("returns null when neither env nor ref is present", async () => {
    expect(await resolveWebhookSecret(null, { from: vi.fn() } as never)).toBeNull();
  });

  it("degrades to null (never throws) if vault read fails", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "no vault" } }) }) }) }) } as never;
    expect(await resolveWebhookSecret("vault-ref", client)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/agent/__tests__/secret.test.ts`
Expected: FAIL — cannot find module `../secret`.

- [ ] **Step 3: Implement `secret.ts`**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

/**
 * Resolve the outbound HMAC signing secret: env ARC_WEBHOOK_SECRET wins; else
 * read the Supabase Vault secret referenced by `ref`. Never throws — a missing
 * or unreachable Vault degrades to null (the wake then goes unsigned, as today).
 */
export async function resolveWebhookSecret(ref: string | null, client?: SupabaseClient): Promise<string | null> {
  const envSecret = process.env.ARC_WEBHOOK_SECRET;
  if (envSecret) return envSecret;
  if (!ref) return null;
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", ref)
      .maybeSingle<{ decrypted_secret: string }>();
    if (error || !data) return null;
    return data.decrypted_secret;
  } catch {
    return null;
  }
}

/**
 * Write/rotate the signing secret into Vault and point the connection row at it.
 * Returns the new ref. Throws if Supabase/Vault is unavailable (the caller — a
 * server action — surfaces that to the operator).
 */
export async function writeWebhookSecret(plaintext: string, client: SupabaseClient = getSupabaseAdminClient()): Promise<string> {
  const name = `agent_webhook_secret_${DEFAULT_WORKSPACE_ID}`;
  const { data, error } = await client.rpc("create_secret", { new_secret: plaintext, new_name: name, new_description: "Agent outbound webhook HMAC signing secret" });
  if (error || !data) throw new Error(`vault.create_secret: ${error?.message ?? "no id"}`);
  const ref = data as string;
  const { error: upErr } = await client.from("agent_connections").update({ webhook_secret_ref: ref }).eq("workspace_id", DEFAULT_WORKSPACE_ID);
  if (upErr) throw new Error(`agent_connections secret ref: ${upErr.message}`);
  return ref;
}
```

Note: `create_secret` is exposed as an RPC in the `vault` schema; if `client.rpc("create_secret", …)` is not reachable in the target project, fall back to `client.schema("vault").rpc("create_secret", …)`. The test only covers `resolveWebhookSecret`; `writeWebhookSecret` is exercised manually (Step 4 of Task 10).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/agent/__tests__/secret.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/secret.ts src/lib/agent/__tests__/secret.test.ts
git commit -m "feat(agent): webhook signing secret via env or Supabase Vault"
```

---

## Task 7: Health writers

**Files:**
- Create: `src/lib/agent/health.ts`

- [ ] **Step 1: Implement (no separate test — thin upserts, covered by manual Task 10)**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "./connection";

/** Stamp last_seen_at when the agent calls in. Best-effort; never throws. */
export async function recordAgentSeen(client?: SupabaseClient): Promise<void> {
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return;
  try {
    await supabase.from("agent_connections").update({ last_seen_at: new Date().toISOString(), last_status: "ok", last_error: null }).eq("workspace_id", DEFAULT_WORKSPACE_ID);
  } catch { /* best-effort */ }
}

/** Record the outcome of a connectivity test. Best-effort; never throws. */
export async function recordTestResult(result: { status: "ok" | "error" | "unreachable"; error?: string | null }, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return;
  try {
    const patch: Record<string, unknown> = { last_status: result.status, last_error: result.error ?? null };
    if (result.status === "ok") patch.last_seen_at = new Date().toISOString();
    await supabase.from("agent_connections").update(patch).eq("workspace_id", DEFAULT_WORKSPACE_ID);
  } catch { /* best-effort */ }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/agent/health.ts
git commit -m "feat(agent): health writers (recordAgentSeen, recordTestResult)"
```

---

## Task 8: Source notify + agent-config from the resolver

**Files:**
- Modify: `src/lib/arc-chat/notify.ts` (re-read first), `src/lib/arc-chat/agent-config.ts`

- [ ] **Step 1: Rewrite `agent-config.ts` as resolver wrappers**

```typescript
/**
 * Agent Port config. Thin wrappers over the Agent Connection resolver so existing
 * imports keep working while config becomes DB-backed (env still overrides).
 */
import { resolveAgentConnection } from "@/lib/agent/connection";

export async function markAgentKeys(): Promise<string[]> {
  const c = await resolveAgentConnection();
  return [c.agentKey];
}

export async function isMarkRunnerConfigured(): Promise<boolean> {
  const c = await resolveAgentConnection();
  return Boolean(c.webhookUrl);
}

export async function getMarkDisplayName(): Promise<string> {
  const c = await resolveAgentConnection();
  return c.displayName;
}
```

Note: these become `async`. Update callers — `grep -rn "markAgentKeys()\|getMarkDisplayName()\|isMarkRunnerConfigured()" src` — to `await` them (notably `src/app/arc/actions.ts:getMarkAgentStatusAction`, handled in Task 9).

- [ ] **Step 2: Rewrite the head of `notifyMarkWebhook` in `notify.ts`**

Replace the env reads at the top of the function body:

```typescript
import { resolveAgentConnection } from "@/lib/agent/connection";
import { resolveWebhookSecret } from "@/lib/agent/secret";
// ...
export async function notifyMarkWebhook(payload: ArcNotifyPayload): Promise<boolean> {
  const conn = await resolveAgentConnection();
  const url = conn.webhookUrl;
  if (!url) return false;
  if (!conn.enabled) return false; // operator kill-switch (env ARC_WEBHOOK_DISABLED or DB)

  const body = JSON.stringify({ type: "arc_chat_message", ...payload });
  const headers: Record<string, string> = { "content-type": "application/json" };

  const secret = await resolveWebhookSecret(conn.webhookSecretRef);
  if (secret) {
    headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }
  // ...unchanged: AbortController timeout + fetch + return res.ok
}
```

Remove the now-superseded `getAppSettings().markWebhookEnabled` gate (folded into `conn.enabled`).

- [ ] **Step 3: Verify arc-chat tests**

Run: `pnpm vitest run src/lib/arc-chat`
Expected: PASS. If `notify.test.ts` stubbed env directly, update it to stub `resolveAgentConnection`/`resolveWebhookSecret` (mock `@/lib/agent/connection` + `@/lib/agent/secret`) so the URL/secret/enabled come through; keep the HMAC assertion.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/arc-chat/notify.ts src/lib/arc-chat/agent-config.ts
git commit -m "refactor(agent): notify + agent-config source from the resolver"
```

---

## Task 9: Connectivity test action + health-aware status

**Files:**
- Modify: `src/app/arc/actions.ts` (re-read first) — update `getMarkAgentStatusAction`; add `testAgentConnectionAction`.

- [ ] **Step 1: Update `getMarkAgentStatusAction` to use the resolver + health**

```typescript
import { resolveAgentConnection } from "@/lib/agent/connection";

export type MarkAgentStatus = { attached: boolean; name: string; lastSeenAt: string | null; lastStatus: "ok" | "error" | "unreachable" | null };

export async function getMarkAgentStatusAction(): Promise<MarkAgentStatus> {
  const conn = await resolveAgentConnection();
  return {
    attached: Boolean(conn.webhookUrl),
    name: conn.displayName,
    lastSeenAt: conn.health.lastSeenAt,
    lastStatus: conn.health.lastStatus,
  };
}
```

Update `MarkConnection` (`src/app/arc/_components/arc-connection.tsx`) only if you want to show "last seen" — optional; the `attached`/`name` fields it already reads are unchanged, so this is non-breaking.

- [ ] **Step 2: Add `testAgentConnectionAction`**

```typescript
"use server";
import { createHmac } from "node:crypto";
import { requireOperator } from "@/lib/auth/operator";
import { resolveAgentConnection } from "@/lib/agent/connection";
import { resolveWebhookSecret } from "@/lib/agent/secret";
import { recordTestResult } from "@/lib/agent/health";

export type AgentTestResult = { ok: boolean; status: "ok" | "error" | "unreachable"; roundTripMs: number; message?: string };

export async function testAgentConnectionAction(): Promise<AgentTestResult> {
  await requireOperator();
  const conn = await resolveAgentConnection();
  if (!conn.webhookUrl) {
    await recordTestResult({ status: "unreachable", error: "No webhook URL configured." });
    return { ok: false, status: "unreachable", roundTripMs: 0, message: "Set a webhook URL first." };
  }
  const body = JSON.stringify({ type: "ping", workspaceId: conn.workspaceId, nonce: createHmac("sha256", "n").update(String(Math.random())).digest("hex"), at: new Date().toISOString() });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = await resolveWebhookSecret(conn.webhookSecretRef);
  if (secret) headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const started = Date.now();
  try {
    const res = await fetch(conn.webhookUrl, { method: "POST", headers, body, signal: controller.signal });
    const roundTripMs = Date.now() - started;
    const status: "ok" | "error" = res.ok ? "ok" : "error";
    await recordTestResult({ status, error: res.ok ? null : `HTTP ${res.status}` });
    return { ok: res.ok, status, roundTripMs, message: res.ok ? "Agent responded." : `Agent returned HTTP ${res.status}.` };
  } catch (e) {
    await recordTestResult({ status: "unreachable", error: e instanceof Error ? e.message : "unreachable" });
    return { ok: false, status: "unreachable", roundTripMs: Date.now() - started, message: "Could not reach the agent webhook." };
  } finally {
    clearTimeout(timeout);
  }
}
```

Note: `Math.random()`/`Date.now()` are fine in a server action (this is app code, not a workflow script).

- [ ] **Step 3: Wire `recordAgentSeen` into the ping route** (`src/app/api/v1/arc/ping/route.ts`): after a successful `checkAgentBearer`, call `await recordAgentSeen();` before returning 200 (so any agent call-in stamps health). Import from `@/lib/agent/health`.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/app/arc/actions.ts src/app/api/v1/arc/ping/route.ts src/app/arc/_components/arc-connection.tsx
git commit -m "feat(agent): connectivity test action + health-aware status"
```

---

## Task 10: Settings → Agent panel + actions + section

**Files:**
- Create: `src/app/settings/agent-actions.ts`, `src/app/settings/agent-panel.tsx`
- Modify: `src/app/settings/settings-sections.ts`, `src/app/settings/page.tsx`

- [ ] **Step 1: Add the section id**

In `settings-sections.ts`, add `{ id: "agent", label: "Agent" }` to `SETTINGS_SECTIONS` (after `connections`).

- [ ] **Step 2: Write `agent-actions.ts`** (wired server actions, operator-gated)

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/operator";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID } from "@/lib/agent/connection";
import { issueAgentToken, revokeAgentToken } from "@/lib/agent/tokens";
import { writeWebhookSecret } from "@/lib/agent/secret";

async function guard() {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase admin env vars required to manage the agent connection.");
}

export async function saveAgentIdentityAction(formData: FormData): Promise<void> {
  await guard();
  const display_name = String(formData.get("display_name") ?? "").trim() || null;
  const agent_key = String(formData.get("agent_key") ?? "").trim() || null;
  const webhook_url = String(formData.get("webhook_url") ?? "").trim() || null;
  const enabled = formData.get("enabled") === "on";
  await getSupabaseAdminClient().from("agent_connections")
    .update({ display_name, agent_key, webhook_url, enabled })
    .eq("workspace_id", DEFAULT_WORKSPACE_ID);
  revalidatePath("/settings");
}

export async function issueAgentTokenAction(formData: FormData): Promise<{ plaintext: string }> {
  await guard();
  const label = String(formData.get("label") ?? "");
  const { plaintext } = await issueAgentToken(label);
  revalidatePath("/settings");
  return { plaintext };
}

export async function revokeAgentTokenAction(formData: FormData): Promise<void> {
  await guard();
  await revokeAgentToken(String(formData.get("id") ?? ""));
  revalidatePath("/settings");
}

export async function setWebhookSecretAction(formData: FormData): Promise<void> {
  await guard();
  const secret = String(formData.get("secret") ?? "").trim();
  if (secret) await writeWebhookSecret(secret);
  revalidatePath("/settings");
}
```

- [ ] **Step 3: Write `agent-panel.tsx`** (server component; reads resolver + token list)

```tsx
import { resolveAgentConnection } from "@/lib/agent/connection";
import { listAgentTokens } from "@/lib/agent/tokens";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { Panel } from "@/app/_components/page-header";
import { saveAgentIdentityAction, issueAgentTokenAction, revokeAgentTokenAction, setWebhookSecretAction } from "./agent-actions";
import { testAgentConnectionAction } from "@/app/arc/actions";
import { AgentTestButton, AgentTokenIssue } from "./agent-panel.client";

export async function AgentPanel() {
  if (!isSupabaseAdminConfigured()) {
    return <Panel title="Agent"><p className="text-sm text-[var(--text-muted)]">Configure Supabase to manage the agent connection. Until then, the agent reads its config from environment variables.</p></Panel>;
  }
  const conn = await resolveAgentConnection();
  const tokens = await listAgentTokens();
  const envBadge = (src: string) => (src === "env" ? <span className="ml-2 rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">overridden by env</span> : null);

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Identity">
        <form action={saveAgentIdentityAction} className="flex flex-col gap-3">
          <label className="text-sm">Display name {envBadge(conn.source.displayName)}
            <input name="display_name" defaultValue={conn.displayName} className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-sm">Agent key {envBadge(conn.source.agentKey)}
            <input name="agent_key" defaultValue={conn.agentKey} className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-sm">Webhook URL {envBadge(conn.source.webhookUrl)}
            <input name="webhook_url" defaultValue={conn.webhookUrl ?? ""} placeholder="https://host/webhooks/growth-chat" className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={conn.enabled} /> Wake the agent on new messages</label>
          <button type="submit" className="self-start rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--on-accent)]">Save</button>
        </form>
      </Panel>

      <Panel title="Outbound — signing secret & test">
        <form action={setWebhookSecretAction} className="flex items-end gap-2">
          <label className="flex-1 text-sm">Set / rotate signing secret
            <input name="secret" type="password" placeholder="paste a shared secret" className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--border-strong)]">Save secret</button>
        </form>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Status: {conn.health.lastStatus ?? "untested"}{conn.health.lastSeenAt ? ` · last seen ${conn.health.lastSeenAt}` : ""}</p>
        <AgentTestButton action={testAgentConnectionAction} />
      </Panel>

      <Panel title="Inbound — API tokens">
        <AgentTokenIssue action={issueAgentTokenAction} />
        <ul className="mt-3 flex flex-col gap-1.5">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm shadow-[inset_0_0_0_1px_var(--border-hairline)]">
              <span className="font-mono text-xs">{t.prefix}…{t.label ? ` · ${t.label}` : ""}{t.revokedAt ? " · revoked" : ""}</span>
              {!t.revokedAt ? (
                <form action={revokeAgentTokenAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-[var(--priority-bright)]">Revoke</button></form>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Write the two client bits** — `src/app/settings/agent-panel.client.tsx`

```tsx
"use client";
import { useState, useTransition } from "react";
import type { AgentTestResult } from "@/app/arc/actions";

export function AgentTestButton({ action }: { action: () => Promise<AgentTestResult> }) {
  const [res, setRes] = useState<AgentTestResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex items-center gap-3">
      <button type="button" onClick={() => start(async () => setRes(await action()))} className="rounded-lg px-3 py-1.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--border-strong)]">{pending ? "Testing…" : "Test connection"}</button>
      {res ? <span className={`text-xs ${res.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-bright)]"}`}>{res.message} {res.ok ? `(${res.roundTripMs}ms)` : ""}</span> : null}
    </div>
  );
}

export function AgentTokenIssue({ action }: { action: (fd: FormData) => Promise<{ plaintext: string }> }) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => setPlaintext((await action(fd)).plaintext)); e.currentTarget.reset(); }} className="flex items-end gap-2">
        <label className="flex-1 text-sm">New token label<input name="label" placeholder="e.g. prod runner" className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-sm" /></label>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--on-accent)]">{pending ? "Generating…" : "Generate token"}</button>
      </form>
      {plaintext ? <p className="rounded-md bg-[var(--warn-soft)] p-2 font-mono text-xs text-[var(--warn-text)] break-all">Copy now — shown once: {plaintext}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Mount the panel** in `page.tsx` — import `AgentPanel`, add `agent: <AgentPanel />` to the `panels={{…}}` map.

- [ ] **Step 6: Verify build + manual smoke**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/settings/agent-panel.tsx src/app/settings/agent-panel.client.tsx src/app/settings/agent-actions.ts`
Expected: clean. Manual (with Supabase configured): open `/settings` → Agent; Generate token (plaintext shows once); set webhook URL + secret; Test connection shows a status; revoke a token.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/agent-actions.ts src/app/settings/agent-panel.tsx src/app/settings/agent-panel.client.tsx src/app/settings/settings-sections.ts src/app/settings/page.tsx
git commit -m "feat(agent): Settings -> Agent panel (tokens, webhook, test, health)"
```

---

## Task 11: Published v1 contract doc

**Files:**
- Create: `docs/agent-contract/v1.md`

- [ ] **Step 1: Write the contract**

Document, with real shapes drawn from the code:
- **Wake (app → agent):** `POST {webhookUrl}`, body `{ "type": "arc_chat_message", messageId, conversationId, agentTaskId, message, mentions, operator, route, mode, command?, attachments? }` (from `ArcNotifyPayload` in `src/lib/arc-chat/notify.ts`). Header `X-Webhook-Signature: <hex>` = `HMAC-SHA256(rawBody, signingSecret)`. Respond 2xx to ack.
- **Auth (agent → app):** `Authorization: Bearer <token>` (env `ARC_AGENT_API_TOKEN` or an app-issued `sk_live_…` token).
- **Inbound endpoints** (reference each route's method/path/body/response): `GET /api/v1/arc/ping`; tasks `claim`/`complete`/`block`/`log`; `POST /api/v1/arc/messages`; `POST /api/v1/arc/messages/{agentTaskId}/steps`; drafts; approvals.
- **Reply contract:** post the reply to `/api/v1/arc/messages` settling `agentTaskId`; emit steps best-effort.
- **Fallback:** if a wake isn't delivered (non-2xx/unreachable), the agent pulls queued work from the inbox.
- Header: "Contract version: v1. Backwards-compatible additions only within v1."

- [ ] **Step 2: Commit**

```bash
git add docs/agent-contract/v1.md
git commit -m "docs(agent): published v1 agent connection contract"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc clean; all tests pass (existing + new connection/tokens/secret/bearer suites).

- [ ] **Step 2: Lint changed files only** (repo-wide lint scans vendor noise)

Run: `pnpm exec eslint $(git diff --name-only main -- '*.ts' '*.tsx' | tr '\n' ' ')`
Expected: clean.

- [ ] **Step 3: Confirm back-compat** — with `ARC_AGENT_API_TOKEN` set and no Supabase, `GET /api/v1/arc/ping` with that bearer still returns 200 (env path in `checkAgentBearer`); `resolveAgentConnection()` returns env values.

---

## Self-Review

- **Spec coverage:** Agent Port module + resolver (T2), tables/migration (T1), hashed tokens issue/rotate/revoke (T3), `checkAgentBearer` env-or-DB + route swap (T4–T5), webhook secret env/Vault (T6), health (T7), resolver-sourced notify/config (T8), connectivity test + health status (T9), Settings → Agent UI (T10), published v1 contract (T11), back-compat + tests (T12). ✓ All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓
- **Type consistency:** `EffectiveAgentConnection`/`mergeConnection`/`AgentConnectionRow` (T2) are consumed unchanged in T6/T8/T9; `issueAgentToken`/`verifyAgentToken`/`revokeAgentToken`/`AgentTokenSummary` (T3) match their callers in T4/T10; `checkAgentBearer` signature (T4) matches the route swap (T5); `AgentTestResult` (T9) matches the client button (T10). ✓
- **Scope:** single subsystem (the agent connection); no multi-tenancy/billing/reference-agent. `workspace_id` is the only future seam. ✓
- **Deviation from spec noted:** the spec said `src/app/settings/agent/` (a route dir); the plan instead adds an `agent` panel to the existing `SettingsShell` (`settings-sections.ts` + `page.tsx`), matching the established settings pattern — same UX, idiomatic placement.
