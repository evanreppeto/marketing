# Arc Workspace Connectors — Phase 1 Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each workspace store its own connector credentials (encrypted in Supabase Vault) and toggle connectors on/off from Settings, proven end-to-end by making the existing Gemini `research_web` tool use the workspace's own `GEMINI_API_KEY` instead of one global env var.

**Architecture:** A pure connector registry (`src/domain/connectors.ts`) defines the catalog. A new workspace-scoped `workspace_connectors` table stores enable state + a Vault secret ref per connector (never plaintext). A `src/lib/connectors/` layer (credentials/persistence/read-model) mirrors the existing `src/lib/connections/` shape. Server actions in Settings let an operator paste a key and toggle the connector. The Gemini web-search route resolves the workspace's stored key (vault) with the env var as fallback. No remote-MCP loading in this slice — that is Slice B.

**Tech Stack:** Next.js 16 / React 19, Supabase (Postgres + Vault), Vitest, TypeScript. Path alias `@/*` → `./src/*`. Package manager pnpm.

**Scope note:** This is Slice A of design-doc Phase 1 (`docs/superpowers/specs/2026-06-23-arc-workspace-connectors-design.md`). Slice B (remote HTTP/SSE MCP connector loading in the runner + first external MCP connector) is a separate follow-up plan. Slice A is independently shippable: a workspace can bring its own Gemini key.

**Reference patterns to mirror (read before starting):**
- `src/domain/connections.ts` — registry + pure status compute
- `src/lib/connections/read-model.ts` and `src/lib/connections/persistence.ts` — read-model/persistence shape
- `src/lib/agent/secret.ts` — Supabase Vault `create_secret` write + `vault.decrypted_secrets` read
- `src/app/settings/connections-actions.ts` — `requireOperator()`-gated server actions
- `src/app/api/v1/arc/research/web-search/route.ts` + `src/lib/research/gemini-web-search.ts` — the route we extend (the search fn already takes an `apiKey` param)
- `src/app/api/v1/arc/_lib/http.ts` — `arcGuard` returns `{ ok, scope: { workspaceId, orgId } }`

**Memory guardrails (apply throughout):**
- The app uses the service-role client → RLS is not a backstop. **Every read/write path must filter by `workspace_id` in code.**
- `pnpm lint` scans vendored files (~31k noise) and does not typecheck. Verify with `pnpm test` + `pnpm build` (tsc). Scope eslint to changed files.
- Append a new timestamped migration; never edit a shipped one. Prod migrations are applied manually.

---

## File Structure

- Create `src/domain/connectors.ts` — pure registry + `computeConnectorStatus`. One responsibility: the catalog + status math.
- Modify `src/domain/index.ts` — re-export the new module (import from `@/domain`).
- Create `supabase/migrations/20260623120000_workspace_connectors.sql` — the workspace-scoped table.
- Create `src/lib/connectors/credentials.ts` — Vault write/read of a connector secret (I/O).
- Create `src/lib/connectors/persistence.ts` — row writes (upsert/enable/test/credential ref), workspace-scoped.
- Create `src/lib/connectors/read-model.ts` — `listWorkspaceConnectors(workspaceId)` joining registry + rows; never leaks plaintext.
- Modify `src/app/api/v1/arc/research/web-search/route.ts` — resolve the workspace's Gemini key (vault → env fallback).
- Create `src/app/settings/connectors-actions.ts` — `requireOperator()`-gated connect/enable/test server actions.
- Create `src/app/settings/connectors-panel.tsx` — catalog UI (mirrors `connections-panel.tsx`).
- Modify the Settings page to render `<ConnectorsPanel />` (locate the page that renders `connections-panel.tsx` and add alongside it).

Tests live beside their targets: `src/domain/__tests__/connectors.test.ts`, `src/lib/connectors/*.test.ts`, and an extension to `src/app/api/v1/arc/research/web-search/route.test.ts`.

---

## Task 1: Connector registry (pure domain)

**Files:**
- Create: `src/domain/connectors.ts`
- Test: `src/domain/__tests__/connectors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/connectors.test.ts
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_REGISTRY,
  computeConnectorStatus,
  findConnector,
  type ConnectorRegistryEntry,
} from "@/domain";

describe("connector registry", () => {
  it("seeds the gemini-research connector as a read-only api_key connector", () => {
    const gemini = findConnector("gemini-research");
    expect(gemini).toBeTruthy();
    expect(gemini?.authKind).toBe("api_key");
    expect(gemini?.access).toBe("read_only");
  });

  it("has unique connector keys", () => {
    const keys = CONNECTOR_REGISTRY.map((c: ConnectorRegistryEntry) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("findConnector returns null for an unknown key", () => {
    expect(findConnector("nope")).toBeNull();
  });
});

describe("computeConnectorStatus", () => {
  it("is not_configured when no credential is present", () => {
    expect(computeConnectorStatus({ credentialPresent: false, enabled: true, lastTestOk: null })).toBe("not_configured");
  });
  it("is disabled when credential present but switch off", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: false, lastTestOk: null })).toBe("disabled");
  });
  it("is error when last test failed", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: true, lastTestOk: false })).toBe("error");
  });
  it("is connected when present, enabled, and not failing", () => {
    expect(computeConnectorStatus({ credentialPresent: true, enabled: true, lastTestOk: null })).toBe("connected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/connectors.test.ts`
Expected: FAIL — `@/domain` has no `CONNECTOR_REGISTRY` / `computeConnectorStatus` / `findConnector` export.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/connectors.ts
// Pure, deterministic connector catalog + status math. No I/O. Mirrors the
// shape of connections.ts but is workspace-scoped and credential-based (a key
// stored per workspace) rather than env-var-based.

export type ConnectorAuthKind = "api_key" | "oauth" | "none";
export type ConnectorAccess = "read_only" | "gated_write";
export type ConnectorStatus = "not_configured" | "disabled" | "error" | "connected";

export type ConnectorRegistryEntry = {
  /** Stable catalog key. Also the workspace_connectors.connector_key value. */
  key: string;
  label: string;
  description: string;
  authKind: ConnectorAuthKind;
  /** Slice A only ships read_only connectors. */
  access: ConnectorAccess;
  /**
   * Remote MCP endpoint for connectors loaded into the runner (Slice B). null
   * for "native" connectors whose capability already lives in-app (Gemini).
   */
  mcpUrl: string | null;
  /** Header that carries the credential for remote MCP connectors (Slice B). */
  authHeader?: string;
  /** mcpServers map key / tool namespace for remote connectors (Slice B). */
  toolNamespace: string;
};

export const CONNECTOR_REGISTRY: ConnectorRegistryEntry[] = [
  {
    key: "gemini-research",
    label: "Gemini Web Research",
    description: "Grounded web search with citations, using this workspace's own Gemini API key.",
    authKind: "api_key",
    access: "read_only",
    mcpUrl: null,
    toolNamespace: "gemini",
  },
];

export function findConnector(key: string): ConnectorRegistryEntry | null {
  return CONNECTOR_REGISTRY.find((entry) => entry.key === key) ?? null;
}

/**
 * Operator-facing status, computed (never stored): a missing credential always
 * wins (not_configured); a disabled switch beats test state; an untested but
 * enabled connector is connected.
 */
export function computeConnectorStatus(input: {
  credentialPresent: boolean;
  enabled: boolean;
  lastTestOk: boolean | null;
}): ConnectorStatus {
  if (!input.credentialPresent) return "not_configured";
  if (!input.enabled) return "disabled";
  if (input.lastTestOk === false) return "error";
  return "connected";
}
```

- [ ] **Step 4: Add the re-export**

In `src/domain/index.ts`, add (alongside the other `export * from "./..."` lines):

```ts
export * from "./connectors";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/connectors.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/domain/connectors.ts src/domain/index.ts src/domain/__tests__/connectors.test.ts
git commit -m "feat(connectors): pure connector registry + status"
```

---

## Task 2: workspace_connectors migration

**Files:**
- Create: `supabase/migrations/20260623120000_workspace_connectors.sql`

This table is workspace-scoped (unlike the global `connections` table) and stores a Vault secret **ref**, never the secret.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260623120000_workspace_connectors.sql
-- Per-workspace connector enablement + credential ref. The credential itself
-- lives in Supabase Vault (vault.create_secret); this row stores only the ref
-- (credential_ref) plus operator state and test telemetry. Operator-facing
-- status (not_configured/disabled/error/connected) is COMPUTED in the read-model
-- (credential presence x enabled x last_test_ok), never stored here.
--
-- Distinct from the global `connections` table (20260609120000): that is the
-- single-tenant env-var outbound registry; this is multi-tenant connectors with
-- per-workspace keys. Reuses the shared set_updated_at() trigger function.

create table public.workspace_connectors (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  org_id          uuid,
  connector_key   text not null check (length(btrim(connector_key)) > 0),
  enabled         boolean not null default false,
  config          jsonb not null default '{}'::jsonb,
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

- [ ] **Step 2: Verify the SQL parses against the local stack (if available)**

If a local Supabase is running: `supabase db reset` (or apply just this migration) and confirm no error. If no local stack is available, visually confirm the `set_updated_at()` function exists in an earlier migration (it does — see `20260609120000_connections.sql` which reuses it) and move on; prod is applied manually.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260623120000_workspace_connectors.sql
git commit -m "feat(connectors): workspace_connectors table"
```

---

## Task 3: Credential vault helpers

**Files:**
- Create: `src/lib/connectors/credentials.ts`
- Test: `src/lib/connectors/credentials.test.ts`

Mirrors `src/lib/agent/secret.ts`: write via `create_secret` (RPC, with a `vault` schema fallback), read via `vault.decrypted_secrets`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/connectors/credentials.test.ts
import { describe, expect, it, vi } from "vitest";
import { readConnectorCredential, writeConnectorCredential } from "./credentials";

function clientWithRpc(ref: string) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: ref, error: null }),
  } as unknown as Parameters<typeof writeConnectorCredential>[0];
}

describe("writeConnectorCredential", () => {
  it("creates a vault secret and returns its ref", async () => {
    const client = clientWithRpc("ref-123");
    const ref = await writeConnectorCredential(client, {
      workspaceId: "ws-1",
      connectorKey: "gemini-research",
      plaintext: "secret-key",
    });
    expect(ref).toBe("ref-123");
  });

  it("throws when the vault returns no id", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as never;
    await expect(
      writeConnectorCredential(client, { workspaceId: "ws-1", connectorKey: "gemini-research", plaintext: "k" }),
    ).rejects.toThrow();
  });
});

describe("readConnectorCredential", () => {
  it("returns the decrypted secret for a ref", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { decrypted_secret: "secret-key" }, error: null });
    const client = {
      schema: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
      }),
    } as never;
    expect(await readConnectorCredential(client, "ref-123")).toBe("secret-key");
  });

  it("returns null for a missing ref", async () => {
    expect(await readConnectorCredential({} as never, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/credentials.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/connectors/credentials.ts
import { type SupabaseClient } from "@supabase/supabase-js";

// Vault-backed connector credentials. Mirrors src/lib/agent/secret.ts: write via
// create_secret (with a vault-schema fallback), read via vault.decrypted_secrets.
// Stores/returns only refs + plaintext on demand — the row never holds the secret.

type SecretRow = { decrypted_secret: string | null };
type CreateSecretArgs = { new_secret: string; new_name: string; new_description: string };
type SecretRpcResult = { data: string | null; error: { message: string } | null };
type VaultSecretClient = {
  schema(schema: "vault"): { rpc(fn: "create_secret", args: CreateSecretArgs): Promise<SecretRpcResult> };
};

export async function writeConnectorCredential(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; plaintext: string },
): Promise<string> {
  const name = `connector_${input.connectorKey}_${input.workspaceId}`;
  const args: CreateSecretArgs = {
    new_secret: input.plaintext,
    new_name: name,
    new_description: `Workspace connector credential: ${input.connectorKey}`,
  };

  let ref: string | null = null;
  try {
    const direct = await client.rpc("create_secret", args);
    if (!direct.error && direct.data) ref = String(direct.data);
  } catch {
    ref = null;
  }

  if (!ref && typeof client.schema === "function") {
    try {
      const scoped = await (client as unknown as VaultSecretClient).schema("vault").rpc("create_secret", args);
      if (!scoped.error && scoped.data) ref = String(scoped.data);
    } catch {
      ref = null;
    }
  }

  if (!ref) throw new Error("vault.create_secret: no id");
  return ref;
}

export async function readConnectorCredential(client: SupabaseClient, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  try {
    const scoped = typeof client.schema === "function" ? client.schema("vault") : client;
    const { data, error } = await scoped
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", ref)
      .maybeSingle<SecretRow>();
    if (error || !data?.decrypted_secret) return null;
    return data.decrypted_secret;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/connectors/credentials.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/credentials.ts src/lib/connectors/credentials.test.ts
git commit -m "feat(connectors): vault credential read/write"
```

---

## Task 4: Persistence (workspace-scoped rows)

**Files:**
- Create: `src/lib/connectors/persistence.ts`
- Test: `src/lib/connectors/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/connectors/persistence.test.ts
import { describe, expect, it, vi } from "vitest";
import { recordConnectorTest, setConnectorCredentialRef, setConnectorEnabled } from "./persistence";

/** Capture the upsert/update payload + the workspace filter applied. */
function captureClient() {
  const calls: { payload?: unknown; filters: Record<string, string> } = { filters: {} };
  const eq = vi.fn((col: string, val: string) => {
    calls.filters[col] = val;
    return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) };
  });
  const client = {
    from: () => ({
      upsert: (payload: unknown) => {
        calls.payload = payload;
        return { error: null };
      },
      update: (payload: unknown) => {
        calls.payload = payload;
        return { eq };
      },
    }),
  } as never;
  return { client, calls };
}

describe("setConnectorEnabled", () => {
  it("filters the update by workspace_id and connector_key", async () => {
    const { client, calls } = captureClient();
    await setConnectorEnabled(client, { workspaceId: "ws-1", connectorKey: "gemini-research", enabled: true });
    expect(calls.payload).toMatchObject({ enabled: true });
    expect(calls.filters.workspace_id).toBe("ws-1");
    expect(calls.filters.connector_key).toBe("gemini-research");
  });
});

describe("setConnectorCredentialRef", () => {
  it("upserts a row with the credential ref scoped to the workspace", async () => {
    const { client, calls } = captureClient();
    await setConnectorCredentialRef(client, {
      workspaceId: "ws-1",
      orgId: "org-1",
      connectorKey: "gemini-research",
      credentialRef: "ref-9",
    });
    expect(calls.payload).toMatchObject({
      workspace_id: "ws-1",
      org_id: "org-1",
      connector_key: "gemini-research",
      credential_ref: "ref-9",
    });
  });
});

describe("recordConnectorTest", () => {
  it("clears the error on success", async () => {
    const { client, calls } = captureClient();
    await recordConnectorTest(client, { workspaceId: "ws-1", connectorKey: "gemini-research", result: { ok: true } });
    expect(calls.payload).toMatchObject({ last_test_ok: true, last_test_error: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/persistence.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/connectors/persistence.ts
import { type SupabaseClient } from "@supabase/supabase-js";

// Workspace-scoped writes to workspace_connectors. RLS is not a backstop (the app
// uses the service-role client), so every write filters by workspace_id in code.
// Untyped table access (workspace_connectors is not in generated database.types).

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Upsert the credential ref for a connector in this workspace. */
export async function setConnectorCredentialRef(
  client: SupabaseClient,
  input: { workspaceId: string; orgId: string | null; connectorKey: string; credentialRef: string },
): Promise<void> {
  const { error } = await client.from("workspace_connectors").upsert(
    {
      workspace_id: input.workspaceId,
      org_id: input.orgId,
      connector_key: input.connectorKey,
      credential_ref: input.credentialRef,
    },
    { onConflict: "workspace_id,connector_key" },
  );
  assertOk("workspace_connectors credential upsert", error);
}

/** Flip the per-workspace enable switch. */
export async function setConnectorEnabled(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; enabled: boolean },
): Promise<void> {
  const { error } = await client
    .from("workspace_connectors")
    .update({ enabled: input.enabled })
    .eq("workspace_id", input.workspaceId)
    .eq("connector_key", input.connectorKey);
  assertOk("workspace_connectors enable update", error);
}

/** Record a connection-test outcome. */
export async function recordConnectorTest(
  client: SupabaseClient,
  input: { workspaceId: string; connectorKey: string; result: { ok: boolean; error?: string } },
): Promise<void> {
  const { error } = await client
    .from("workspace_connectors")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: input.result.ok,
      last_test_error: input.result.ok ? null : (input.result.error ?? "Connection test failed."),
    })
    .eq("workspace_id", input.workspaceId)
    .eq("connector_key", input.connectorKey);
  assertOk("workspace_connectors test update", error);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/connectors/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/persistence.ts src/lib/connectors/persistence.test.ts
git commit -m "feat(connectors): workspace-scoped persistence"
```

---

## Task 5: Read-model

**Files:**
- Create: `src/lib/connectors/read-model.ts`
- Test: `src/lib/connectors/read-model.test.ts`

`listWorkspaceConnectors` joins the registry (catalog) with this workspace's rows and computes status. It returns credential **presence**, never the secret. It also exposes `resolveConnectorCredentialRef` (ref lookup) for the route in Task 6 — the ref, not the plaintext.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/connectors/read-model.test.ts
import { describe, expect, it, vi } from "vitest";
import { listWorkspaceConnectors, resolveConnectorCredentialRef } from "./read-model";

function clientReturning(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  } as never;
}

describe("listWorkspaceConnectors", () => {
  it("merges registry catalog with workspace rows and computes status", async () => {
    const client = clientReturning([
      { connector_key: "gemini-research", enabled: true, credential_ref: "ref-1", last_test_ok: null, last_tested_at: null, last_test_error: null },
    ]);
    const views = await listWorkspaceConnectors(client, "ws-1");
    const gemini = views.find((v) => v.key === "gemini-research");
    expect(gemini?.status).toBe("connected");
    expect(gemini?.credentialPresent).toBe(true);
    // never leak the ref/secret in the view
    expect(gemini).not.toHaveProperty("credentialRef");
  });

  it("shows not_configured for a catalog connector with no row", async () => {
    const client = clientReturning([]);
    const views = await listWorkspaceConnectors(client, "ws-1");
    expect(views.find((v) => v.key === "gemini-research")?.status).toBe("not_configured");
  });
});

describe("resolveConnectorCredentialRef", () => {
  it("returns the ref for an enabled connector", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { credential_ref: "ref-1", enabled: true }, error: null });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    } as never;
    expect(await resolveConnectorCredentialRef(client, "ws-1", "gemini-research")).toBe("ref-1");
  });

  it("returns null when the connector is disabled", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { credential_ref: "ref-1", enabled: false }, error: null });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    } as never;
    expect(await resolveConnectorCredentialRef(client, "ws-1", "gemini-research")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/connectors/read-model.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/connectors/read-model.ts
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  CONNECTOR_REGISTRY,
  computeConnectorStatus,
  type ConnectorAccess,
  type ConnectorAuthKind,
  type ConnectorStatus,
} from "@/domain";

export type ConnectorView = {
  key: string;
  label: string;
  description: string;
  authKind: ConnectorAuthKind;
  access: ConnectorAccess;
  enabled: boolean;
  credentialPresent: boolean;
  status: ConnectorStatus;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
};

type ConnectorRow = {
  connector_key: string;
  enabled: boolean;
  credential_ref: string | null;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

/** Catalog x this workspace's rows → views with computed status. No secrets/refs. */
export async function listWorkspaceConnectors(client: SupabaseClient, workspaceId: string): Promise<ConnectorView[]> {
  const { data, error } = await client
    .from("workspace_connectors")
    .select("connector_key,enabled,credential_ref,last_tested_at,last_test_ok,last_test_error")
    .eq("workspace_id", workspaceId);

  const rows = error ? [] : ((data ?? []) as ConnectorRow[]);
  const byKey = new Map(rows.map((row) => [row.connector_key, row]));

  return CONNECTOR_REGISTRY.map((entry) => {
    const row = byKey.get(entry.key);
    const credentialPresent = Boolean(row?.credential_ref);
    return {
      key: entry.key,
      label: entry.label,
      description: entry.description,
      authKind: entry.authKind,
      access: entry.access,
      enabled: row?.enabled ?? false,
      credentialPresent,
      status: computeConnectorStatus({
        credentialPresent,
        enabled: row?.enabled ?? false,
        lastTestOk: row?.last_test_ok ?? null,
      }),
      lastTestedAt: row?.last_tested_at ?? null,
      lastTestOk: row?.last_test_ok ?? null,
      lastTestError: row?.last_test_error ?? null,
    };
  });
}

/** The Vault ref for an ENABLED connector in this workspace, else null. */
export async function resolveConnectorCredentialRef(
  client: SupabaseClient,
  workspaceId: string,
  connectorKey: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("workspace_connectors")
    .select("credential_ref,enabled")
    .eq("workspace_id", workspaceId)
    .eq("connector_key", connectorKey)
    .maybeSingle<{ credential_ref: string | null; enabled: boolean }>();
  if (error || !data || !data.enabled) return null;
  return data.credential_ref ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/connectors/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/read-model.ts src/lib/connectors/read-model.test.ts
git commit -m "feat(connectors): workspace read-model"
```

---

## Task 6: Gemini route resolves the workspace key

**Files:**
- Modify: `src/app/api/v1/arc/research/web-search/route.ts`
- Test: `src/app/api/v1/arc/research/web-search/route.test.ts` (extend)

The route currently reads `process.env.GEMINI_API_KEY`. Change it to: resolve the workspace's connector credential first (via `arcGuard` scope → `resolveConnectorCredentialRef` → `readConnectorCredential`), and **fall back to the env var** when the workspace hasn't connected its own key. This keeps existing single-tenant deploys working.

- [ ] **Step 1: Add a helper + write the failing test**

Add to the existing test file a case where the workspace has its own key and no env var is set. The existing tests mock `searchWebWithGemini`; reuse that mock and assert the resolved key is passed through. Add:

```ts
// in src/app/api/v1/arc/research/web-search/route.test.ts
import { vi } from "vitest";

// Mock the connector resolution so the route uses a workspace key, no env needed.
vi.mock("@/lib/connectors/read-model", () => ({
  resolveConnectorCredentialRef: vi.fn().mockResolvedValue("ref-1"),
}));
vi.mock("@/lib/connectors/credentials", () => ({
  readConnectorCredential: vi.fn().mockResolvedValue("workspace-gemini-key"),
}));

it("uses the workspace's connector key and passes it to the search", async () => {
  delete process.env.GEMINI_API_KEY; // no global key
  const { searchWebWithGemini } = await import("@/lib/research/gemini-web-search");
  const spy = vi.mocked(searchWebWithGemini).mockResolvedValue({
    model: "gemini-2.5-flash",
    text: "findings",
    citations: [],
    searchQueries: [],
  });
  const { POST } = await import("./route");
  const res = await POST(new Request("http://x/api/v1/arc/research/web-search", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ query: "roofing leads in Chicago" }),
  }));
  expect(res.status).toBe(200);
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "workspace-gemini-key" }));
});
```

Note: match the existing test file's auth/bearer setup (it already constructs authorized requests — reuse that helper/token rather than the literal above if one exists). If `arcGuard` requires DB-token plumbing the existing tests already stub, follow that stub.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/research/web-search/route.test.ts`
Expected: FAIL — the route still reads only `process.env.GEMINI_API_KEY`, so with the env var deleted it returns `503 not_configured`.

- [ ] **Step 3: Implement the resolution in the route**

Replace the env-only key resolution. The route currently calls `arcGuard`? Confirm: it uses `arcGuard(request)` (per the design); if the shipped route uses a different guard, switch it to `arcGuard` so we get `scope.workspaceId`. New body:

```ts
import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { readConnectorCredential } from "@/lib/connectors/credentials";
import { resolveConnectorCredentialRef } from "@/lib/connectors/read-model";
import { searchWebWithGemini } from "@/lib/research/gemini-web-search";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim() : "";
}

/** Workspace's own Gemini key (Vault) if connected + enabled; else the global env var. */
async function resolveGeminiKey(workspaceId: string): Promise<string | null> {
  const client = getSupabaseAdminClient();
  const ref = await resolveConnectorCredentialRef(client, workspaceId, "gemini-research").catch(() => null);
  if (ref) {
    const key = await readConnectorCredential(client, ref).catch(() => null);
    if (key) return key;
  }
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const apiKey = await resolveGeminiKey(allowed.scope.workspaceId);
  if (!apiKey) {
    return fail(
      "not_configured",
      "Gemini web search isn't enabled. Connect a Gemini key in Settings → Connectors, or set GEMINI_API_KEY.",
      503,
    );
  }

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  const query = cleanText(body.query, 1000);
  const context = cleanText(body.context, 4000) || undefined;
  if (!query) return fail("rejected", "query is required.", 400);

  try {
    const research = await searchWebWithGemini({
      query,
      context,
      apiKey,
      model: process.env.GEMINI_WEB_SEARCH_MODEL?.trim() || undefined,
    });
    return ok({ research });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Gemini web search failed.", 502);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/research/web-search/route.test.ts`
Expected: PASS — both the new workspace-key case and the existing cases (env-var fallback still works when no connector ref).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/research/web-search/route.ts src/app/api/v1/arc/research/web-search/route.test.ts
git commit -m "feat(connectors): Gemini route resolves per-workspace key"
```

---

## Task 7: Settings server actions

**Files:**
- Create: `src/app/settings/connectors-actions.ts`

Mirrors `connections-actions.ts`: `requireOperator()` + `isSupabaseAdminConfigured()`, `revalidatePath("/settings")`. Three actions: connect (paste key → vault + upsert ref), enable/disable, test.

- [ ] **Step 1: Implement the actions**

```ts
// src/app/settings/connectors-actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { findConnector } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { writeConnectorCredential } from "@/lib/connectors/credentials";
import {
  recordConnectorTest,
  setConnectorCredentialRef,
  setConnectorEnabled,
} from "@/lib/connectors/persistence";
import { resolveConnectorCredentialRef } from "@/lib/connectors/read-model";
import { readConnectorCredential } from "@/lib/connectors/credentials";
import { searchWebWithGemini } from "@/lib/research/gemini-web-search";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ConnectorActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: ConnectorActionState = {
  ok: false,
  message: "Supabase isn't configured, so connector state can't be saved.",
};

async function workspaceScope(): Promise<{ workspaceId: string; orgId: string | null }> {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) throw new Error("No active workspace.");
  return { workspaceId: ctx.workspaceId, orgId: ctx.orgId ?? null };
}

/** Paste an API key → store in Vault → save the ref on the workspace's connector row. */
export async function connectConnectorAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };
  if (entry.authKind !== "api_key") return { ok: false, message: `${entry.label} doesn't use an API key.` };
  if (!apiKey) return { ok: false, message: "Paste an API key first." };

  try {
    const { workspaceId, orgId } = await workspaceScope();
    const client = getSupabaseAdminClient();
    const credentialRef = await writeConnectorCredential(client, { workspaceId, connectorKey, plaintext: apiKey });
    await setConnectorCredentialRef(client, { workspaceId, orgId, connectorKey, credentialRef });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the key." };
  }

  revalidatePath("/settings");
  return { ok: true, message: `${entry.label} key saved. Enable it to start using it.` };
}

/** Flip the per-workspace enable switch. */
export async function setConnectorEnabledAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };

  try {
    const { workspaceId } = await workspaceScope();
    await setConnectorEnabled(getSupabaseAdminClient(), { workspaceId, connectorKey, enabled });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the connector." };
  }

  revalidatePath("/settings");
  return { ok: true, message: enabled ? `${entry.label} enabled.` : `${entry.label} disabled.` };
}

/** Probe the stored key with a tiny live search; record the result. */
export async function testConnectorAction(
  _previous: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const connectorKey = String(formData.get("connectorKey") ?? "");
  const entry = findConnector(connectorKey);
  if (!entry) return { ok: false, message: "Unknown connector." };
  if (connectorKey !== "gemini-research") return { ok: false, message: "No live test for this connector yet." };

  const client = getSupabaseAdminClient();
  let workspaceId: string;
  try {
    ({ workspaceId } = await workspaceScope());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No workspace." };
  }

  const ref = await resolveConnectorCredentialRef(client, workspaceId, connectorKey);
  const key = ref ? await readConnectorCredential(client, ref) : null;
  if (!key) {
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: "No key stored or connector disabled." } }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: false, message: "Connect and enable the connector first." };
  }

  try {
    await searchWebWithGemini({ query: "connection test", apiKey: key });
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: true } });
    revalidatePath("/settings");
    return { ok: true, message: `${entry.label} key is healthy.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test failed.";
    await recordConnectorTest(client, { workspaceId, connectorKey, result: { ok: false, error: message } }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: false, message };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build` (or `npx tsc --noEmit`)
Expected: no type errors in `connectors-actions.ts`. If `getCurrentWorkspaceContext` returns a different field name than `workspaceId`/`orgId`, adjust `workspaceScope()` to match (confirm against `src/lib/auth/workspace.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/connectors-actions.ts
git commit -m "feat(connectors): settings server actions (connect/enable/test)"
```

---

## Task 8: Settings catalog UI

**Files:**
- Create: `src/app/settings/connectors-panel.tsx`
- Modify: the Settings page that renders `connections-panel.tsx` (find it: `grep -rl "connections-panel" src/app/settings`)

Mirror `connections-panel.tsx` structure (it already wires `useActionState`/form actions to the connection actions). Reuse `Panel`, `StatusPill`, `ActionFeedback` from `src/app/_components/page-header.tsx`. Follow `DESIGN.md` (no emojis, Command Charcoal palette, no equal 3-column rows). Do NOT use a `--surface` token (it renders invisible — use `--canvas`/`--surface-panel`/`--surface-inset`/`--surface-raised`).

- [ ] **Step 1: Build the panel**

Read `src/app/settings/connections-panel.tsx` first and copy its action-wiring idiom. The panel takes `connectors: ConnectorView[]` (from `listWorkspaceConnectors`) and renders, per connector: label, description, a `StatusPill` for `status`, an API-key input + Connect button (`connectConnectorAction`), an enable/disable toggle (`setConnectorEnabledAction`), and a Test button (`testConnectorAction`). Surface results via `ActionFeedback`/the action state message. Map `status` → pill tone: `connected`→positive, `error`→negative, `disabled`/`not_configured`→neutral.

(Write the component following the existing panel's exact prop and `useActionState` pattern — do not invent a new state idiom. Keep it a client component if `connections-panel.tsx` is one.)

- [ ] **Step 2: Wire it into the Settings page**

In the settings page that renders `<ConnectionsPanel … />`, fetch connector views server-side and render the new panel beside it:

```tsx
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { ConnectorsPanel } from "./connectors-panel";

// inside the async server component, after existing data loads:
const connectors = isSupabaseAdminConfigured()
  ? await listWorkspaceConnectors(getSupabaseAdminClient(), (await getCurrentWorkspaceContext()).workspaceId)
  : [];
// …in JSX, near <ConnectionsPanel …/>:
<ConnectorsPanel connectors={connectors} />
```

- [ ] **Step 3: Verify in the browser (preview tools)**

Start the dev server (`preview_start`), navigate to `/settings`, and confirm via `preview_snapshot`/`preview_inspect` (NOT `preview_screenshot` — it hangs on the particle background per project memory) that:
- The Connectors panel renders with the Gemini Web Research card.
- Pasting a dummy key + Connect shows the saved message; the status pill moves to `disabled` (key present, not enabled).
- Toggling enable moves the pill to `connected`.

(Without Supabase configured locally, the panel shows `not_configured` and actions return the not-configured message — that's expected; note it and verify the render path instead.)

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/connectors-panel.tsx src/app/settings/<settings-page-file>
git commit -m "feat(connectors): settings catalog UI"
```

---

## Task 9: Full verification + final commit

- [ ] **Step 1: Run the whole connectors test surface**

Run: `pnpm test src/domain/__tests__/connectors.test.ts src/lib/connectors/ src/app/api/v1/arc/research/web-search/route.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck the build**

Run: `pnpm build`
Expected: compiles with no type errors. (Recall: `pnpm lint` does NOT typecheck and is noisy on vendored files — rely on the build.)

- [ ] **Step 3: Lint only the changed files**

Run: `npx eslint src/domain/connectors.ts src/lib/connectors/ src/app/settings/connectors-actions.ts src/app/settings/connectors-panel.tsx src/app/api/v1/arc/research/web-search/route.ts`
Expected: clean (or only pre-existing repo-wide rules). Fix anything new.

- [ ] **Step 4: Confirm no plaintext leaks**

Grep the new lib for accidental secret exposure: `grep -rn "plaintext\|decrypted_secret\|apiKey" src/lib/connectors`. Confirm plaintext only appears in `credentials.ts` (write input) and is never returned by `read-model.ts` views. The `ConnectorView` type must not contain a key/ref field.

- [ ] **Step 5: Final review commit (if any fixups)**

```bash
git add -A
git commit -m "chore(connectors): phase 1 slice A verification fixups"
```

---

## Self-review against the spec

- **Per-workspace encrypted credentials** → Tasks 2, 3, 4 (table + Vault write + ref upsert). ✓
- **Pluggable connector registry / catalog** → Task 1 (`CONNECTOR_REGISTRY`, `findConnector`). ✓
- **Catalog UI in Settings, reusing primitives** → Task 8. ✓
- **`requireOperator()`-gated wired actions following vault/campaigns shape** → Task 7. ✓
- **Status computed, never stored; degrades gracefully** → Task 1 (`computeConnectorStatus`) + Task 5 (error → empty rows → `not_configured`). ✓
- **Workspace-scoped in code (service-role bypasses RLS)** → every `persistence.ts`/`read-model.ts` query filters by `workspace_id`; Task 9 Step 4 audits leaks. ✓
- **Prove the path with a read-only connector (Gemini)** → Task 6 (route uses workspace key, env fallback). ✓
- **No secret in views/logs** → Task 5 test asserts no `credentialRef`/secret on the view; Task 9 Step 4 audits. ✓

**Deferred to Slice B (explicitly out of scope here):** remote HTTP/SSE MCP connector loading in the runner (`resolve.ts` → `McpHttpServerConfig`, `arc.ts` `mcpServers` merge, server-level `allowedTools`), the `/api/v1/arc/connectors` runner endpoint, and the first external MCP connector (Apollo). **Deferred to design Phase 2:** write/action tools + approval routing. **Deferred to Phase 3:** OAuth.
