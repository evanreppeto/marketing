# Opportunity Inbox — Plan 2: Arc-authored drafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From an opportunity in the inbox, one click ("Draft with Arc") enqueues an Arc task + wakes the runner; Arc authors an approval-gated campaign draft **linked to the opportunity**, which then moves to `drafted` and appears in `/campaigns`. Also wire per-row Dismiss/Snooze and the `/arc` opportunity count chip.

**Architecture:** App server action → `enqueueArcOpportunityTask` (agent_tasks) + `markOpportunityDrafting` + a new `arc_opportunity_draft` webhook wake. Runner dispatches the wake to `handleOpportunityDraft` → `runArcOpportunityDraft` (a chat-less Arc turn in draft mode whose "message" is an opportunity briefing; the `create_campaign_draft` tool is bound to carry `opportunity_id`). The `draft-asset` endpoint, when given `opportunity_id`, links the campaign and flips the opportunity to `drafted`.

**Tech Stack:** Next.js server actions + Supabase (app); Node http webhook + Claude Agent SDK (runner); Vitest.

Spec: `docs/superpowers/specs/2026-06-17-opportunity-inbox-design.md`. Builds on Plan 1 (merged/landed): `opportunities` table, detection, inbox page, `markOpportunityDrafting/Drafted`, `countPendingOpportunities`.

---

## File Structure
- Modify `src/app/api/v1/arc/campaigns/draft-asset/route.ts` (+ test) — accept `opportunity_id`, link on success.
- Create `src/domain/opportunity-briefing.ts` (+ test) — pure briefing-text builder.
- Modify `src/lib/opportunities/read-model.ts` — `getOpportunityForDraft(id)`.
- Create `src/lib/opportunities/enqueue.ts` — `enqueueArcOpportunityTask`.
- Modify `src/lib/arc-chat/notify.ts` — `notifyArcOpportunityDraft` (reusing connection/secret resolution).
- Modify `src/app/opportunities/actions.ts` — `draftOpportunityWithArcAction`.
- Modify `src/app/_components/opportunity-command-center.tsx` — optional per-row `actions`.
- Modify `src/app/opportunities/page.tsx` — render Draft/Dismiss/Snooze per row.
- Runner: `apps/arc-runner/src/types.ts`, `server.ts`, `handler.ts`, `arc.ts`, `tools/index.ts`, `tools/drafts.ts`.
- Modify `src/app/arc/page.tsx` + the chip consumer — surface `countPendingOpportunities`.

---

## Task 1: `draft-asset` endpoint links the opportunity

**Files:** Modify `src/app/api/v1/arc/campaigns/draft-asset/route.ts`, `src/app/api/v1/arc/campaigns/draft-asset/route.test.ts`.

- [ ] **Step 1:** In `route.ts`, read `opportunity_id` from the body (alongside the existing `str(...)` fields):
```ts
  const opportunityId = str(body.opportunity_id) || null;
```
- [ ] **Step 2:** After the asset is created (`const asset = await promoteAssetToCampaign({...})`), before the `NextResponse.json`, add (import `markOpportunityDrafted` from `@/lib/opportunities/persistence`):
```ts
    if (opportunityId) {
      // Link the source opportunity to the campaign and flip it to drafted.
      await markOpportunityDrafted(opportunityId, campaignId);
    }
```
- [ ] **Step 3:** Add a test to `route.test.ts` (mock `@/lib/opportunities/persistence` `markOpportunityDrafted`) asserting that when `opportunity_id` is in the body, `markOpportunityDrafted` is called with `(opportunity_id, campaignId)`; and when absent, it is NOT called.
```ts
// add to the existing vi.mock list at top:
vi.mock("@/lib/opportunities/persistence", () => ({ markOpportunityDrafted: vi.fn(async () => ({ ok: true })) }));
import { markOpportunityDrafted } from "@/lib/opportunities/persistence";
// ...inside describe:
  it("links the opportunity when opportunity_id is provided", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Re-engage", opportunity_id: "opp-1" }));
    expect(markOpportunityDrafted).toHaveBeenCalledWith("opp-1", "camp_existing");
  });
```
- [ ] **Step 4:** `pnpm test src/app/api/v1/arc/campaigns/draft-asset` → PASS; `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 5:** Commit — `git add src/app/api/v1/arc/campaigns/draft-asset && git commit -m "feat(arc-api): draft-asset links source opportunity when opportunity_id given"`

---

## Task 2: Pure opportunity briefing + read helper

**Files:** Create `src/domain/opportunity-briefing.ts` (+ `src/domain/__tests__/opportunity-briefing.test.ts`); modify `src/domain/index.ts`, `src/lib/opportunities/read-model.ts`.

- [ ] **Step 1: Failing test** `src/domain/__tests__/opportunity-briefing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildOpportunityBriefing, type OpportunityBriefingInput } from "../opportunity-briefing";

const input: OpportunityBriefingInput = {
  title: "Dana K. — quiet 47 days",
  summary: "Open lead (score 70) with no live campaign, no activity in 47 days.",
  urgency: "high",
  confidence: 77,
  recommendedAction: "Re-engage with a persona-tailored campaign",
  persona: "persona_homeowner_emergency",
  leadHref: "/crm/leads/lead-1",
};

describe("buildOpportunityBriefing", () => {
  it("produces a draft-mode instruction mentioning the persona, evidence, and a package ask", () => {
    const out = buildOpportunityBriefing(input);
    expect(out).toContain("persona_homeowner_emergency");
    expect(out).toContain("47 days");
    expect(out).toMatch(/draft/i);
    expect(out).toMatch(/approval/i);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `src/domain/opportunity-briefing.ts`:
```ts
/**
 * Pure builder for the "message" handed to Arc when drafting from an opportunity.
 * There is no chat history on an opportunity-draft turn — this briefing IS the
 * prompt. No I/O.
 */
export type OpportunityBriefingInput = {
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  recommendedAction: string;
  persona: string;
  leadHref: string;
};

export function buildOpportunityBriefing(input: OpportunityBriefingInput): string {
  return [
    `Proactive opportunity to act on (you found this — now draft an approval-gated campaign package for it).`,
    `Opportunity: ${input.title}`,
    `Context: ${input.summary}`,
    `Urgency: ${input.urgency} · confidence ${input.confidence}%`,
    `Target persona: ${input.persona}`,
    `Source record: ${input.leadHref}`,
    `Recommended action: ${input.recommendedAction}`,
    ``,
    `Draft a re-engagement package now: create one or more approval-gated draft assets (e.g. an email and an SMS) tailored to this persona with a clear angle, hook, proof, and CTA. Cite the source record. Nothing goes outbound — everything awaits the operator's approval.`,
  ].join("\n");
}
```
- [ ] **Step 4:** Run → PASS. Add `export * from "./opportunity-briefing";` to `src/domain/index.ts`.
- [ ] **Step 5: Read helper.** In `src/lib/opportunities/read-model.ts` add (the action needs full opportunity fields to build the briefing + wake):
```ts
export type OpportunityForDraft = {
  id: string;
  subjectId: string;
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  recommendedAction: string;
  persona: string;
};

/** Load one opportunity (+ its persona from evidence) for the Draft-with-Arc flow. */
export async function getOpportunityForDraft(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<OpportunityForDraft | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const orgId = await getCurrentOrgId();
  const { data, error } = await client
    .from("opportunities")
    .select("id, subject_id, title, summary, urgency, confidence, recommended_action, evidence")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const evidence = (data.evidence ?? {}) as { persona?: string };
  return {
    id: data.id,
    subjectId: data.subject_id,
    title: data.title,
    summary: data.summary,
    urgency: data.urgency,
    confidence: data.confidence,
    recommendedAction: data.recommended_action,
    persona: typeof evidence.persona === "string" ? evidence.persona : "",
  };
}
```
- [ ] **Step 6:** `pnpm exec tsc --noEmit` → clean. Commit — `git add src/domain/opportunity-briefing.ts src/domain/__tests__/opportunity-briefing.test.ts src/domain/index.ts src/lib/opportunities/read-model.ts && git commit -m "feat(opportunities): pure briefing builder + getOpportunityForDraft"`

---

## Task 3: Enqueue + wake + Draft-with-Arc action

**Files:** Create `src/lib/opportunities/enqueue.ts`; modify `src/lib/arc-chat/notify.ts`, `src/app/opportunities/actions.ts`.

- [ ] **Step 1: Enqueue.** Create `src/lib/opportunities/enqueue.ts` modeled on `src/lib/arc-chat/enqueue.ts` (resolve the Arc agent by key via `markAgentKeys()` — import the same helper that `arc-chat/enqueue.ts` uses; READ that file and reuse its agent-resolution + import paths exactly):
```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { markAgentKeys } from "@/lib/arc-chat/connection"; // confirm the real export used by arc-chat/enqueue.ts
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type EnqueueOpportunityTaskInput = { opportunityId: string; objective: string; operator: string };

/** Insert a queued agent_task for an opportunity draft. Returns the task id. */
export async function enqueueArcOpportunityTask(
  input: EnqueueOpportunityTaskInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<string> {
  const { data: agent } = await client.from("agents").select("id").in("key", await markAgentKeys()).limit(1).maybeSingle<{ id: string }>();
  if (!agent) throw new Error("Arc agent not found");
  const { data: task, error } = await client
    .from("agent_tasks")
    .insert({
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: input.objective,
      task_type: "arc_opportunity_draft",
      source_type: "opportunity",
      source_id: input.opportunityId,
      metadata: { requested_by: input.operator, source: "opportunity_inbox", outbound_locked: true },
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !task) throw new Error(error?.message ?? "failed to enqueue opportunity task");
  return task.id;
}
```
> Plan-stage: open `src/lib/arc-chat/enqueue.ts` and match the EXACT import for the agent-key resolver (`markAgentKeys` or equivalent) and the `agents` lookup it uses; copy that import path verbatim.

- [ ] **Step 2: Wake.** In `src/lib/arc-chat/notify.ts`, refactor the connection-resolve + sign + POST into a shared internal helper if not already, then add an exported function:
```ts
export type ArcOpportunityDraftWake = {
  type: "arc_opportunity_draft";
  opportunityId: string;
  agentTaskId: string;
  message: string; // the briefing
  leadId: string;
  operator: string;
};

/** Best-effort wake for an opportunity draft (mirrors notifyArcWebhook's transport). */
export async function notifyArcOpportunityDraft(payload: Omit<ArcOpportunityDraftWake, "type">): Promise<boolean> {
  return postArcWake({ type: "arc_opportunity_draft", ...payload }); // postArcWake = the extracted resolve+sign+POST helper
}
```
> Plan-stage: READ `notify.ts` and extract its existing resolve-connection + HMAC-sign + fetch logic into a private `postArcWake(body)` used by BOTH `notifyArcWebhook` and `notifyArcOpportunityDraft`, so signing/timeout/secret handling stays identical. Don't duplicate the crypto.

- [ ] **Step 3: Action.** In `src/app/opportunities/actions.ts` add:
```ts
import { buildOpportunityBriefing } from "@/domain";
import { getOpportunityForDraft } from "@/lib/opportunities/read-model";
import { enqueueArcOpportunityTask } from "@/lib/opportunities/enqueue";
import { markOpportunityDrafting } from "@/lib/opportunities/persistence";
import { notifyArcOpportunityDraft } from "@/lib/arc-chat/notify";

export async function draftOpportunityWithArcAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const opp = await getOpportunityForDraft(id);
  if (!opp) redirect("/opportunities?action=draft-error");
  const briefing = buildOpportunityBriefing({
    title: opp.title,
    summary: opp.summary,
    urgency: opp.urgency,
    confidence: opp.confidence,
    recommendedAction: opp.recommendedAction,
    persona: opp.persona,
    leadHref: `/crm/leads/${opp.subjectId}`,
  });
  const taskId = await enqueueArcOpportunityTask({ opportunityId: id, objective: opp.title, operator: "Operator" });
  await markOpportunityDrafting(id, taskId);
  await notifyArcOpportunityDraft({ opportunityId: id, agentTaskId: taskId, message: briefing, leadId: opp.subjectId, operator: "Operator" });
  revalidatePath("/opportunities");
  redirect("/opportunities?action=drafting");
}
```
- [ ] **Step 4:** `pnpm exec tsc --noEmit` → clean; `pnpm exec eslint src/app/opportunities src/lib/opportunities src/lib/arc-chat/notify.ts` → clean.
- [ ] **Step 5:** Commit — `git add src/lib/opportunities/enqueue.ts src/lib/arc-chat/notify.ts src/app/opportunities/actions.ts && git commit -m "feat(opportunities): Draft-with-Arc action (enqueue + wake)"`

---

## Task 4: Runner — opportunity-draft wake handler

**Files:** Modify `apps/arc-runner/src/types.ts`, `server.ts`, `handler.ts`, `arc.ts`, `tools/index.ts`, `tools/drafts.ts`.

- [ ] **Step 1: Type.** In `apps/arc-runner/src/types.ts` add and extend the union:
```ts
export type ArcOpportunityDraftPayload = {
  type: "arc_opportunity_draft";
  opportunityId: string;
  agentTaskId: string;
  message: string;
  leadId: string;
  operator: string;
};
```
and update `WakePayload` to include `| ArcOpportunityDraftPayload`.

- [ ] **Step 2: Thread `opportunityId` into the draft tool.** In `apps/arc-runner/src/tools/index.ts`, give `toolsForMode` an optional context so draft tools can auto-link the opportunity:
```ts
export type ToolContext = { opportunityId?: string };
// signature: toolsForMode(mode, client, step, sink, ctx: ToolContext = {})
// pass ctx to draftTools → draftWorkProductTools(client, step, sink.card, ctx)
```
In `apps/arc-runner/src/tools/drafts.ts`, accept `ctx` and include `opportunity_id` in the `apiPost` body when set:
```ts
const r = await client.apiPost<{ campaignId: string; assetId: string }>(
  "/api/v1/arc/campaigns/draft-asset",
  { ...args, ...(ctx.opportunityId ? { opportunity_id: ctx.opportunityId } : {}) },
);
```
Update `allowedToolNames` / callers as needed (ctx defaults to `{}` so existing chat calls are unaffected). Update `apps/arc-runner/src/tools/index.test.ts` if the signature change affects it.

- [ ] **Step 3: Turn.** In `apps/arc-runner/src/arc.ts` add `runArcOpportunityDraft(payload, client)` — same shape as `runArcTurn` but: builds the ctx/system for **draft** mode, uses `payload.message` as the prompt (no history), and calls `toolsForMode("draft", client, step, sink, { opportunityId: payload.opportunityId })`. Reuse the existing query loop + sink. Return the same `ArcTurnResult`.

- [ ] **Step 4: Handler.** In `apps/arc-runner/src/handler.ts` add `handleOpportunityDraft(client, config, payload)`: call `runArcOpportunityDraft`; on success, best-effort complete the agent task (`await client.apiPost('/api/v1/arc/tasks/complete', { taskId: payload.agentTaskId }).catch(()=>{})` — confirm the real task-complete route in `src/app/api/v1/arc/`; if none exists, add a thin bearer-gated route that calls `completeAgentTask` from `@/lib/arc-api/tasks`). Log running→done steps are optional here (no chat bubble).

- [ ] **Step 5: Dispatch.** In `apps/arc-runner/src/server.ts`, after the `arc_chat_message` branch add:
```ts
  if (payload.type === "arc_opportunity_draft") {
    sendJson(res, 200, { ok: true, status: "accepted" });
    void handleOpportunityDraft(client, config, payload as ArcOpportunityDraftPayload);
    return;
  }
```
- [ ] **Step 6:** `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test` → PASS. Commit — `git add apps/arc-runner/src && git commit -m "feat(arc-runner): arc_opportunity_draft wake → Arc-authored draft linked to opportunity"`

---

## Task 5: Per-row inbox actions + /arc chip

**Files:** Modify `src/app/_components/opportunity-command-center.tsx`, `src/app/opportunities/page.tsx`, `src/app/opportunities/read-model.ts` usage, `src/app/arc/page.tsx` (+ chip consumer).

- [ ] **Step 1: Per-row actions slot.** In `opportunity-command-center.tsx`, add `actions?: React.ReactNode` to `OpportunityRow`, and render it inside each row (the row is a `<Link>` — render the actions in a sibling container OUTSIDE the Link, or convert the row to a wrapping `<div>` with the title as the link, so action buttons aren't nested in an anchor). Quote the current row JSX (lines ~146–172) and restructure minimally so buttons are clickable without triggering navigation.

- [ ] **Step 2: Wire actions in the page.** In `src/app/opportunities/page.tsx`, when mapping records→rows (this currently happens in `buildOpportunityBuckets`), attach per-row `actions` with three `<form>`s posting to `draftOpportunityWithArcAction`, `dismissOpportunityAction`, `snoozeOpportunityAction` (hidden `id` input = opportunity id). Because `buildOpportunityBuckets` is pure/server and can't hold JSX cleanly, build the rows in the page (or pass an `actionsFor(id)` render prop). Simplest: move bucket-building into the page or add an overload that accepts an `actionsFor: (id: string) => ReactNode`.

- [ ] **Step 3: /arc chip.** In `src/app/arc/page.tsx`, add `countPendingOpportunities().catch(() => 0)` to the `Promise.all` and pass it through to the chip area near `pendingApprovals` (follow how `pendingApprovals` is threaded to `ArcChat`/the nav). Render a small "N opportunities" chip linking to `/opportunities`.

- [ ] **Step 4:** `pnpm exec tsc --noEmit` + `pnpm exec eslint` on touched files → clean. Manual: the inbox rows show Draft/Dismiss/Snooze; `/arc` shows the count.
- [ ] **Step 5:** Commit — `git add -A && git commit -m "feat(opportunities): per-row Draft/Dismiss/Snooze + /arc opportunity chip"`

---

## Task 6: Manual acceptance (end-to-end)

- [ ] With the migration applied, Supabase + runner running, and at least one cold-lead opportunity in the inbox:
- [ ] Click **Draft with Arc** → opportunity flips to `drafting`; the runner logs a wake; shortly after, a campaign appears in `/campaigns` as a pending-approval draft, and the opportunity shows `drafted` linked to it.
- [ ] Approve the campaign in `/campaigns` → normal approval flow; nothing went outbound at any point.
- [ ] Dismiss / Snooze a different opportunity → leaves the active inbox.
- [ ] `/arc` shows the pending-opportunity count chip; clicking it opens `/opportunities`.

---

## Self-review notes
- **Spec coverage:** Draft-with-Arc (T1 endpoint link + T3 action + T4 runner), per-row actions + chip (T5), briefing context (T2). Matches the spec's "Opportunity → Arc-authored draft" flow + acceptance criteria 3–4.
- **Type/name consistency:** `opportunity_id` (endpoint) ↔ `ctx.opportunityId` (runner tool) ↔ `ArcOpportunityDraftPayload` (wake) ↔ `enqueueArcOpportunityTask`/`markOpportunityDrafting`/`markOpportunityDrafted`. Briefing input matches `getOpportunityForDraft` output.
- **Reuse:** `notifyArcWebhook` transport (extracted helper), `enqueueArcChatTask` pattern, `create_campaign_draft` tool + draft-asset endpoint, `markOpportunityDrafting/Drafted` (from Plan 1).
- **Safety:** action is `requireOperator()`-gated; draft is approval-gated/`dispatch_locked`; no outbound; org-scoped reads/writes.
- **Build-time confirms (flagged inline):** exact `markAgentKeys`/agent-resolver import from `arc-chat/enqueue.ts`; the `notify.ts` transport extraction; whether a task-complete API route exists (add a thin one if not); the `OpportunityCommandCenter` row restructure so action buttons aren't nested in the `<Link>`.
```
