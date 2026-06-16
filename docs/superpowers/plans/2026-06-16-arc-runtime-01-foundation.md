# Arc Runtime — Plan 1: Foundation (scoped turn engine, context, memory, wake contract)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Arc honor operator context (mode/route/tone/style/mentions), remember the conversation, and be scoped to its conversation/project/campaign — by refactoring the runner into a stateless `runArcTurn` engine fed by an enriched wake payload.

**Architecture:** The app enriches the chat wake with `projectId`, `campaignId`, and bounded thread `history`. The runner refactors `runArc()` → `runArcTurn(payload, client)`, which builds the model (from `route`), the system prompt (from a business-context object + mode + tone/style + scope + mentions), and the prompt (history preamble + current message), then runs the existing Claude Agent SDK `query()` loop. Pure builders are unit-tested; the glue is verified by typecheck + manual acceptance. The existing `find_leads` tool is preserved unchanged; richer tools and action cards come in Plans 2 and 3.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk`, Node `http`, Supabase (app side), Vitest (app already; added to the runner here).

This is Plan 1 of 3 for Phase 1 of [the Arc runtime spec](../specs/2026-06-16-arc-runtime-design.md):
1. **This plan** — engine + context + memory + wake contract.
2. Tool surface (read tools + CRM-interaction/brain writes, mode-gated).
3. Action cards + draft work products → approval.

---

## File Structure

**Runner (`apps/arc-runner/`):**
- Create `src/business-context.ts` — `ArcBusinessContext` type + the BSR seed constant (the single-tenant multi-tenant seam).
- Create `src/context.ts` — pure builders: `modelForRoute`, `formatHistory`, `buildSystemPrompt`.
- Create `src/context.test.ts` — unit tests for the above.
- Modify `src/types.ts` — add `ArcHistoryTurn`; add `projectId`/`campaignId`/`history` to `MarkChatMessagePayload`.
- Modify `src/arc.ts` — `runArc()` → `runArcTurn(payload, client)`.
- Modify `src/handler.ts` — pass the full payload into `runArcTurn`.
- Modify `package.json` — add Vitest + `test` script.
- Create `vitest.config.ts` — runner test config.

**App (`src/`):**
- Create `src/lib/mark-chat/history.ts` — pure `buildWakeHistory` + I/O `loadWakeContext`.
- Create `src/lib/mark-chat/history.test.ts` — unit tests for `buildWakeHistory`.
- Modify `src/lib/mark-chat/notify.ts` — add `projectId`/`campaignId`/`history` to `MarkNotifyPayload`.
- Modify `src/app/mark/actions.ts` — enrich both `notifyMarkWebhook` call sites via `loadWakeContext`.

---

## Task 1: Add Vitest to the runner

**Files:**
- Modify: `apps/arc-runner/package.json`
- Create: `apps/arc-runner/vitest.config.ts`
- Create: `apps/arc-runner/src/smoke.test.ts` (temporary, deleted in Step 5)

- [ ] **Step 1: Add the test script and dev dependency**

In `apps/arc-runner/package.json`, add `"test": "vitest run"` to `scripts` and `"vitest": "^3.2.4"` to `devDependencies`:

```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
```

```json
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
```

- [ ] **Step 2: Create the Vitest config**

Create `apps/arc-runner/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Install and add a smoke test**

Run (from repo root): `pnpm install` (workspace-aware; picks up the new devDependency)

Create `apps/arc-runner/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS (1 test).

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm apps/arc-runner/src/smoke.test.ts
git add apps/arc-runner/package.json apps/arc-runner/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(arc-runner): add vitest"
```

---

## Task 2: Business-context seed (the multi-tenant seam)

**Files:**
- Create: `apps/arc-runner/src/business-context.ts`

- [ ] **Step 1: Create the business-context module**

Create `apps/arc-runner/src/business-context.ts`:

```ts
/**
 * The business Arc currently acts on behalf of. Single-tenant today (BSR), but
 * this object IS the multi-tenant seam: every per-business fact Arc needs is
 * here, injected into the system prompt by buildSystemPrompt(). Going
 * multi-tenant later means resolving this per-wake (by org id) instead of using
 * the constant — no change to the engine.
 */
export type ArcBusinessContext = {
  businessName: string;
  industry: string;
  brandVoice: string;
  /** Short note on approved-media posture and creative guardrails. */
  creativePolicy: string;
  /** Compliance / restricted-claims posture, stated for the model. */
  compliance: string;
};

export const BSR_CONTEXT: ArcBusinessContext = {
  businessName: "Big Shoulders Restoration (BSR)",
  industry: "Property damage restoration — water, flood, sewage, mold, fire, storm.",
  brandVoice: "Calm, expert, urgency-aware. Reassuring without overpromising. No hype, no emojis.",
  creativePolicy:
    "Prefer BSR's real, approved media. AI creative may package/resize/test authentic proof, never fabricate scenes. Flag embedded text, unrealistic scenes, privacy/redaction, and unsubstantiated claims.",
  compliance:
    "Never promise insurance coverage, claim approval, payouts, or timelines. Stay coverage-neutral. Keep to restoration scope (water/flood/sewage/mold/fire/storm); route hail-only, wind-only, exterior-roof-only, and unrelated remodeling out of scope.",
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/business-context.ts
git commit -m "feat(arc-runner): add business-context seed (multi-tenant seam)"
```

---

## Task 3: Pure context builders (model, history, system prompt)

**Files:**
- Create: `apps/arc-runner/src/context.ts`
- Create: `apps/arc-runner/src/context.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/arc-runner/src/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";

const baseCtx: ArcTurnContext = {
  business: BSR_CONTEXT,
  mode: "ask",
  scope: { conversationId: "c1", projectId: null, campaignId: null, operator: "Evan" },
  mentions: [],
};

describe("modelForRoute", () => {
  it("maps standard to Opus", () => {
    expect(modelForRoute("standard")).toBe("claude-opus-4-8");
  });
  it("maps fast to Haiku", () => {
    expect(modelForRoute("fast")).toBe("claude-haiku-4-5");
  });
});

describe("formatHistory", () => {
  it("returns empty string for no turns", () => {
    expect(formatHistory(undefined)).toBe("");
    expect(formatHistory([])).toBe("");
  });
  it("renders operator and arc turns in order with a header", () => {
    const out = formatHistory([
      { role: "operator", body: "find me leads" },
      { role: "arc", body: "Found 3." },
    ]);
    expect(out).toContain("Conversation so far");
    expect(out.indexOf("find me leads")).toBeLessThan(out.indexOf("Found 3."));
    expect(out).toContain("Operator:");
    expect(out).toContain("Arc:");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the base prompt and the business name", () => {
    const out = buildSystemPrompt("BASE_PROMPT", baseCtx);
    expect(out).toContain("BASE_PROMPT");
    expect(out).toContain(BSR_CONTEXT.businessName);
  });
  it("states read-only stance for ask mode", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, mode: "ask" });
    expect(out.toLowerCase()).toContain("read-only");
  });
  it("permits drafts in draft mode and never outbound", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, mode: "draft" });
    expect(out.toLowerCase()).toContain("draft");
    expect(out.toLowerCase()).toContain("approval");
  });
  it("names the project and campaign when scoped", () => {
    const out = buildSystemPrompt("BASE", {
      ...baseCtx,
      scope: { conversationId: "c1", projectId: "p1", campaignId: "camp1", operator: "Evan" },
    });
    expect(out).toContain("p1");
    expect(out).toContain("camp1");
  });
  it("lists mentions when present", () => {
    const out = buildSystemPrompt("BASE", {
      ...baseCtx,
      mentions: [{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }],
    });
    expect(out).toContain("Dana Kasprak");
  });
  it("includes behavior hints when provided", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, assistantTone: "warm", assistantResponseStyle: "concise" });
    expect(out).toContain("warm");
    expect(out).toContain("concise");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: FAIL — `Cannot find module './context'`.

- [ ] **Step 3: Implement the context builders**

Create `apps/arc-runner/src/context.ts`:

```ts
import type { ArcBusinessContext } from "./business-context";
import type { ArcHistoryTurn, MarkMention } from "./types";

/** Route → model. Fast chat rides Haiku; heavier "standard" work rides Opus. */
export function modelForRoute(route: "fast" | "standard"): string {
  return route === "standard" ? "claude-opus-4-8" : "claude-haiku-4-5";
}

/** Render bounded thread history as a prompt preamble. Empty string when none. */
export function formatHistory(turns: ArcHistoryTurn[] | undefined): string {
  if (!turns || turns.length === 0) return "";
  const lines = turns.map((t) => `${t.role === "arc" ? "Arc" : "Operator"}: ${t.body}`);
  return ["Conversation so far (most recent last):", ...lines].join("\n");
}

export type ArcTurnScope = {
  conversationId: string;
  projectId: string | null;
  campaignId: string | null;
  operator: string;
};

export type ArcTurnContext = {
  business: ArcBusinessContext;
  mode: "ask" | "act" | "draft";
  scope: ArcTurnScope;
  mentions: MarkMention[];
  assistantTone?: string;
  assistantResponseStyle?: string;
  approvalStrictness?: string;
};

function businessBlock(b: ArcBusinessContext): string {
  return [
    `BUSINESS YOU ACT FOR: ${b.businessName}`,
    `Industry: ${b.industry}`,
    `Brand voice: ${b.brandVoice}`,
    `Creative policy: ${b.creativePolicy}`,
    `Compliance: ${b.compliance}`,
  ].join("\n");
}

function modeBlock(mode: "ask" | "act" | "draft"): string {
  if (mode === "ask") {
    return "MODE: ask — read-only. Answer and analyze using read tools only. Do not create, modify, or draft anything.";
  }
  if (mode === "act") {
    return [
      "MODE: act — you may read, log CRM interactions (notes / follow-up tasks / timeline activity) on existing records, and record internal brain observations.",
      "You may NOT create or edit core CRM records, and you may NOT create campaign or asset drafts in this mode.",
    ].join("\n");
  }
  return [
    "MODE: draft — everything in act, plus you may create approval-gated draft campaigns and assets.",
    "Every draft awaits human approval before it can be used. Nothing you do goes outbound.",
  ].join("\n");
}

function styleBlock(ctx: ArcTurnContext): string | null {
  const bits: string[] = [];
  if (ctx.assistantTone) bits.push(`tone: ${ctx.assistantTone}`);
  if (ctx.assistantResponseStyle) bits.push(`response style: ${ctx.assistantResponseStyle}`);
  if (ctx.approvalStrictness) bits.push(`approval strictness: ${ctx.approvalStrictness}`);
  return bits.length ? `OPERATOR PREFERENCES — ${bits.join("; ")}.` : null;
}

function scopeBlock(scope: ArcTurnScope): string {
  const lines = [`You are working in conversation ${scope.conversationId} for operator ${scope.operator}.`];
  if (scope.projectId) {
    lines.push(`This chat belongs to project ${scope.projectId} — its shared assets are relevant context.`);
  }
  if (scope.campaignId) {
    lines.push(`This chat is linked to campaign ${scope.campaignId} — ground your work in that campaign.`);
  }
  return lines.join("\n");
}

function mentionsBlock(mentions: MarkMention[]): string | null {
  if (mentions.length === 0) return null;
  const lines = mentions.map((m) => `- ${m.label} (${m.type}) → ${m.href}`);
  return ["The operator referenced these records — treat them as the focus:", ...lines].join("\n");
}

/** Compose the full system prompt from the base prompt + per-turn context. */
export function buildSystemPrompt(base: string, ctx: ArcTurnContext): string {
  const parts: (string | null)[] = [
    base,
    businessBlock(ctx.business),
    modeBlock(ctx.mode),
    styleBlock(ctx),
    scopeBlock(ctx.scope),
    mentionsBlock(ctx.mentions),
  ];
  return parts.filter((p): p is string => Boolean(p)).join("\n\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS (all `context` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/context.ts apps/arc-runner/src/context.test.ts
git commit -m "feat(arc-runner): pure context builders (model, history, system prompt)"
```

---

## Task 4: Extend the runner wake payload type

**Files:**
- Modify: `apps/arc-runner/src/types.ts`

- [ ] **Step 1: Add the history turn type and the new payload fields**

Replace the contents of `apps/arc-runner/src/types.ts` with:

```ts
/**
 * Wake payloads the app POSTs to the runner. Mirrors `MarkNotifyPayload` in the
 * app (src/lib/mark-chat/notify.ts). Duplicated, not imported, so the runner
 * stays an independent service. Update here if the app contract changes.
 */

export type MarkMention = { type: string; id: string; label: string; href: string };

/** One prior turn of the conversation, injected so Arc has memory. */
export type ArcHistoryTurn = { role: "operator" | "arc"; body: string };

export type MarkChatMessagePayload = {
  type: "mark_chat_message";
  messageId: string;
  conversationId: string;
  /** The conversation's project, if any — enables project-scoped context. */
  projectId: string | null;
  /** The conversation's linked campaign, if any — grounds the chat. */
  campaignId: string | null;
  /** The queued agent_task Arc settles when it posts its reply back. */
  agentTaskId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
  route: "fast" | "standard";
  mode: "ask" | "act" | "draft";
  assistantTone?: string;
  assistantResponseStyle?: string;
  approvalStrictness?: string;
  command?: string | null;
  attachments?: unknown[];
  /** Bounded prior turns (oldest → newest), excluding the current message. */
  history?: ArcHistoryTurn[];
};

export type MarkPingPayload = { type: "ping"; workspaceId?: string; nonce?: string; at?: string };

export type WakePayload = MarkChatMessagePayload | MarkPingPayload | { type?: string };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: FAIL — `arc.ts` / `handler.ts` still reference the old `runArc` shape. (Expected; fixed in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add apps/arc-runner/src/types.ts
git commit -m "feat(arc-runner): add projectId/campaignId/history to wake payload type"
```

---

## Task 5: Refactor `runArc` → `runArcTurn` and wire the handler

**Files:**
- Modify: `apps/arc-runner/src/arc.ts`
- Modify: `apps/arc-runner/src/handler.ts`

- [ ] **Step 1: Rewrite `arc.ts` to consume context + history**

Replace the contents of `apps/arc-runner/src/arc.ts` with:

```ts
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";
import type { HermesClient } from "./hermes-client";
import { ARC_SYSTEM_PROMPT } from "./prompt";
import type { MarkChatMessagePayload } from "./types";

/**
 * Run one Arc turn via the Claude Agent SDK and return the final reply text.
 *
 * Stateless per call: all scope/context comes from `payload`, nothing is held in
 * module state, so concurrent chats are independent runs. Memory is the bounded
 * `payload.history` injected as a prompt preamble. The model is chosen by
 * `payload.route`; the system prompt is composed from the business context, the
 * operator's mode, behavior hints, conversation scope, and any @-mentions.
 *
 * Tools: Arc gets in-process tools that call the app's API. Each tool reports a
 * running -> done step to the chat bubble, producing the live trace. (Richer
 * tools and action cards arrive in later plans; find_leads is the seed.)
 */
export async function runArcTurn(payload: MarkChatMessagePayload, client: HermesClient): Promise<string> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);

  const ctx: ArcTurnContext = {
    business: BSR_CONTEXT,
    mode: payload.mode,
    scope: {
      conversationId: payload.conversationId,
      projectId: payload.projectId,
      campaignId: payload.campaignId,
      operator: payload.operator,
    },
    mentions: payload.mentions,
    assistantTone: payload.assistantTone,
    assistantResponseStyle: payload.assistantResponseStyle,
    approvalStrictness: payload.approvalStrictness,
  };

  const findLeads = tool(
    "find_leads",
    "Search the connected business's CRM leads. Use when the operator asks about leads, opportunities, or who to target. All filters are optional.",
    {
      status: z.string().optional().describe("Lead status, e.g. qualified | new | contacted"),
      persona: z.string().optional().describe("Persona key to filter by"),
      source: z.string().optional().describe("Lead source to filter by"),
      q: z.string().optional().describe("Free-text search across leads"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async (args) => {
      const label = "Searching CRM leads";
      await step(label, "running");
      try {
        const leads = await client.getLeads(args);
        await step(label, "done");
        return { content: [{ type: "text" as const, text: JSON.stringify(leads).slice(0, 8000) }] };
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return { content: [{ type: "text" as const, text: `find_leads failed: ${reason}` }] };
      }
    },
  );

  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools: [findLeads] });

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
      allowedTools: ["mcp__arc__find_leads"],
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") assistantText += block.text;
      }
    } else if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }

  return (resultText || assistantText).trim();
}
```

- [ ] **Step 2: Update the handler to pass the full payload**

Replace the contents of `apps/arc-runner/src/handler.ts` with:

```ts
import { runArcTurn } from "./arc";
import type { Config } from "./config";
import type { HermesClient } from "./hermes-client";
import type { MarkChatMessagePayload } from "./types";

/**
 * Handle one operator chat message: run it through Arc (Claude Agent SDK) and
 * post the reply back to the app, which resolves the pending bubble in /mark.
 * Outbound stays locked — this only records a chat reply.
 */
export async function handleChatMessage(
  client: HermesClient,
  _config: Config,
  payload: MarkChatMessagePayload,
): Promise<void> {
  console.log(`[arc-runner] wake received → running Arc for task ${payload.agentTaskId} (route=${payload.route}, mode=${payload.mode})`);
  const started = Date.now();
  try {
    const reply = await runArcTurn(payload, client);
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
    });
    console.log(`[arc-runner] replied to task ${payload.agentTaskId} in ${Date.now() - started}ms`);
  } catch (error) {
    console.error("[arc-runner] Arc run failed:", error);
    await client
      .postChatReply({
        agentTaskId: payload.agentTaskId,
        status: "failed",
        body: "Arc hit an error generating a reply. Check the runner logs.",
      })
      .catch(() => undefined);
  }
}
```

- [ ] **Step 3: Typecheck and run tests**

Run: `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
Expected: PASS (typecheck clean; all tests green).

> Note: `config.model` is no longer read by the handler (the model now comes from `route`). `config.ts` keeps `model` for back-compat; leave it. The `_config` param is retained so the server's call signature is unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/arc-runner/src/arc.ts apps/arc-runner/src/handler.ts
git commit -m "feat(arc-runner): runArcTurn engine — context, memory, route-based model"
```

---

## Task 6: App-side bounded history builder

**Files:**
- Create: `src/lib/mark-chat/history.ts`
- Create: `src/lib/mark-chat/history.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mark-chat/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildWakeHistory, type WakeHistoryTurn } from "./history";
import type { MarkMessage } from "./persistence";

function msg(over: Partial<MarkMessage>): MarkMessage {
  return {
    id: "m",
    conversationId: "c1",
    role: "operator",
    body: "hi",
    status: "sent",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: "2026-06-16T00:00:00Z",
    ...over,
  };
}

describe("buildWakeHistory", () => {
  it("maps operator → operator and mark → arc, in order", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "operator", body: "find leads", status: "sent" }),
      msg({ id: "2", role: "mark", body: "found 3", status: "complete" }),
    ]);
    expect(out).toEqual<WakeHistoryTurn[]>([
      { role: "operator", body: "find leads" },
      { role: "arc", body: "found 3" },
    ]);
  });

  it("drops pending, failed, empty-body, and system messages", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "mark", body: "", status: "pending" }),
      msg({ id: "2", role: "mark", body: "oops", status: "failed" }),
      msg({ id: "3", role: "system", body: "system note", status: "complete" }),
      msg({ id: "4", role: "operator", body: "real", status: "sent" }),
    ]);
    expect(out).toEqual<WakeHistoryTurn[]>([{ role: "operator", body: "real" }]);
  });

  it("excludes the current message by id", () => {
    const out = buildWakeHistory(
      [
        msg({ id: "1", role: "operator", body: "old", status: "sent" }),
        msg({ id: "cur", role: "operator", body: "current", status: "sent" }),
      ],
      { excludeId: "cur" },
    );
    expect(out).toEqual<WakeHistoryTurn[]>([{ role: "operator", body: "old" }]);
  });

  it("keeps only the most recent `limit` turns", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      msg({ id: String(i), role: "operator", body: `m${i}`, status: "sent" }),
    );
    const out = buildWakeHistory(many, { limit: 3 });
    expect(out.map((t) => t.body)).toEqual(["m17", "m18", "m19"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/mark-chat/history.test.ts`
Expected: FAIL — `Cannot find module './history'`.

- [ ] **Step 3: Implement `history.ts`**

Create `src/lib/mark-chat/history.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { getConversation, listMessages, type MarkMessage } from "./persistence";
import { getSupabaseAdminClient } from "../supabase/server";

/** One prior turn handed to the runner so Arc has memory. */
export type WakeHistoryTurn = { role: "operator" | "arc"; body: string };

const DEFAULT_HISTORY_LIMIT = 12;

/**
 * Pure: distil persisted messages into bounded turns for the wake. Keeps only
 * settled, non-empty operator and Arc ("mark") messages; drops pending/failed/
 * system and the current message; returns the most recent `limit`, oldest first.
 */
export function buildWakeHistory(
  messages: MarkMessage[],
  options: { limit?: number; excludeId?: string } = {},
): WakeHistoryTurn[] {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const turns: WakeHistoryTurn[] = [];
  for (const m of messages) {
    if (m.id === options.excludeId) continue;
    if (m.role !== "operator" && m.role !== "mark") continue;
    const body = m.body.trim();
    if (!body) continue;
    if (m.role === "operator" && m.status !== "sent") continue;
    if (m.role === "mark" && m.status !== "complete") continue;
    turns.push({ role: m.role === "mark" ? "arc" : "operator", body });
  }
  return turns.slice(-limit);
}

/**
 * I/O: load the project/campaign scope + bounded history for a conversation,
 * ready to merge into the wake payload. Best-effort caller decides what to do on
 * throw; this surfaces errors so the caller can fall back to a bare wake.
 */
export async function loadWakeContext(
  conversationId: string,
  options: { excludeId?: string } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ projectId: string | null; campaignId: string | null; history: WakeHistoryTurn[] }> {
  const [conversation, messages] = await Promise.all([
    getConversation(conversationId, client),
    listMessages(conversationId, client),
  ]);
  return {
    projectId: conversation?.projectId ?? null,
    campaignId: conversation?.campaignId ?? null,
    history: buildWakeHistory(messages, { excludeId: options.excludeId }),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/mark-chat/history.test.ts`
Expected: PASS (all `buildWakeHistory` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mark-chat/history.ts src/lib/mark-chat/history.test.ts
git commit -m "feat(mark-chat): bounded wake history + loadWakeContext"
```

---

## Task 7: Extend the app wake payload (`MarkNotifyPayload`)

**Files:**
- Modify: `src/lib/mark-chat/notify.ts`

- [ ] **Step 1: Add the new fields to the payload type**

In `src/lib/mark-chat/notify.ts`, add an import for the history-turn type at the top of the imports:

```ts
import { type WakeHistoryTurn } from "./history";
```

Then add these three fields to the `MarkNotifyPayload` type, immediately after the `conversationId: string;` line:

```ts
  /** The conversation's project, if any — enables project-scoped context for Arc. */
  projectId: string | null;
  /** The conversation's linked campaign, if any — grounds the chat. */
  campaignId: string | null;
```

and add this field at the end of the type (after `attachments?`):

```ts
  /** Bounded prior turns (oldest → newest), excluding the current message. */
  history?: WakeHistoryTurn[];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: FAIL — `src/app/mark/actions.ts` now omits the required `projectId`/`campaignId` on both `notifyMarkWebhook` calls. (Expected; fixed in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/mark-chat/notify.ts
git commit -m "feat(mark-chat): add projectId/campaignId/history to wake payload"
```

---

## Task 8: Enrich the wake at both send sites

**Files:**
- Modify: `src/app/mark/actions.ts`

- [ ] **Step 1: Import `loadWakeContext`**

In `src/app/mark/actions.ts`, add to the existing imports:

```ts
import { loadWakeContext } from "@/lib/mark-chat/history";
```

- [ ] **Step 2: Enrich the primary send wake (around line 138)**

In the `sendMessage`-style action, immediately **before** the `const delivered = await notifyMarkWebhook({` call, add:

```ts
    const wakeContext = await loadWakeContext(conversationId, { excludeId: messageId }, client);
```

Then change the `notifyMarkWebhook({ ... })` argument object to include the scope + history. The object currently starts with `messageId, conversationId, agentTaskId,` — insert the scope fields right after `conversationId,` and the history at the end:

```ts
    const delivered = await notifyMarkWebhook({
      messageId,
      conversationId,
      projectId: wakeContext.projectId,
      campaignId: wakeContext.campaignId,
      agentTaskId,
      message: body,
      mentions: cleanMentions,
      operator,
      route,
      mode,
      assistantTone: settings.assistantTone,
      assistantResponseStyle: settings.assistantResponseStyle,
      approvalStrictness: settings.approvalStrictness,
      command,
      attachments,
      history: wakeContext.history,
    });
```

- [ ] **Step 3: Enrich the second wake site (regenerate, around line 507)**

The regenerate block uses `convId` for the conversation and `lastOperator.id` for the operator message being regenerated. Immediately **before** its `const delivered = await notifyMarkWebhook({` call (currently ~line 507), add:

```ts
    const regenWakeContext = await loadWakeContext(convId, { excludeId: lastOperator.id }, client);
```

Then update that `notifyMarkWebhook({ ... })` object to:

```ts
    const delivered = await notifyMarkWebhook({
      messageId: lastOperator.id,
      conversationId: convId,
      projectId: regenWakeContext.projectId,
      campaignId: regenWakeContext.campaignId,
      agentTaskId,
      message: lastOperator.body,
      mentions: lastOperator.mentions,
      operator,
      route,
      mode,
      assistantTone: settings.assistantTone,
      assistantResponseStyle: settings.assistantResponseStyle,
      approvalStrictness: settings.approvalStrictness,
      history: regenWakeContext.history,
    });
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

Run: `pnpm lint src/app/mark/actions.ts src/lib/mark-chat/history.ts src/lib/mark-chat/notify.ts`
Expected: no errors on these files.

- [ ] **Step 5: Run the full test suites**

Run: `pnpm test src/lib/mark-chat` then `pnpm --filter @bsr/arc-runner test`
Expected: PASS in both.

- [ ] **Step 6: Commit**

```bash
git add src/app/mark/actions.ts
git commit -m "feat(mark-chat): send project/campaign scope + thread history in the wake"
```

---

## Task 9: Manual end-to-end acceptance

**Files:** none (verification only).

- [ ] **Step 1: Start the app and the runner**

Run the app (`pnpm dev`) and the runner (`pnpm --filter @bsr/arc-runner dev`) with the runner's `.env` pointing `APP_API_BASE_URL` at the app and the matching `HERMES_AGENT_API_TOKEN` / `MARK_WEBHOOK_SECRET`, and a valid `CLAUDE_CODE_OAUTH_TOKEN`. Point the app's agent connection webhook URL at the runner.

- [ ] **Step 2: Verify memory (acceptance criterion #4)**

In /mark, send "My favorite persona is Emergency Homeowner." Wait for Arc's reply. Then send "Which persona did I just mention?"
Expected: Arc answers "Emergency Homeowner" — proving `history` reached it. Check runner logs show the second wake carried a non-empty `history`.

- [ ] **Step 3: Verify route → model**

Send a message on the **fast** route and one on **standard**; confirm in runner logs the model used is `claude-haiku-4-5` then `claude-opus-4-8` respectively (log line in `handleChatMessage` prints the route; add a temporary `console.log(modelForRoute(payload.route))` in `arc.ts` if you want the exact string, then remove it).

- [ ] **Step 4: Verify mode is honored in the prompt (acceptance criterion #3, prompt-level)**

Send a message in **ask** mode asking Arc to "create a campaign." Expected: Arc declines / explains it can only draft in draft mode and read here — it does not claim to have created anything. (Tool-level enforcement lands in Plan 2; this verifies the mode stance reached the prompt.)

- [ ] **Step 5: Verify scope isolation across chats**

Open a second conversation in the same project. Confirm it does **not** answer the "which persona did I mention?" question from the first chat (separate `conversationId` → separate history).

---

## Self-review notes

- **Spec coverage (Plan 1 slice):** §1 engine (Tasks 3–5), §2 context — route/mode/mentions/tone/style/business (Tasks 2–3, 5), §3 scope + per-conversation memory (Tasks 3, 6–8), contract change (Tasks 4, 6–8). §4 tools, §5 cards, §6 proactive are explicitly later plans.
- **Type consistency:** `ArcHistoryTurn` (runner) and `WakeHistoryTurn` (app) are intentionally distinct types with identical shape (`{ role: "operator" | "arc"; body }`) — the runner duplicates the app contract by design (see `types.ts` doc comment). `modelForRoute`, `buildSystemPrompt`, `formatHistory`, `ArcTurnContext`, `ArcTurnScope` are defined in Task 3 and consumed unchanged in Task 5. `buildWakeHistory`/`loadWakeContext` defined in Task 6, consumed in Task 8.
- **Open items deferred to Plan 2:** tool-level mode enforcement; richer read/write tools.
