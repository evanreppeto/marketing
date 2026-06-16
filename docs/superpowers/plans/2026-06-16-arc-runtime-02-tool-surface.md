# Arc Runtime — Plan 2: Mode-gated tool surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow Arc from one read tool (`find_leads`) into the full read + write tool surface over the existing `/api/v1/arc/*` Operations API, gated by operator mode (ask = read-only; act/draft = read + CRM-interaction writes + brain observations). No outbound; no core-CRM-row mutation; no draft work products (those are Plan 3).

**Architecture:** A generic HTTP client (`apiGet`/`apiPost`) replaces the hand-rolled fetches. Tools live in a `tools/` module — one file per group (`crm`, `brain`, `campaigns`, `interactions`), each a small factory that takes the client + a `step` reporter and returns Claude Agent SDK `tool()` objects. A pure assembler (`toolsForMode`) returns the tool list + `allowedTools` names for a given mode — this is the single place mode-gating lives. `arc.ts` calls the assembler instead of hardcoding `find_leads`. The persona taxonomy is injected into the system prompt (no endpoint exists for it).

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk`, Zod, Vitest.

This is Plan 2 of 3 for Phase 1 of [the Arc runtime spec](../specs/2026-06-16-arc-runtime-design.md). Plan 1 (engine/context/memory) is merged. Plan 3 = action cards + draft work products → approval.

**Deferred (documented non-goals for this plan):**
- **Project-assets tool** — needs a new app endpoint wrapping `listProjectAssetMessages` (none exists). Tracked for a follow-up; `projectId` is already in the prompt scope from Plan 1.
- Draft work products (`POST /api/v1/arc/drafts`) and action cards → Plan 3.
- Multi-tenant persona overrides (`src/lib/personas/read-model.ts`) — single-tenant uses the 12 official keys.

---

## File Structure

All under `apps/arc-runner/`:
- Rename `src/hermes-client.ts` → `src/arc-client.ts`; add generic `apiGet`/`apiPost`; keep the existing typed helpers used by tools. Export `ArcClient`, `createArcClient`.
- Update imports of the client in `src/arc.ts`, `src/handler.ts`, `src/server.ts`.
- Create `src/tools/helpers.ts` — `buildQuery` (pure), `textResult`, `runTool` (step + error wrapper).
- Create `src/tools/crm.ts` — 6 search tools + `get_lead`.
- Create `src/tools/brain.ts` — `query_brain` (read), `record_brain_note` (write), `link_brain_nodes` (write).
- Create `src/tools/campaigns.ts` — `list_campaigns`, `get_campaign`, `list_approvals`.
- Create `src/tools/interactions.ts` — `log_interaction` (write).
- Create `src/tools/index.ts` — `toolsForMode(mode, client, step)` + `allowedToolNames(mode)`.
- Create `src/personas.ts` — the 12 official persona keys + labels (runner-side constant).
- Modify `src/context.ts` — inject a personas block into the system prompt.
- Tests: `src/tools/helpers.test.ts`, `src/tools/index.test.ts`, `src/context.test.ts` (extend).

---

## Task 1: Rename client to `arc-client` + add generic HTTP helpers

**Files:**
- Rename: `apps/arc-runner/src/hermes-client.ts` → `apps/arc-runner/src/arc-client.ts`
- Modify: `apps/arc-runner/src/arc.ts`, `apps/arc-runner/src/handler.ts`, `apps/arc-runner/src/server.ts`

- [ ] **Step 1: Create `src/arc-client.ts`** with the generic helpers (replaces the old file). Full content:

```ts
import type { Config } from "./config";

/**
 * Thin client over the app's Arc Operations API (/api/v1/arc/*). The runner
 * never touches Supabase directly — this is its only seam into app state.
 */

export type ChatReplyInput = {
  agentTaskId: string;
  body: string;
  status?: "complete" | "failed";
  metadata?: Record<string, unknown>;
};

export type QueryParams = Record<string, string | number | undefined | null>;

function toQuery(params: QueryParams | undefined): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function createArcClient(config: Config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.hermesAgentApiToken}`,
  };

  /** Authenticated GET against the Operations API. Throws on non-2xx or { ok:false }. */
  async function apiGet<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    const res = await fetch(`${config.appApiBaseUrl}${path}${toQuery(params)}`, { headers });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!res.ok || json?.ok === false) {
      throw new Error(`GET ${path} -> ${res.status} ${json?.message ?? ""}`.trim());
    }
    return json as T;
  }

  /** Authenticated POST against the Operations API. Throws on non-2xx or { ok:false }. */
  async function apiPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${config.appApiBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!res.ok || json?.ok === false) {
      throw new Error(`POST ${path} -> ${res.status} ${json?.message ?? ""}`.trim());
    }
    return json as T;
  }

  async function postChatReply(input: ChatReplyInput): Promise<void> {
    await apiPost("/api/v1/arc/messages", {
      agentTaskId: input.agentTaskId,
      body: input.body,
      status: input.status ?? "complete",
      metadata: input.metadata ?? {},
    });
  }

  /**
   * Append a live activity step to the pending chat bubble (the chain-of-thought
   * trace). Best-effort — a failed step must never break the run.
   */
  async function postStep(agentTaskId: string, label: string, status: "running" | "done"): Promise<void> {
    try {
      await fetch(`${config.appApiBaseUrl}/api/v1/arc/messages/${agentTaskId}/steps`, {
        method: "POST",
        headers,
        body: JSON.stringify({ label, status }),
      });
    } catch {
      /* steps are cosmetic; ignore */
    }
  }

  return { apiGet, apiPost, postChatReply, postStep };
}

export type ArcClient = ReturnType<typeof createArcClient>;
```

- [ ] **Step 2: Delete the old file**

Run: `git rm apps/arc-runner/src/hermes-client.ts` (the new `arc-client.ts` from Step 1 replaces it). If `git rm` complains it's untracked-vs-tracked, just ensure `hermes-client.ts` no longer exists and `arc-client.ts` does.

- [ ] **Step 3: Update importers**

In `apps/arc-runner/src/arc.ts`: change `import type { HermesClient } from "./hermes-client";` → `import type { ArcClient } from "./arc-client";`, and change the `client: HermesClient` parameter type to `client: ArcClient`. The old `client.getLeads(...)` call inside `find_leads` will move to the new tools module in Task 4 — for now, in `arc.ts`, replace the body's `client.getLeads(args)` usage by deferring to Task 8 (this task only fixes the type import; `find_leads` still references `client.getLeads`). To keep `arc.ts` compiling in the interim, temporarily change the `find_leads` lead fetch to `client.apiGet<{ leads: unknown[] }>("/api/v1/arc/crm/leads", args).then((r) => r.leads ?? [])`. (Task 8 replaces the whole tool wiring, so this is throwaway glue.)

In `apps/arc-runner/src/handler.ts`: change `import type { HermesClient } from "./hermes-client";` → `import type { ArcClient } from "./arc-client";` and the param type `client: HermesClient` → `client: ArcClient`.

In `apps/arc-runner/src/server.ts`: change `import { createHermesClient } from "./hermes-client";` → `import { createArcClient } from "./arc-client";` and the call `const client = createHermesClient(config);` → `const client = createArcClient(config);`.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
Expected: PASS (existing context tests still green; no `hermes-client` references remain).

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src
git commit -m "refactor(arc-runner): arc-client with generic apiGet/apiPost"
```

---

## Task 2: Tool helpers (pure query builder + run wrapper)

**Files:**
- Create: `apps/arc-runner/src/tools/helpers.ts`
- Create: `apps/arc-runner/src/tools/helpers.test.ts`

- [ ] **Step 1: Write the failing test** — Create `apps/arc-runner/src/tools/helpers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { runTool, textResult } from "./helpers";

describe("textResult", () => {
  it("wraps a string as an SDK text content block", () => {
    expect(textResult("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
  it("truncates very long text to 8000 chars", () => {
    const out = textResult("x".repeat(9000));
    expect(out.content[0].text.length).toBe(8000);
  });
});

describe("runTool", () => {
  it("emits running then done and returns the fn result as JSON text", async () => {
    const steps: Array<[string, string]> = [];
    const step = vi.fn(async (label: string, status: "running" | "done") => {
      steps.push([label, status]);
    });
    const out = await runTool(step, "Searching leads", async () => ({ leads: [1, 2] }));
    expect(steps).toEqual([
      ["Searching leads", "running"],
      ["Searching leads", "done"],
    ]);
    expect(JSON.parse(out.content[0].text)).toEqual({ leads: [1, 2] });
  });

  it("still marks done and returns an error message when the fn throws", async () => {
    const step = vi.fn(async () => {});
    const out = await runTool(step, "Searching leads", async () => {
      throw new Error("boom");
    });
    expect(step).toHaveBeenLastCalledWith("Searching leads", "done");
    expect(out.content[0].text).toContain("Searching leads failed: boom");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --filter @bsr/arc-runner test`. Expected: FAIL — `Cannot find module './helpers'`.

- [ ] **Step 3: Implement `src/tools/helpers.ts`**:

```ts
/** Step reporter signature shared by every tool (running -> done live trace). */
export type StepFn = (label: string, status: "running" | "done") => Promise<void>;

/** SDK tool result shape. */
export type ToolResult = { content: Array<{ type: "text"; text: string }> };

const MAX_TOOL_TEXT = 8000;

/** Wrap a string as an SDK text result, bounded so a huge payload can't blow context. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text: text.slice(0, MAX_TOOL_TEXT) }] };
}

/**
 * Run a tool's work with the live-trace bookend and uniform error handling:
 * emit `running`, run `fn`, emit `done` (even on error), and return the result
 * as JSON text (or a `<label> failed: <reason>` message). Never throws — the
 * SDK should receive a tool result, not an exception.
 */
export async function runTool(step: StepFn, label: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  await step(label, "running");
  try {
    const data = await fn();
    await step(label, "done");
    return textResult(JSON.stringify(data));
  } catch (error) {
    await step(label, "done");
    const reason = error instanceof Error ? error.message : "unknown error";
    return textResult(`${label} failed: ${reason}`);
  }
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --filter @bsr/arc-runner test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/tools/helpers.ts apps/arc-runner/src/tools/helpers.test.ts
git commit -m "feat(arc-runner): tool helpers (textResult, runTool)"
```

---

## Task 3: CRM read tools

**Files:**
- Create: `apps/arc-runner/src/tools/crm.ts`

- [ ] **Step 1: Implement `src/tools/crm.ts`**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only CRM tools. Each maps to a GET /api/v1/arc/crm/* endpoint and reports
 * a running -> done step. All filters optional; results are real CRM rows.
 */
export function crmReadTools(client: ArcClient, step: StepFn) {
  const searchCompanies = tool(
    "search_companies",
    "Search CRM companies (accounts/partners). Filters optional. Use for partner/account questions.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      partner_tier: z.string().optional(),
      q: z.string().optional().describe("Free-text search"),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM companies", async () => {
        const r = await client.apiGet<{ companies: unknown[] }>("/api/v1/arc/crm/companies", args);
        return r.companies ?? [];
      }),
  );

  const searchContacts = tool(
    "search_contacts",
    "Search CRM contacts (people). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM contacts", async () => {
        const r = await client.apiGet<{ contacts: unknown[] }>("/api/v1/arc/crm/contacts", args);
        return r.contacts ?? [];
      }),
  );

  const searchLeads = tool(
    "search_leads",
    "Search CRM leads/opportunities. Use when the operator asks about leads, opportunities, or who to target. Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      source: z.string().optional(),
      q: z.string().optional(),
      min_score: z.number().optional(),
      max_score: z.number().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM leads", async () => {
        const r = await client.apiGet<{ leads: unknown[] }>("/api/v1/arc/crm/leads", args);
        return r.leads ?? [];
      }),
  );

  const getLead = tool(
    "get_lead",
    "Fetch a single CRM lead by id, with full detail.",
    { id: z.string().describe("The lead id") },
    async (args) =>
      runTool(step, "Loading lead", async () => {
        const r = await client.apiGet<{ lead: unknown }>(`/api/v1/arc/crm/leads/${args.id}`);
        return r.lead ?? null;
      }),
  );

  const searchJobs = tool(
    "search_jobs",
    "Search CRM jobs (restoration jobs/projects). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM jobs", async () => {
        const r = await client.apiGet<{ jobs: unknown[] }>("/api/v1/arc/crm/jobs", args);
        return r.jobs ?? [];
      }),
  );

  const searchOutcomes = tool(
    "search_outcomes",
    "Search CRM outcomes (closed results / attribution). Filters optional.",
    {
      status: z.string().optional(),
      persona: z.string().optional(),
      company_id: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM outcomes", async () => {
        const r = await client.apiGet<{ outcomes: unknown[] }>("/api/v1/arc/crm/outcomes", args);
        return r.outcomes ?? [];
      }),
  );

  const searchProperties = tool(
    "search_properties",
    "Search CRM properties (locations/sites). Filters optional.",
    {
      persona: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      property_type: z.string().optional(),
      company_id: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Searching CRM properties", async () => {
        const r = await client.apiGet<{ properties: unknown[] }>("/api/v1/arc/crm/properties", args);
        return r.properties ?? [];
      }),
  );

  return [searchCompanies, searchContacts, searchLeads, getLead, searchJobs, searchOutcomes, searchProperties];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/tools/crm.ts
git commit -m "feat(arc-runner): CRM read tools"
```

---

## Task 4: Brain tools (read query + observation/edge writes)

**Files:**
- Create: `apps/arc-runner/src/tools/brain.ts`

- [ ] **Step 1: Implement `src/tools/brain.ts`**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/** Read-only brain (knowledge graph) query. Available in all modes. */
export function brainReadTools(client: ArcClient, step: StepFn) {
  const queryBrain = tool(
    "query_brain",
    "Search the marketing brain (knowledge graph) for personas, segments, proof points, messaging angles, CTAs, learnings, and signals. All filters optional.",
    {
      kind: z.string().optional().describe("Node kind, e.g. persona | proof_point | learning | signal"),
      trust_tier: z.string().optional().describe("observed | proposed | trusted | rejected | archived"),
      persona: z.string().optional(),
      ref_table: z.string().optional(),
      ref_id: z.string().optional(),
      search: z.string().optional().describe("Free-text search across nodes"),
    },
    async (args) =>
      runTool(step, "Searching the marketing brain", async () => {
        const r = await client.apiPost<{ nodes: unknown[] }>("/api/v1/arc/brain/query", args);
        return r.nodes ?? [];
      }),
  );

  return [queryBrain];
}

/**
 * Brain write tools (act/draft modes only). Records Arc's understanding as graph
 * nodes/edges. The app auto-gates trust: outbound-governing kinds (brand_fact,
 * messaging_angle, cta, proof_point) land as "proposed" (approval queue); all
 * other kinds (learning, signal, …) land as "observed" (internal). Arc never
 * sets the author or tier — the app forces author "arc".
 */
export function brainWriteTools(client: ArcClient, step: StepFn) {
  const recordBrainNote = tool(
    "record_brain_note",
    "Record a learning, signal, or insight in the marketing brain as a graph node. Use for durable knowledge worth remembering across chats. Outbound-governing kinds (brand_fact, messaging_angle, cta, proof_point) are auto-routed to human approval; learnings/signals are stored as internal observations.",
    {
      kind: z.string().describe("Node kind, e.g. learning | signal | persona | segment | proof_point"),
      label: z.string().describe("Short title for the node"),
      body: z.string().optional().describe("The full content/insight"),
      summary: z.string().optional(),
      persona: z.string().optional(),
      confidence: z.number().optional().describe("0-100"),
      ref_table: z.string().optional().describe("Pair with ref_id to link an existing CRM/campaign row"),
      ref_id: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) =>
      runTool(step, "Recording to the marketing brain", async () => {
        const r = await client.apiPost<{ id: string; kind: string }>("/api/v1/arc/brain/nodes", args);
        return r;
      }),
  );

  const linkBrainNodes = tool(
    "link_brain_nodes",
    "Create a relationship (edge) between two existing brain nodes.",
    {
      from_node_id: z.string(),
      to_node_id: z.string(),
      relation: z
        .enum([
          "responds_to",
          "governs",
          "proves",
          "targets",
          "relates_to",
          "learned_from",
          "used_in",
          "belongs_to",
          "competes_with",
        ])
        .describe("Edge relation type"),
      weight: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Linking brain nodes", async () => {
        const r = await client.apiPost<{ id: string }>("/api/v1/arc/brain/edges", args);
        return r;
      }),
  );

  return [recordBrainNote, linkBrainNodes];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/tools/brain.ts
git commit -m "feat(arc-runner): brain query + observation/edge write tools"
```

---

## Task 5: Campaigns + approvals read tools

**Files:**
- Create: `apps/arc-runner/src/tools/campaigns.ts`

- [ ] **Step 1: Implement `src/tools/campaigns.ts`**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/** Read-only campaign + approval visibility. Available in all modes. */
export function campaignReadTools(client: ArcClient, step: StepFn) {
  const listCampaigns = tool(
    "list_campaigns",
    "List campaigns and their status. Use `needs_review` to find campaigns with items awaiting approval.",
    {
      status: z.string().optional(),
      needs_review: z.boolean().optional().describe("Only campaigns with pending approvals"),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Listing campaigns", async () => {
        const params = { status: args.status, limit: args.limit, needs_review: args.needs_review ? "true" : undefined };
        const r = await client.apiGet<{ campaigns: unknown[] }>("/api/v1/arc/campaigns", params);
        return r.campaigns ?? [];
      }),
  );

  const getCampaign = tool(
    "get_campaign",
    "Fetch one campaign's full detail (brief, assets, approval state) by id.",
    { id: z.string() },
    async (args) =>
      runTool(step, "Loading campaign", async () => {
        const r = await client.apiGet<{ campaign: unknown }>(`/api/v1/arc/campaigns/${args.id}`);
        return r.campaign ?? null;
      }),
  );

  const listApprovals = tool(
    "list_approvals",
    "List items in the human approval queue. Optional comma-separated `status` filter.",
    {
      status: z.string().optional().describe("Comma-separated statuses, e.g. pending_owner_approval,revision_requested"),
      limit: z.number().optional(),
    },
    async (args) =>
      runTool(step, "Listing approvals", async () => {
        const r = await client.apiGet<{ approvals: unknown[] }>("/api/v1/arc/approvals", args);
        return r.approvals ?? [];
      }),
  );

  return [listCampaigns, getCampaign, listApprovals];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/tools/campaigns.ts
git commit -m "feat(arc-runner): campaign + approval read tools"
```

---

## Task 6: CRM interaction write tool

**Files:**
- Create: `apps/arc-runner/src/tools/interactions.ts`

- [ ] **Step 1: Implement `src/tools/interactions.ts`**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * CRM-interaction write tool (act/draft modes only). Append-only annotations on
 * an EXISTING record — a note, a follow-up task, or a timeline activity. The app
 * writes these as author_kind "agent". This is the only direct CRM write Arc has:
 * it never creates or edits core CRM entity rows.
 */
export function interactionWriteTools(client: ArcClient, step: StepFn) {
  const logInteraction = tool(
    "log_interaction",
    "Attach a note, follow-up task, or timeline activity to an existing CRM record. Use to leave a breadcrumb of work done. Does NOT create or edit core records, and never contacts anyone.",
    {
      kind: z.enum(["note", "task", "activity"]),
      entity_type: z.string().describe("CRM entity type, e.g. lead | contact | company | job"),
      entity_id: z.string().describe("The record id to attach to"),
      // note
      body: z.string().optional().describe("Note body (required when kind=note)"),
      is_pinned: z.boolean().optional(),
      is_internal: z.boolean().optional(),
      // task
      title: z.string().optional().describe("Task title (required when kind=task)"),
      description: z.string().optional(),
      due_at: z.string().optional().describe("ISO date"),
      priority: z.string().optional(),
      // activity
      activity_type: z.string().optional().describe("Activity type (required when kind=activity)"),
      summary: z.string().optional().describe("Activity summary (required when kind=activity)"),
      detail: z.string().optional(),
    },
    async (args) =>
      runTool(step, `Logging ${args.kind} on ${args.entity_type}`, async () => {
        const r = await client.apiPost<{ id: string; kind: string }>("/api/v1/arc/crm/interactions", {
          ...args,
          author_name: "Arc",
        });
        return r;
      }),
  );

  return [logInteraction];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/tools/interactions.ts
git commit -m "feat(arc-runner): CRM interaction write tool"
```

---

## Task 7: Mode-gating assembler

**Files:**
- Create: `apps/arc-runner/src/tools/index.ts`
- Create: `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: Write the failing test** — Create `apps/arc-runner/src/tools/index.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import { allowedToolNames, toolsForMode } from "./index";

// A stub client — the assembler only wires tools, it never calls these in the test.
const stubClient = {
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  postChatReply: vi.fn(),
  postStep: vi.fn(),
} as unknown as ArcClient;
const step = vi.fn(async () => {});

const READ = [
  "search_companies",
  "search_contacts",
  "search_leads",
  "get_lead",
  "search_jobs",
  "search_outcomes",
  "search_properties",
  "query_brain",
  "list_campaigns",
  "get_campaign",
  "list_approvals",
];
const WRITE = ["record_brain_note", "link_brain_nodes", "log_interaction"];

describe("toolsForMode", () => {
  it("ask mode exposes only read tools (no writes)", () => {
    const names = toolsForMode("ask", stubClient, step).map((t) => t.name).sort();
    expect(names).toEqual([...READ].sort());
  });

  it("act mode adds the write tools", () => {
    const names = toolsForMode("act", stubClient, step).map((t) => t.name).sort();
    expect(names).toEqual([...READ, ...WRITE].sort());
  });

  it("draft mode (this plan) has the same tools as act", () => {
    const act = toolsForMode("act", stubClient, step).map((t) => t.name).sort();
    const draft = toolsForMode("draft", stubClient, step).map((t) => t.name).sort();
    expect(draft).toEqual(act);
  });
});

describe("allowedToolNames", () => {
  it("prefixes each tool with the mcp__arc__ namespace", () => {
    const allowed = allowedToolNames("ask");
    expect(allowed).toContain("mcp__arc__search_leads");
    expect(allowed.every((n) => n.startsWith("mcp__arc__"))).toBe(true);
  });
  it("ask excludes write tools; act includes them", () => {
    expect(allowedToolNames("ask")).not.toContain("mcp__arc__log_interaction");
    expect(allowedToolNames("act")).toContain("mcp__arc__log_interaction");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --filter @bsr/arc-runner test`. Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement `src/tools/index.ts`**

```ts
import type { ArcClient } from "../arc-client";
import { crmReadTools } from "./crm";
import { brainReadTools, brainWriteTools } from "./brain";
import { campaignReadTools } from "./campaigns";
import { interactionWriteTools } from "./interactions";
import type { StepFn } from "./helpers";

export type ArcMode = "ask" | "act" | "draft";

/** Anything Arc may call to read app state. Available in every mode. */
function readTools(client: ArcClient, step: StepFn) {
  return [...crmReadTools(client, step), ...brainReadTools(client, step), ...campaignReadTools(client, step)];
}

/** Append-only writes: CRM interactions + brain observations. act/draft only. */
function writeTools(client: ArcClient, step: StepFn) {
  return [...brainWriteTools(client, step), ...interactionWriteTools(client, step)];
}

/**
 * The tool set for a turn, gated by operator mode:
 *   ask   → read only
 *   act   → read + writes (CRM interactions, brain observations)
 *   draft → same as act in this plan (draft work products arrive in Plan 3)
 * Outbound has no tool in any mode.
 */
export function toolsForMode(mode: ArcMode, client: ArcClient, step: StepFn) {
  const read = readTools(client, step);
  // Fresh array via spread (not push) so the element type widens to the union of
  // read+write tool definitions — the SDK tool types are invariant in their Zod
  // schema, so pushing write tools into a read-typed array won't compile.
  return mode === "ask" ? [...read] : [...read, ...writeTools(client, step)];
}

/** The `allowedTools` list the SDK expects — each tool namespaced under the `arc` MCP server. */
export function allowedToolNames(mode: ArcMode): string[] {
  // Build from the same source of truth; a dummy client is fine — we only read names.
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  return toolsForMode(mode, placeholder, noop).map((t) => `mcp__arc__${t.name}`);
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --filter @bsr/arc-runner test`. Expected: PASS (all `toolsForMode`/`allowedToolNames` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts
git commit -m "feat(arc-runner): mode-gated tool assembler"
```

---

## Task 8: Wire the assembler into `arc.ts`

**Files:**
- Modify: `apps/arc-runner/src/arc.ts`

- [ ] **Step 1: Replace the tool wiring in `runArcTurn`**

In `apps/arc-runner/src/arc.ts`:

1. Remove the imports of `tool` and `z` (no longer used here) and the entire inline `findLeads` definition.
2. Add: `import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";` (drop `tool`), and `import { allowedToolNames, toolsForMode } from "./tools";`.
3. Build the server + allowed list from the mode. Replace the block that created `findLeads`, `arcServer`, and the `query({...})` options so it reads:

```ts
  const tools = toolsForMode(payload.mode, client, step);
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });

  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, ctx);
  const preamble = formatHistory(payload.history);
  const prompt = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;

  let assistantText = "";
  let resultText = "";

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: system,
      model: modelForRoute(payload.route),
      mcpServers: { arc: arcServer },
      allowedTools: allowedToolNames(payload.mode),
      permissionMode: "bypassPermissions",
    },
  })) {
```

Leave the message-accumulation loop body and the `return (resultText || assistantText).trim();` unchanged. The `step` helper, `ctx` construction, and imports of `buildSystemPrompt`/`formatHistory`/`modelForRoute`/`ARC_SYSTEM_PROMPT`/`BSR_CONTEXT` stay. The interim `client.getLeads`/`apiGet` glue from Task 1 is removed along with `findLeads`.

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
Expected: PASS (no unused `tool`/`z` imports; all tests green).

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/arc.ts
git commit -m "feat(arc-runner): use mode-gated tool surface in runArcTurn"
```

---

## Task 9: Inject the persona taxonomy into the system prompt

**Files:**
- Create: `apps/arc-runner/src/personas.ts`
- Modify: `apps/arc-runner/src/context.ts`
- Modify: `apps/arc-runner/src/context.test.ts`

- [ ] **Step 1: Create `src/personas.ts`** — the 12 official persona keys (mirrors `OFFICIAL_PERSONA_MAPPINGS` in the app; duplicated so the runner stays standalone):

```ts
/**
 * The 12 official persona keys (mirrors OFFICIAL_PERSONA_MAPPINGS in the app's
 * src/domain/personas.ts). Duplicated, not imported — the runner is a standalone
 * service. Keep in sync if the app's taxonomy changes. `unassigned_persona` is
 * internal-only and deliberately excluded.
 */
export const ARC_PERSONAS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "persona_homeowner_emergency", label: "Emergency Homeowner" },
  { key: "persona_homeowner_preventative", label: "Preventative Homeowner" },
  { key: "persona_homeowner_rebuild", label: "Rebuild Homeowner" },
  { key: "persona_landlord", label: "Landlord" },
  { key: "persona_hoa_board", label: "HOA Board" },
  { key: "persona_property_manager", label: "Property Manager" },
  { key: "persona_insurance_agent", label: "Insurance Agent" },
  { key: "persona_listing_agent", label: "Listing Agent" },
  { key: "persona_buyers_agent", label: "Buyer's Agent" },
  { key: "persona_plumbing_partner", label: "Plumbing Partner" },
  { key: "persona_hvac_roof_electrical_partner", label: "HVAC / Roof / Electrical Partner" },
  { key: "persona_gc_remodeler_partner", label: "GC / Remodeler Partner" },
];
```

- [ ] **Step 2: Add a failing test** — append to `apps/arc-runner/src/context.test.ts` inside the `buildSystemPrompt` describe block:

```ts
  it("includes the persona taxonomy", () => {
    const out = buildSystemPrompt("BASE", baseCtx);
    expect(out).toContain("persona_homeowner_emergency");
    expect(out).toContain("Emergency Homeowner");
  });
```

Run: `pnpm --filter @bsr/arc-runner test` → Expected: FAIL (persona keys not in prompt yet).

- [ ] **Step 3: Inject personas in `src/context.ts`**

Add the import at the top: `import { ARC_PERSONAS } from "./personas";`

Add this helper near the other block builders:

```ts
function personasBlock(): string {
  const lines = ARC_PERSONAS.map((p) => `- ${p.key} — ${p.label}`);
  return ["PERSONA TAXONOMY (use these exact keys when mapping or filtering by persona):", ...lines].join("\n");
}
```

Then add `personasBlock()` to the `parts` array in `buildSystemPrompt`, right after `businessBlock(ctx.business)`:

```ts
  const parts: (string | null)[] = [
    base,
    businessBlock(ctx.business),
    personasBlock(),
    modeBlock(ctx.mode),
    styleBlock(ctx),
    scopeBlock(ctx.scope),
    mentionsBlock(ctx.mentions),
  ];
```

- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --filter @bsr/arc-runner test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/personas.ts apps/arc-runner/src/context.ts apps/arc-runner/src/context.test.ts
git commit -m "feat(arc-runner): inject persona taxonomy into the system prompt"
```

---

## Task 10: Manual end-to-end acceptance

**Files:** none (verification only). Run the app + runner as in Plan 1 Task 9 (runner `.env` already configured).

- [ ] **Step 1: Read breadth (ask mode).** In `/arc`, ask: "Summarize what's in the CRM — companies, contacts, leads, jobs."
  Expected: multiple steps animate (`Searching CRM companies`, `… contacts`, `… leads`, `… jobs`), and Arc reports real counts/rows (or honestly "empty" per table). Confirms the read surface + multi-tool use.

- [ ] **Step 2: Brain read.** Ask: "What do we know in the marketing brain about the Emergency Homeowner persona?"
  Expected: a `Searching the marketing brain` step; Arc returns brain nodes (or says none yet). Uses the exact persona key from the injected taxonomy.

- [ ] **Step 3: Write gating — ask mode blocks writes.** In **ask** mode: "Log a note on lead X saying I called them."
  Expected: Arc explains it can't write in ask mode (no `log_interaction` tool available) and suggests act mode. (With an empty CRM, also fine for it to note there's no such lead.)

- [ ] **Step 4: Write works — act mode.** Switch to **act** mode. With a real lead id (create one in `/crm` first, or use an existing record), say: "Log a follow-up task on lead <id>: call back tomorrow."
  Expected: a `Logging task on lead` step; the task appears on that record's timeline in `/crm`. Confirms criterion #6 (CRM-interaction write).

- [ ] **Step 5: Brain gating.** In **act** mode: (a) "Record a learning: emergency homeowners convert fastest on water-damage." → persists as `observed`. (b) "Add a messaging angle: 'We answer in 60 minutes.'" → persists as `proposed` and shows in the brain approval queue. Confirms criterion #7 (observed vs proposed gating).

- [ ] **Step 6: Outbound still locked.** Confirm no tool can send/email/launch in any mode (there is none), and Arc declines such requests.

---

## Self-review notes

- **Spec coverage (§4):** read tools across CRM/brain/campaigns/approvals (Tasks 3–5), CRM-interaction write (Task 6), brain observation/edge writes with trust gating handled app-side (Task 4), mode gating ask/act/draft (Task 7), persona taxonomy in prompt (Task 9), wired into the engine (Task 8). Acceptance criteria #6 (CRM-interaction write) and #7 (brain gating) become testable here (Task 10).
- **Deferred & flagged:** project-assets tool (no endpoint — needs a new app route), draft work products + action cards (Plan 3).
- **Type/name consistency:** `ArcClient` + `createArcClient` (Task 1) consumed everywhere; `StepFn`/`runTool`/`textResult` (Task 2) used by every tool file; `toolsForMode`/`allowedToolNames` (Task 7) consumed by `arc.ts` (Task 8). Tool names in the Task 7 test (`READ`/`WRITE` arrays) match the `tool("name", …)` literals in Tasks 3–6.
- **Trust gating is app-enforced:** the runner never sends an author or tier; `brain/nodes` forces author `"arc"` and the domain decides observed/proposed. The runner tool descriptions tell Arc this so it sets expectations correctly.
