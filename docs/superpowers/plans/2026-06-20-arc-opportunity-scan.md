# Proactive Arc — Opportunity Generation (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator button on `/opportunities` wakes Arc to survey its vision and propose source-backed opportunities (`pending`) into the inbox, via a new `arc_opportunity_scan` wake + a `propose_opportunity` tool reusing `upsertOpportunities`.

**Architecture:** Mirror the existing `arc_opportunity_draft` wake end-to-end (enqueue → discriminated notify payload → `server.ts` dispatch → `handler` → `runArc*`). Add a new `"scan"` Arc mode whose tool set is read tools + `propose_opportunity` only. Widen `OpportunityCandidate` so Arc can propose beyond the cold-lead shape. No schema change.

**Tech Stack:** TypeScript, Vitest, Next.js 16, `@anthropic-ai/claude-agent-sdk`.

**Test commands:** app — `pnpm test <path>`; runner — `pnpm --filter @bsr/arc-runner exec vitest run <path>`.

**Verified precedents (READ these — the scan mirrors the draft):**
- `apps/arc-runner/src/types.ts`: `ArcOpportunityDraftPayload = { type:"arc_opportunity_draft"; opportunityId; agentTaskId; message; operator }`; `WakePayload` union.
- `apps/arc-runner/src/server.ts` (~line 71): `if (payload.type === "arc_opportunity_draft") { void handleOpportunityDraft(client, config, payload as ArcOpportunityDraftPayload); return <202-ish>; }`.
- `apps/arc-runner/src/handler.ts`: `handleOpportunityDraft` (log → `runArcOpportunityDraft` → catch).
- `apps/arc-runner/src/arc.ts` (line 179): `runArcOpportunityDraft` → `runArcQuery({ step, mode:"draft", ctx, client, prompt: payload.message, model: modelForRoute("standard"), toolContext })`. `runArcQuery` derives tools from `toolsForMode(opts.mode)` + `allowedToolNames(opts.mode)`.
- `apps/arc-runner/src/tools/index.ts`: `ArcMode`, `readTools` (local), `toolsForMode`, `allowedToolNames`.
- `src/lib/arc-chat/notify.ts` (~line 77): `notifyOpportunityDraft(payload) → postArcWake({ type:"arc_opportunity_draft", ...payload })`.
- `src/lib/opportunities/enqueue.ts`: the draft enqueue — inserts `agent_tasks` (`task_type:"arc_opportunity_draft"`, `source_type:"opportunity"`, tenant fields) then notifies.
- `src/lib/opportunities/persistence.ts`: `upsertOpportunities(candidates: OpportunityCandidate[], client?)` (dedup, `status:"pending"`, `detected_by:"arc"`).
- `src/domain/opportunity-detection.ts`: `OpportunityCandidate` (currently narrow); re-exported via `src/domain/index.ts`.
- `src/app/api/v1/arc/_lib/http.ts`: `guard`, `ok`, `fail`, `readJson`, `INVALID_JSON`.
- `src/app/opportunities/{actions.ts,page.tsx}`: the existing deterministic scan button (`OperatorBar`/`ActionFeedback` pattern) to mirror.

---

## Task 1: Domain — widen `OpportunityCandidate` + `parseOpportunityProposal`

**Files:** `src/domain/opportunity-detection.ts` (modify), `src/domain/opportunity-proposal.ts` (create), `src/domain/index.ts` (export), `src/domain/__tests__/opportunity-proposal.test.ts` (create)

- [ ] **Step 1: Widen `OpportunityCandidate`** (`opportunity-detection.ts`)

Change the type so Arc can propose any kind/subject (the cold-lead detector's literals still satisfy the wider types):
```typescript
export type OpportunityCandidate = {
  kind: string;            // was "crm_inactivity"
  subjectType: string;     // was "lead"
  subjectId: string;
  title: string;
  summary: string;
  confidence: number; // 0–100
  urgency: "low" | "medium" | "high";
  evidence: Record<string, unknown>;  // was the cold-lead-specific object
  recommendedAction: string;
  recommendedCampaignType: string;
};
```
(The `detectColdLeadOpportunities` return value is unchanged and still type-checks: `"crm_inactivity"`/`"lead"` are `string`, and its evidence object satisfies `Record<string, unknown>`.)

- [ ] **Step 2: Write the failing test** (`src/domain/__tests__/opportunity-proposal.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import { parseOpportunityProposal } from "@/domain";

describe("parseOpportunityProposal", () => {
  it("accepts a valid proposal (snake_case from the tool)", () => {
    const r = parseOpportunityProposal({
      kind: "reengagement", subject_type: "company", subject_id: "co_1",
      title: "Re-engage Acme", summary: "Quiet 90 days, prior flood job.",
      confidence: 77, urgency: "high", evidence: { lastJob: "2026-03" },
      recommended_action: "Send a check-in", recommended_campaign_type: "email",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.candidate).toMatchObject({ kind: "reengagement", subjectType: "company", subjectId: "co_1", confidence: 77, urgency: "high", evidence: { lastJob: "2026-03" } });
  });
  it("rejects when required fields are missing", () => {
    const r = parseOpportunityProposal({ kind: "x", subject_type: "company" });
    expect(r.ok).toBe(false);
  });
  it("clamps confidence and defaults urgency", () => {
    const r = parseOpportunityProposal({ kind: "k", subject_type: "persona", subject_id: "p1", title: "t", summary: "s", confidence: 250 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.candidate.confidence).toBe(100); expect(r.candidate.urgency).toBe("medium"); expect(r.candidate.evidence).toEqual({}); }
  });
});
```

- [ ] **Step 3: Run → FAIL** (`pnpm test src/domain/__tests__/opportunity-proposal.test.ts`).

- [ ] **Step 4: Implement** `src/domain/opportunity-proposal.ts`

```typescript
import { type OpportunityCandidate } from "./opportunity-detection";

export type ProposalParseResult =
  | { ok: true; candidate: OpportunityCandidate }
  | { ok: false; error: string };

const URGENCIES = new Set(["low", "medium", "high"]);
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

/** Validate an Arc opportunity proposal (snake_case tool args) into an OpportunityCandidate. Pure. */
export function parseOpportunityProposal(raw: unknown): ProposalParseResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = str(r.kind);
  const subjectType = str(r.subject_type ?? r.subjectType);
  const subjectId = str(r.subject_id ?? r.subjectId);
  const title = str(r.title);
  const summary = str(r.summary);
  if (!kind || !subjectType || !subjectId || !title || !summary) {
    return { ok: false, error: "kind, subject_type, subject_id, title, and summary are required." };
  }
  const confNum = Number(r.confidence);
  const confidence = Number.isFinite(confNum) ? Math.min(100, Math.max(0, Math.round(confNum))) : 60;
  const u = str(r.urgency).toLowerCase();
  const urgency = (URGENCIES.has(u) ? u : "medium") as OpportunityCandidate["urgency"];
  const evidence = (r.evidence && typeof r.evidence === "object" ? r.evidence : {}) as Record<string, unknown>;
  return {
    ok: true,
    candidate: {
      kind, subjectType, subjectId, title, summary, confidence, urgency, evidence,
      recommendedAction: str(r.recommended_action ?? r.recommendedAction),
      recommendedCampaignType: str(r.recommended_campaign_type ?? r.recommendedCampaignType),
    },
  };
}
```

- [ ] **Step 5: Export** — add to `src/domain/index.ts`: `export * from "./opportunity-proposal";`
- [ ] **Step 6: Run → PASS** (and confirm `detectColdLeadOpportunities` tests still pass: `pnpm test src/domain/__tests__/opportunity-detection.test.ts` if it exists).
- [ ] **Step 7: Commit** — `git add src/domain && git commit -m "feat(opportunities): widen OpportunityCandidate + parseOpportunityProposal"`

---

## Task 2: App route — `POST /api/v1/arc/opportunities/propose`

**Files:** Create `src/app/api/v1/arc/opportunities/propose/route.ts` + `route.test.ts`

- [ ] **Step 1: Write the failing test** (mirror `opportunities/route.test.ts` style; mock `upsertOpportunities`)

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/opportunities/persistence", () => ({ upsertOpportunities: vi.fn() }));
import { upsertOpportunities } from "@/lib/opportunities/persistence";
import { POST } from "./route";

const mock = vi.mocked(upsertOpportunities);
function req(auth: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/opportunities/propose", {
    method: "POST", headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const valid = { kind: "reengagement", subject_type: "company", subject_id: "co_1", title: "t", summary: "s" };
const env = { ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
function configure() { process.env.ARC_AGENT_API_TOKEN = "secret"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; }
beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ ok: true, count: 1 } as never); });
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("POST /api/v1/arc/opportunities/propose", () => {
  it("401s without a valid token and never persists", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    expect((await POST(req("Bearer wrong", valid))).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("persists a valid proposal and returns created count", async () => {
    configure();
    const res = await POST(req("Bearer secret", valid));
    expect(await res.json()).toMatchObject({ ok: true, created: 1 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("returns created:0 when deduped", async () => {
    configure(); mock.mockResolvedValue({ ok: true, count: 0 } as never);
    expect(await (await POST(req("Bearer secret", valid))).json()).toMatchObject({ created: 0 });
  });
  it("400s on an invalid proposal (no persist)", async () => {
    configure();
    expect((await POST(req("Bearer secret", { kind: "x" }))).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it("502s when persistence fails", async () => {
    configure(); mock.mockResolvedValue({ ok: false, error: "boom" } as never);
    expect((await POST(req("Bearer secret", valid))).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write the route** (`propose/route.ts`)

```typescript
import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseOpportunityProposal } from "@/domain";
import { upsertOpportunities } from "@/lib/opportunities/persistence";

/**
 * Arc proposes a source-backed opportunity (status pending — operator-gated).
 * Reuses upsertOpportunities (dedup + pending + detected_by=arc).
 *   POST /api/v1/arc/opportunities/propose  ->  { ok, created }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await readJson(request);
  if (body === INVALID_JSON) return fail("invalid_json", "Body must be valid JSON.", 400);
  const parsed = parseOpportunityProposal(body);
  if (!parsed.ok) return fail("invalid", parsed.error, 400);
  try {
    const result = await upsertOpportunities([parsed.candidate]);
    if (!result.ok) return fail("failed", result.error, 502);
    return ok({ created: result.count });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to save opportunity.", 502);
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/opportunities/propose && git commit -m "feat(arc): POST /opportunities/propose — Arc writes pending opportunities"`

---

## Task 3: App — enqueue + notify + action + button

**Files:** `src/lib/arc-chat/notify.ts`, `src/lib/opportunities/enqueue.ts`, `src/app/opportunities/actions.ts`, `src/app/opportunities/page.tsx` (modify). Read each precedent in the file before editing.

- [ ] **Step 1: `notifyOpportunityScan`** (`src/lib/arc-chat/notify.ts`)

Mirror `notifyOpportunityDraft` (~line 77). Add:
```typescript
export function notifyOpportunityScan(payload: { agentTaskId: string; message: string; operator: string }) {
  return postArcWake({ type: "arc_opportunity_scan", ...payload });
}
```
(Match the exact param/return style of `notifyOpportunityDraft` in this file — it may take a typed object and/or return a Promise; copy that shape, dropping `opportunityId`.)

- [ ] **Step 2: `enqueueOpportunityScanTask`** (`src/lib/opportunities/enqueue.ts`)

Read the existing opportunity-draft enqueue in this file and mirror it. Add a scan briefing constant + the enqueue:
```typescript
export const OPPORTUNITY_SCAN_BRIEFING =
  "Survey the current CRM, personas, brand knowledge, recent activity, and the existing opportunity inbox. " +
  "Propose source-backed opportunities the deterministic detectors miss — dormant companies worth re-engaging, " +
  "persona-segment gaps, competitor signals, or newly-approved media that suggests a campaign. For each, call " +
  "propose_opportunity with concrete evidence/source refs and a stable subject id. Everything stays pending for " +
  "human approval — do NOT draft campaigns, contact anyone, or take any outbound action.";

export async function enqueueOpportunityScanTask(input: { operator: string }): Promise<{ ok: boolean; error?: string }> {
  // ... mirror the draft enqueue: tenant fields via getCurrentAgentTaskTenantFields(),
  // insert into agent_tasks with task_type:"arc_opportunity_scan", source_type:"operator_scan",
  // objective: OPPORTUNITY_SCAN_BRIEFING, metadata:{ requested_by: input.operator, source:"opportunity_inbox", outbound_locked:true },
  // capture the inserted id, then:
  //   await notifyOpportunityScan({ agentTaskId, message: OPPORTUNITY_SCAN_BRIEFING, operator: input.operator });
  // Return {ok:true} (or {ok:false,error} mirroring the draft enqueue's error handling / not_configured guard).
}
```
Import `notifyOpportunityScan` from `@/lib/arc-chat/notify`. Match the draft enqueue's Supabase-config guard, tenant-field call, and error handling EXACTLY (only the deltas above differ: no `opportunityId`/`source_id`, scan briefing, scan notify).

- [ ] **Step 3: Server action** (`src/app/opportunities/actions.ts`)

Add (mirror the file's existing deterministic-scan action + the `requireOperator` gate):
```typescript
export async function requestArcOpportunityScanAction(): Promise<void> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;
  const operator = /* the file's existing operator-actor accessor, e.g. getOperatorActor() */;
  await enqueueOpportunityScanTask({ operator });
  revalidatePath("/opportunities");
}
```
Use the same imports the file already has (`requireOperator`, `isSupabaseAdminConfigured`, `revalidatePath`, the operator accessor). Import `enqueueOpportunityScanTask` from `@/lib/opportunities/enqueue`.

- [ ] **Step 4: Button** (`src/app/opportunities/page.tsx`)

Next to the existing deterministic scan `<form action={...}>` button, add a second form wired to `requestArcOpportunityScanAction`, labelled "Ask Arc to find opportunities", plus an `ActionFeedback`-style note ("Arc is scanning — new opportunities appear here for approval."). Mirror the existing button's markup/primitives exactly.

- [ ] **Step 5: Tests** — add/extend tests where the file has them:
- `notify.test.ts`: `notifyOpportunityScan` POSTs `type:"arc_opportunity_scan"` (mirror the draft notify test).
- If `enqueue` has a test, assert the `agent_tasks` insert uses `task_type:"arc_opportunity_scan"` + calls notify (mock Supabase + notify).
Run the touched tests → pass.

- [ ] **Step 6: Commit** — `git add src/lib/arc-chat/notify.ts src/lib/opportunities/enqueue.ts src/app/opportunities && git commit -m "feat(opportunities): operator-triggered Arc opportunity scan (enqueue + button)"`

---

## Task 4: Runner — `propose_opportunity` tool + `scan` mode

**Files:** `apps/arc-runner/src/tools/opportunities.ts` (create), `apps/arc-runner/src/tools/index.ts` (modify), `apps/arc-runner/src/tools/opportunities.test.ts` (create), `apps/arc-runner/src/tools/index.test.ts` (modify)

- [ ] **Step 1: Write the tool test** (`tools/opportunities.test.ts`, match the handler-invocation style of `tools/intelligence.test.ts`)

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { proposeOpportunityTool } from "./opportunities";

const noStep = async () => {};
describe("proposeOpportunityTool", () => {
  it("posts the proposal to the propose route", async () => {
    const client = { apiPost: vi.fn(async () => ({ ok: true, created: 1 })) } as unknown as ArcClient;
    const t = proposeOpportunityTool(client, noStep);
    await /* invoke t.handler with { kind:"reengagement", subject_type:"company", subject_id:"co_1", title:"t", summary:"s" } per the file's pattern */;
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/opportunities/propose", expect.objectContaining({ subject_id: "co_1" }));
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write `tools/opportunities.ts`**

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Write tool (approval-safe): propose a source-backed opportunity into the inbox.
 * Everything lands status=pending; the operator approves before anything happens.
 * Only available in the opportunity-scan tool set.
 */
export function proposeOpportunityTool(client: ArcClient, step: StepFn) {
  return tool(
    "propose_opportunity",
    "Propose a source-backed opportunity into the inbox (status pending — the operator approves it before anything happens). Use during an opportunity scan after reviewing CRM / personas / brand / activity. Give concrete evidence/source refs and a STABLE subject id (CRM id, persona key, competitor id) so duplicates of an existing open opportunity are skipped.",
    {
      kind: z.string().describe("e.g. reengagement, persona_gap, competitor_signal, new_lead"),
      subject_type: z.string().describe("company | contact | lead | persona | competitor | segment"),
      subject_id: z.string().describe("Stable id for the subject — used for dedup"),
      title: z.string(),
      summary: z.string().describe("Why this is an opportunity now"),
      confidence: z.number().min(0).max(100).optional(),
      urgency: z.enum(["low", "medium", "high"]).optional(),
      evidence: z.record(z.unknown()).optional().describe("Source links / refs / signals backing it"),
      recommended_action: z.string().optional(),
      recommended_campaign_type: z.string().optional(),
    },
    async (args) => runTool(step, "Proposing opportunity", () => client.apiPost("/api/v1/arc/opportunities/propose", args)),
  );
}
```

- [ ] **Step 4: Add `"scan"` mode** (`tools/index.ts`)

- `export type ArcMode = "ask" | "act" | "draft" | "scan";`
- Import: `import { proposeOpportunityTool } from "./opportunities";`
- In `toolsForMode`, after the `ask` branch, before building `write`:
```typescript
  if (mode === "scan") return [...read, proposeOpportunityTool(client, step)];
```
`allowedToolNames("scan")` derives from `toolsForMode("scan", ...)` automatically — no change. Confirm no other code switches exhaustively on `ArcMode` without a default (the build in Task 6 will catch it; if `buildSystemPrompt`/anything narrows on mode, the scan turn sets `ctx.mode="draft"` (Task 5) so prompt-side code never sees `"scan"`).

- [ ] **Step 5: Update `index.test.ts`** — add a case asserting `toolsForMode("scan", …)`/`allowedToolNames("scan")` includes `propose_opportunity` and the read tools, and EXCLUDES the draft/act write tools (e.g. `create_campaign_draft`, `generate_image`). Mirror the file's existing mode assertions.

- [ ] **Step 6: Run** `pnpm --filter @bsr/arc-runner exec vitest run src/tools/opportunities.test.ts src/tools/index.test.ts` → PASS; `pnpm --filter @bsr/arc-runner typecheck` → clean.
- [ ] **Step 7: Commit** — `git add apps/arc-runner/src/tools/opportunities.ts apps/arc-runner/src/tools/opportunities.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts && git commit -m "feat(arc): propose_opportunity tool + scan tool set"`

---

## Task 5: Runner — `arc_opportunity_scan` wake

**Files:** `apps/arc-runner/src/types.ts`, `apps/arc-runner/src/arc.ts`, `apps/arc-runner/src/handler.ts`, `apps/arc-runner/src/server.ts` (modify). Mirror the `arc_opportunity_draft` path in each.

- [ ] **Step 1: Payload type** (`types.ts`)

```typescript
export type ArcOpportunityScanPayload = {
  type: "arc_opportunity_scan";
  agentTaskId: string;
  message: string;
  operator: string;
};
```
Add `| ArcOpportunityScanPayload` to the `WakePayload` union.

- [ ] **Step 2: `runArcOpportunityScan`** (`arc.ts`) — mirror `runArcOpportunityDraft`, but `mode:"scan"`:

```typescript
/**
 * Run an Arc turn for an `arc_opportunity_scan` wake: scan tool set (read tools +
 * propose_opportunity only), the scan briefing used verbatim as the prompt. Arc
 * proposes pending opportunities; nothing drafts or goes outbound.
 */
export async function runArcOpportunityScan(
  payload: ArcOpportunityScanPayload,
  client: ArcClient,
): Promise<ArcTurnResult> {
  const step = (label: string, status: "running" | "done") => client.postStep(payload.agentTaskId, label, status);
  const business = await resolveBusinessContext(client);
  const memory = await resolveRecallMemory(client, payload.message);
  const ctx: ArcTurnContext = {
    business,
    mode: "draft", // prompt framing only; the scan tool set comes from mode:"scan" below
    scope: { conversationId: payload.agentTaskId, projectId: null, campaignId: null, operator: payload.operator },
    mentions: [],
    memory,
  };
  return runArcQuery({ step, mode: "scan", ctx, client, prompt: payload.message, model: modelForRoute("standard") });
}
```
Import `ArcOpportunityScanPayload` from `./types`.

- [ ] **Step 3: `handleOpportunityScan`** (`handler.ts`) — mirror `handleOpportunityDraft`:

```typescript
export async function handleOpportunityScan(
  client: ArcClient,
  _config: Config,
  payload: ArcOpportunityScanPayload,
): Promise<void> {
  console.log(`[arc-runner] opportunity-scan wake received → scanning (task ${payload.agentTaskId})`);
  const started = Date.now();
  try {
    const result = await runArcOpportunityScan(payload, client);
    console.log(`[arc-runner] opportunity scan finished in ${Date.now() - started}ms (${result.actions.length} card(s))`);
  } catch (error) {
    console.error(`[arc-runner] opportunity-scan run failed (task ${payload.agentTaskId}):`, error);
  }
}
```
Update the imports at the top of `handler.ts`: `import { runArcOpportunityDraft, runArcOpportunityScan, runArcTurn } from "./arc";` and add `ArcOpportunityScanPayload` to the `./types` import.

- [ ] **Step 4: Dispatch** (`server.ts`) — after the `arc_opportunity_draft` block, mirror it:

```typescript
      if (payload.type === "arc_opportunity_scan") {
        void handleOpportunityScan(client, config, payload as ArcOpportunityScanPayload);
        // ...same ack response the draft branch returns...
      }
```
Update `server.ts` imports: add `handleOpportunityScan` from `./handler` and `ArcOpportunityScanPayload` from `./types`. Copy the draft branch's exact ack (status code + body).

- [ ] **Step 5: Run** `pnpm --filter @bsr/arc-runner typecheck` → clean; `pnpm --filter @bsr/arc-runner test` → all pass (update any wake-dispatch test that enumerates payload types to include the scan).
- [ ] **Step 6: Commit** — `git add apps/arc-runner/src/types.ts apps/arc-runner/src/arc.ts apps/arc-runner/src/handler.ts apps/arc-runner/src/server.ts && git commit -m "feat(arc): arc_opportunity_scan wake -> runArcOpportunityScan"`

---

## Task 6: Sweep + build

- [ ] **Step 1:** `pnpm test src/domain/__tests__/opportunity-proposal.test.ts src/app/api/v1/arc/opportunities/propose` + the touched notify/enqueue tests → pass.
- [ ] **Step 2:** `pnpm --filter @bsr/arc-runner test` → pass.
- [ ] **Step 3:** `pnpm build` → succeeds (`pnpm install` first if needed). Fix only feature-caused failures (watch for `ArcMode` exhaustiveness).
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "test(arc): opportunity-scan verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** write path (propose route + `upsertOpportunities` reuse + dedup) → Tasks 1–2; trigger (enqueue + notify + action + button) → Task 3; generation (propose_opportunity tool + narrow `scan` tool set) → Task 4; wake (payload + run + handler + dispatch) → Task 5; sweep → Task 6. All spec sections covered.
- **Placeholder scan:** the only intentional fill-ins are in Task 3 (`enqueueOpportunityScanTask` body + the action's operator accessor) and the Task 4 tool-test handler invocation — each is an explicit "mirror this named precedent in the same file" instruction with the exact deltas spelled out, because those precedents (tenant-field call, operator accessor, handler-call style) are file-local idioms the implementer must match rather than guess. All leaf/new code (domain, route, tool, dispatch) is exact.
- **Type consistency:** widened `OpportunityCandidate` (kind/subjectType: string, evidence: Record) flows: `parseOpportunityProposal` → candidate → `upsertOpportunities([candidate])`. `"scan"` added to `ArcMode`; `runArcQuery` consumes `mode` for both `toolsForMode` + `allowedToolNames`. Wake discriminator `"arc_opportunity_scan"` consistent across types/notify/enqueue/server. `propose_opportunity` arg names (snake_case) match `parseOpportunityProposal`'s reads.
- **Safety:** every proposal `status:"pending"` (approval-gated); scan tool set = read + one approval-safe write (no act/draft/outbound); dedup prevents flooding; bearer-gated route; tenant-stamped enqueue; no schema change.
