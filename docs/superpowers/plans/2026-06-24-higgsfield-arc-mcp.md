# Higgsfield × Arc Runner (MCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the deployed, headless Arc agent generate Higgsfield media as approval-gated, provenance-tagged draft assets, by loading Higgsfield's hosted MCP into the runner through the existing per-workspace connector seam.

**Architecture:** Phase 0 is a throwaway go/no-go spike that proves a headless process can call a Higgsfield MCP tool on Ultra credits with a replayable credential. Phase 1 (contingent on the spike passing) registers Higgsfield as a remote-MCP connector, adds a bearer-gated app route that hands the runner this workspace's enabled connectors + decrypted Vault credentials, and adds a runner-side loader that merges those remote MCP servers into the Agent SDK `query()` — gated to draft/act modes, never outbound.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk` (runner), Next.js 16 route handlers (app), Supabase Vault (credential storage), Vitest.

---

## Spike-confirmed inputs (filled in by Phase 0, consumed by Phase 1)

Phase 1 code below assumes these defaults. The spike confirms or replaces each; if a value differs, substitute it everywhere it appears in Phase 1.

| Input | Assumed default | Confirmed by spike |
| --- | --- | --- |
| MCP URL | `https://mcp.higgsfield.ai/mcp` | Task 0.3 |
| Transport | `http` | Task 0.3 |
| Credential header | `Authorization: Bearer <token>` | Task 0.3 |
| `authKind` | `oauth` (a captured/refreshable token), or `api_key` if a personal token exists | Task 0.1 / 0.3 |
| Tool allow pattern | `mcp__higgsfield` (allows all tools from the `higgsfield` server) | Task 0.3 |
| Token lifetime | unknown — may require periodic manual re-auth for the prototype | Task 0.4 |

---

## Phase 0 — Headless-OAuth spike (go/no-go)

> Discovery, not TDD. Each task has an observation and a recorded result. **If Task 0.4 is NO-GO, stop — do not start Phase 1.**

### Task 0.1: Token-source recon

**Files:** none (investigation; record findings in the plan's "Phase 0 results" section at the bottom).

- [ ] **Step 1: Check for a reusable token.** While signed into the Higgsfield Ultra account, inspect Account/Settings and `https://cloud.higgsfield.ai/api-keys` for any personal access token or long-lived token that authorizes the **hosted MCP** (not the separately-billed Cloud API).
- [ ] **Step 2: Record the result** in "Phase 0 results": does a reusable static token exist? If YES, set `authKind = api_key` and skip the OAuth capture — go to Task 0.3 using that token. If NO, continue to Task 0.2.

### Task 0.2: Interactive OAuth + token capture (Evan's hands)

**Files:** none.

- [ ] **Step 1: Connect interactively.** In a Claude Code-class client: Settings → Connectors → Add custom connector → Name `Higgsfield`, URL `https://mcp.higgsfield.ai/mcp` → Connect → authorize with the Higgsfield account.
- [ ] **Step 2: Verify it works there.** Run a prompt like "List my available Higgsfield models" and confirm tools respond.
- [ ] **Step 3: Locate the persisted token.** Find where that client's MCP layer stored the OAuth access + refresh tokens (e.g. the client's MCP credential store / config). Record the token value, format, and where it lives.
- [ ] **Step 4: Record** the token + observed expiry hint in "Phase 0 results".

### Task 0.3: Headless replay spike

**Files:**
- Create: `apps/arc-runner/src/spike-higgsfield.ts` (throwaway; mirrors `apps/arc-runner/src/spike-multimodal.ts`)

- [ ] **Step 1: Write the spike script.** It must run with NO browser, reading the captured token from an env var.

```ts
// apps/arc-runner/src/spike-higgsfield.ts
// Throwaway spike: can a headless process call a Higgsfield MCP tool on Ultra credits?
// Run: HIGGSFIELD_TOKEN=... CLAUDE_CODE_OAUTH_TOKEN=... npx tsx src/spike-higgsfield.ts
import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  const token = process.env.HIGGSFIELD_TOKEN?.trim();
  if (!token) throw new Error("Set HIGGSFIELD_TOKEN to the captured Higgsfield MCP token.");

  const options = {
    model: "claude-sonnet-4-6",
    permissionMode: "bypassPermissions" as const,
    mcpServers: {
      higgsfield: {
        type: "http" as const,
        url: "https://mcp.higgsfield.ai/mcp",
        headers: { Authorization: `Bearer ${token}` },
      },
    },
    // Allow every tool the higgsfield server exposes.
    allowedTools: ["mcp__higgsfield"],
    maxTurns: 6,
  };

  for await (const message of query({
    prompt:
      "Use the Higgsfield tools to list my available models, then run the cheapest available " +
      "image or virality-prediction tool once on a trivial prompt. Report exactly which tool " +
      "you called and the raw result.",
    options,
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") console.log("[assistant]", block.text);
        if (block.type === "tool_use") console.log("[tool_use]", block.name, JSON.stringify(block.input));
      }
    } else if (message.type === "result") {
      console.log("[result]", JSON.stringify(message, null, 2));
    }
  }
}

main().catch((err) => {
  console.error("[spike-higgsfield] FAILED:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it headlessly.**

Run: `cd apps/arc-runner && HIGGSFIELD_TOKEN=<captured> npx tsx src/spike-higgsfield.ts`
Expected (PASS): a `tool_use` for a `mcp__higgsfield__*` tool and a real result payload, no auth error.

- [ ] **Step 3: Confirm credit consumption.** Check the Higgsfield account usage/credits dashboard before and after; confirm the run consumed Ultra credits.
- [ ] **Step 4: Record** in "Phase 0 results": exact tool names + input schemas observed, the working header format, and whether credits decremented.

### Task 0.4: Go/no-go decision

**Files:** none.

- [ ] **Step 1: Decide.** PASS = headless tool call succeeded AND Ultra credits decremented. Record GO or NO-GO with the token-lifetime finding.
- [ ] **Step 2: On NO-GO**, stop and report. Re-open the design's "auth path" fork (Cloud API key, or interactive-Claude-only). Do not proceed to Phase 1.
- [ ] **Step 3: On GO**, delete the spike file and commit the recon notes.

```bash
cd "C:/Users/evanr/marketing/.claude/worktrees/inspiring-taussig-35dc9c"
git rm apps/arc-runner/src/spike-higgsfield.ts
git add docs/superpowers/plans/2026-06-24-higgsfield-arc-mcp.md
git commit -m "spike(higgsfield): headless MCP token replay verified (GO) — record findings"
```

---

## Phase 1 — Connector-seam build (only if Task 0.4 = GO)

### Task 1: Register Higgsfield in the connector catalog

**Files:**
- Modify: `src/domain/connectors.ts:28` (append to `CONNECTOR_REGISTRY`)
- Test: `src/domain/__tests__/connectors.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `connectors.test.ts`:

```ts
import { CONNECTOR_REGISTRY, findConnector } from "@/domain";

describe("higgsfield connector", () => {
  it("is registered as a remote-MCP, gated-write connector", () => {
    const hf = findConnector("higgsfield");
    expect(hf).not.toBeNull();
    expect(hf?.mcpUrl).toBe("https://mcp.higgsfield.ai/mcp");
    expect(hf?.toolNamespace).toBe("higgsfield");
    expect(hf?.authHeader).toBe("Authorization");
    expect(hf?.access).toBe("gated_write");
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm test src/domain/__tests__/connectors.test.ts`
Expected: FAIL — `findConnector("higgsfield")` returns null.

- [ ] **Step 3: Add the registry entry** to `CONNECTOR_REGISTRY` in `src/domain/connectors.ts` (use the `authKind` confirmed by the spike — `oauth` shown here):

```ts
  {
    key: "higgsfield",
    label: "Higgsfield",
    description:
      "Cinematic image & video generation, UGC/viral variants, and virality prediction, " +
      "using this workspace's own Higgsfield account credits. Output lands as approval-gated draft assets.",
    authKind: "oauth",
    access: "gated_write",
    mcpUrl: "https://mcp.higgsfield.ai/mcp",
    authHeader: "Authorization",
    toolNamespace: "higgsfield",
  },
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `pnpm test src/domain/__tests__/connectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/domain/connectors.ts src/domain/__tests__/connectors.test.ts
git commit -m "feat(connectors): register Higgsfield as a remote-MCP gated-write connector"
```

### Task 2: App route — hand enabled remote connectors to the runner

**Files:**
- Create: `src/lib/connectors/runner-connectors.ts` (resolve enabled remote-MCP connectors + decrypted creds)
- Create: `src/app/api/v1/arc/connectors/route.ts`
- Test: `src/lib/connectors/runner-connectors.test.ts`

- [ ] **Step 1: Write the failing test** for the resolver:

```ts
// src/lib/connectors/runner-connectors.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveRemoteConnectorsForRunner } from "./runner-connectors";

vi.mock("./read-model", () => ({
  listWorkspaceConnectors: vi.fn(async () => [
    { key: "higgsfield", enabled: true, credentialPresent: true, status: "connected" },
    { key: "gemini-research", enabled: true, credentialPresent: true, status: "connected" },
  ]),
  resolveConnectorCredentialRef: vi.fn(async () => "ref-1"),
}));
vi.mock("./credentials", () => ({
  readConnectorCredential: vi.fn(async () => "secret-token"),
}));

describe("resolveRemoteConnectorsForRunner", () => {
  it("returns only enabled connectors that have a remote mcpUrl, with their token", async () => {
    const client = {} as never;
    const result = await resolveRemoteConnectorsForRunner(client, "ws-1");
    // gemini-research has mcpUrl: null in the registry, so it is excluded.
    expect(result).toEqual([
      {
        toolNamespace: "higgsfield",
        mcpUrl: "https://mcp.higgsfield.ai/mcp",
        authHeader: "Authorization",
        token: "secret-token",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm test src/lib/connectors/runner-connectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver:**

```ts
// src/lib/connectors/runner-connectors.ts
import { type SupabaseClient } from "@supabase/supabase-js";
import { CONNECTOR_REGISTRY } from "@/domain";
import { listWorkspaceConnectors, resolveConnectorCredentialRef } from "./read-model";
import { readConnectorCredential } from "./credentials";

/** A remote MCP connector the runner should load: namespace, endpoint, header, token. */
export type RunnerRemoteConnector = {
  toolNamespace: string;
  mcpUrl: string;
  authHeader: string;
  token: string;
};

/**
 * Enabled, credentialed, remote-MCP connectors for this workspace, with their
 * decrypted token. Native connectors (mcpUrl === null, e.g. gemini-research) are
 * excluded — they have no remote server to load. Secrets are resolved here and
 * only ever returned over the bearer-gated runner route.
 */
export async function resolveRemoteConnectorsForRunner(
  client: SupabaseClient,
  workspaceId: string,
): Promise<RunnerRemoteConnector[]> {
  const views = await listWorkspaceConnectors(client, workspaceId);
  const enabledKeys = new Set(views.filter((v) => v.enabled && v.credentialPresent).map((v) => v.key));

  const out: RunnerRemoteConnector[] = [];
  for (const entry of CONNECTOR_REGISTRY) {
    if (!entry.mcpUrl || !entry.authHeader || !enabledKeys.has(entry.key)) continue;
    const ref = await resolveConnectorCredentialRef(client, workspaceId, entry.key);
    const token = await readConnectorCredential(client, ref);
    if (!token) continue;
    out.push({ toolNamespace: entry.toolNamespace, mcpUrl: entry.mcpUrl, authHeader: entry.authHeader, token });
  }
  return out;
}
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `pnpm test src/lib/connectors/runner-connectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route** (follows `src/app/api/v1/arc/workspace/route.ts`):

```ts
// src/app/api/v1/arc/connectors/route.ts
import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { resolveRemoteConnectorsForRunner } from "@/lib/connectors/runner-connectors";

/**
 * Remote-MCP connectors the runner should load for this workspace, with decrypted
 * credentials. Bearer + workspace gated; same trust boundary as ARC_AGENT_API_TOKEN
 * (server-to-server only — the token is never echoed to a browser).
 *   GET /api/v1/arc/connectors -> { ok, connectors: [{ toolNamespace, mcpUrl, authHeader, token }] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  if (!isSupabaseAdminConfigured()) return ok({ connectors: [] });
  const { workspaceId } = allowed.scope;
  try {
    const connectors = await resolveRemoteConnectorsForRunner(getSupabaseAdminClient(), workspaceId);
    return ok({ connectors });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load connectors.", 502);
  }
}
```

- [ ] **Step 6: Verify the build typechecks.**

Run: `pnpm build` (or `npx tsc --noEmit`)
Expected: no type errors in the new route/resolver. (`pnpm lint` is eslint-only — it does not typecheck.)

- [ ] **Step 7: Commit.**

```bash
git add src/lib/connectors/runner-connectors.ts src/lib/connectors/runner-connectors.test.ts src/app/api/v1/arc/connectors/route.ts
git commit -m "feat(arc-api): serve this workspace's enabled remote-MCP connectors to the runner"
```

### Task 3: Runner loader — pure mapping connectors → mcpServers + allowedTools

**Files:**
- Create: `apps/arc-runner/src/connectors.ts`
- Test: `apps/arc-runner/src/connectors.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
// apps/arc-runner/src/connectors.test.ts
import { describe, it, expect } from "vitest";
import { buildRemoteMcp } from "./connectors";

describe("buildRemoteMcp", () => {
  it("maps connectors to http mcpServers and namespaced allow-patterns", () => {
    const { mcpServers, allowedTools } = buildRemoteMcp([
      { toolNamespace: "higgsfield", mcpUrl: "https://mcp.higgsfield.ai/mcp", authHeader: "Authorization", token: "tok" },
    ]);
    expect(mcpServers).toEqual({
      higgsfield: { type: "http", url: "https://mcp.higgsfield.ai/mcp", headers: { Authorization: "Bearer tok" } },
    });
    expect(allowedTools).toEqual(["mcp__higgsfield"]);
  });

  it("returns empty maps for no connectors", () => {
    expect(buildRemoteMcp([])).toEqual({ mcpServers: {}, allowedTools: [] });
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `cd apps/arc-runner && pnpm test src/connectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader:**

```ts
// apps/arc-runner/src/connectors.ts
import type { ArcClient } from "./arc-client";

/** One remote MCP connector, as served by GET /api/v1/arc/connectors. */
export type RemoteConnector = {
  toolNamespace: string;
  mcpUrl: string;
  authHeader: string;
  token: string;
};

type HttpMcpServer = { type: "http"; url: string; headers: Record<string, string> };

/**
 * Pure mapping: connector descriptors -> the SDK's mcpServers map plus the
 * allow-patterns that unlock their tools. `mcp__<namespace>` allows every tool
 * the server exposes. The credential rides the configured header as a Bearer token.
 */
export function buildRemoteMcp(connectors: RemoteConnector[]): {
  mcpServers: Record<string, HttpMcpServer>;
  allowedTools: string[];
} {
  const mcpServers: Record<string, HttpMcpServer> = {};
  const allowedTools: string[] = [];
  for (const c of connectors) {
    mcpServers[c.toolNamespace] = {
      type: "http",
      url: c.mcpUrl,
      headers: { [c.authHeader]: `Bearer ${c.token}` },
    };
    allowedTools.push(`mcp__${c.toolNamespace}`);
  }
  return { mcpServers, allowedTools };
}

/** Fetch this workspace's remote connectors via the app API. Best-effort: on any
 *  failure return none, so Arc degrades to its built-in tools (never breaks a turn). */
export async function fetchRemoteConnectors(client: ArcClient): Promise<RemoteConnector[]> {
  try {
    const res = await client.apiGet<{ connectors?: RemoteConnector[] }>("/api/v1/arc/connectors");
    return res.connectors ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `cd apps/arc-runner && pnpm test src/connectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/arc-runner/src/connectors.ts apps/arc-runner/src/connectors.test.ts
git commit -m "feat(arc-runner): pure loader mapping remote connectors to mcpServers + allow-patterns"
```

### Task 4: Wire remote connectors into the Arc query (draft/act modes only)

**Files:**
- Modify: `apps/arc-runner/src/arc.ts` (`runArcQuery`, ~lines 91-128)
- Test: `apps/arc-runner/src/handler.test.ts` is integration-level; add a focused unit at `apps/arc-runner/src/connectors.test.ts` for the gating predicate.

- [ ] **Step 1: Write the failing test** for a mode-gating predicate (add to `connectors.test.ts`):

```ts
import { remoteConnectorsAllowedForMode } from "./connectors";

describe("remoteConnectorsAllowedForMode", () => {
  it("allows draft and act (media production), blocks ask and scan", () => {
    expect(remoteConnectorsAllowedForMode("draft")).toBe(true);
    expect(remoteConnectorsAllowedForMode("act")).toBe(true);
    expect(remoteConnectorsAllowedForMode("ask")).toBe(false);
    expect(remoteConnectorsAllowedForMode("scan")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `cd apps/arc-runner && pnpm test src/connectors.test.ts`
Expected: FAIL — `remoteConnectorsAllowedForMode` not exported.

- [ ] **Step 3: Add the predicate** to `apps/arc-runner/src/connectors.ts`:

```ts
import type { ArcMode } from "./tools";

/** Remote media-producing connectors are for work modes (draft/act/campaign tasks),
 *  not read-only conversation (ask) or proposal-only scanning (scan). */
export function remoteConnectorsAllowedForMode(mode: ArcMode): boolean {
  return mode === "draft" || mode === "act";
}
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `cd apps/arc-runner && pnpm test src/connectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `runArcQuery`.** In `apps/arc-runner/src/arc.ts`, add the import and merge remote MCP servers + allow-patterns before the `query()` call:

```ts
// near the other imports
import { buildRemoteMcp, fetchRemoteConnectors, remoteConnectorsAllowedForMode } from "./connectors";
```

Replace the `mcpServers`/`allowedTools` wiring inside `runArcQuery` (currently `mcpServers: { arc: arcServer }` and `allowedTools: allowedToolNames(...)`) with:

```ts
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });

  // Remote MCP connectors (e.g. Higgsfield) only load in work modes, and only if
  // the workspace has them enabled. Best-effort: none on failure, so Arc still runs.
  const remote = remoteConnectorsAllowedForMode(opts.mode) ? await fetchRemoteConnectors(opts.client) : [];
  const { mcpServers: remoteServers, allowedTools: remoteAllowed } = buildRemoteMcp(remote);

  const workspaceState = await resolveWorkspaceSummary(opts.client);
  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, { ...opts.ctx, workspaceState });
```

And in the `query({ options: buildQueryOptions({ ... }) })` call:

```ts
      mcpServers: { arc: arcServer, ...remoteServers },
      allowedTools: [...allowedToolNames(opts.mode, opts.skill), ...remoteAllowed],
```

- [ ] **Step 6: Run the full runner suite** (the tool-surface tests in `index.test.ts` pin per-mode SDK-`arc` tool sets — remote tools live outside that server, so they should be unaffected; this confirms it).

Run: `cd apps/arc-runner && pnpm test`
Expected: PASS (all existing tests green, new connector tests green).

- [ ] **Step 7: Commit.**

```bash
git add apps/arc-runner/src/arc.ts apps/arc-runner/src/connectors.ts apps/arc-runner/src/connectors.test.ts
git commit -m "feat(arc-runner): load workspace remote MCP connectors into draft/act turns"
```

### Task 5: Provenance prompt — land Higgsfield output as approval-gated draft assets

**Files:**
- Modify: `apps/arc-runner/src/prompt.ts` (the `ARC_SYSTEM_PROMPT`)
- Test: `apps/arc-runner/src/prompt.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
// add to apps/arc-runner/src/prompt.test.ts
import { ARC_SYSTEM_PROMPT } from "./prompt";

it("instructs Arc to save Higgsfield media as provenance-tagged draft assets", () => {
  expect(ARC_SYSTEM_PROMPT).toMatch(/higgsfield/i);
  expect(ARC_SYSTEM_PROMPT).toMatch(/draft|approval/i);
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `cd apps/arc-runner && pnpm test src/prompt.test.ts`
Expected: FAIL — no Higgsfield guidance yet.

- [ ] **Step 3: Add a guidance block** to `ARC_SYSTEM_PROMPT` in `apps/arc-runner/src/prompt.ts` (place near the media/asset guidance):

```
When you use Higgsfield tools to generate or analyze media, treat the output as a DRAFT.
Save generated media into the Library as a draft asset tagged with its Higgsfield source
(tool/model) before presenting it, and attach it to the relevant campaign as an
approval-gated asset. Never present Higgsfield media as approved, and never send, publish,
or launch it — a human approves every outbound use.
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `cd apps/arc-runner && pnpm test src/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/arc-runner/src/prompt.ts apps/arc-runner/src/prompt.test.ts
git commit -m "feat(arc-runner): instruct Arc to land Higgsfield media as approval-gated draft assets"
```

### Task 6: Update CLAUDE.md gating note + final verification

**Files:**
- Modify: `CLAUDE.md` (the Higgsfield "operationally off" bullet)

- [ ] **Step 1: Update the gating note.** Replace the "Higgsfield stays operationally off until Evan confirms the subscription is active" bullet with the new reality:

```
- **Higgsfield** is active (Ultra plan). Arc reaches it through the per-workspace
  **`higgsfield` remote-MCP connector** (hosted MCP at mcp.higgsfield.ai), loaded into the
  runner in draft/act modes only. Output is always an approval-gated, provenance-tagged
  draft asset — never auto-outbound. The connector is OFF until enabled per workspace with a
  stored credential. Multi-tenant per-workspace OAuth onboarding and the Cloud API key path
  remain deferred.
```

- [ ] **Step 2: Run the full suites** to confirm nothing regressed.

Run: `pnpm test` (root) and `cd apps/arc-runner && pnpm test`
Expected: PASS in both. (Note: per memory, the app suite may carry pre-existing draft-asset route 502s from `revalidatePath` throwing under vitest — confirm any failures are those known ones, not new.)

- [ ] **Step 3: Typecheck.**

Run: `pnpm build` (root) and `cd apps/arc-runner && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): Higgsfield active via per-workspace remote-MCP connector"
```

---

## Post-build (not code)

- Enable the `higgsfield` connector for the BSR workspace and store the captured credential in Vault (via the connectors UI / `writeConnectorCredential`). This is operational config, done once.
- If the spike found a short token lifetime, note the manual re-auth cadence until multi-company OAuth is built.

---

## Phase 0 results

_(Filled in during Phase 0.)_

- Task 0.1 — reusable token exists? …
- Task 0.2 — token format / location / expiry hint: …
- Task 0.3 — working header + observed tool names/schemas + credits decremented? …
- Task 0.4 — **GO / NO-GO:** …
