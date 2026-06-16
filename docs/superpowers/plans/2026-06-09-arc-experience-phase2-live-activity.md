# Arc Experience — Phase 2 (Live Step-by-Step Activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** While a Arc reply is pending, show a live checklist of what Arc is actually doing (steps fill in as he works), resolving into his final answer.

**Architecture:** Steps live on the pending message's existing `metadata.steps` jsonb (no new table). A new `POST /api/v1/arc/messages/{agentTaskId}/steps` lets Arc's worker append/advance steps; the existing thread polling renders them as a timeline. Additive to the live chat system.

**Tech Stack:** Next.js 16 + TS + Supabase + vitest.

> **⚠️ BUILD-COORDINATION:** the chat backend (`src/lib/arc-chat/**`, `src/app/api/v1/arc/messages/**`, `src/app/arc/_components/**`) is under active parallel development (webhook claim, "fast" route). Re-read each file immediately before editing; keep changes additive; small commits. Backend tasks (1–3) are low-collision; UI tasks (4–5) are the hot ones — coordinate.

---

## File map
- Modify `src/lib/arc-chat/persistence.ts` — `MarkStep` type, `steps` on `MarkMessage`, parse in `toMessage`, `appendMarkStep()`.
- Create `src/lib/arc-chat/steps.test.ts` — step-merge unit tests.
- Create `src/app/api/v1/arc/messages/[agentTaskId]/steps/route.ts` — append-step endpoint.
- Modify `src/app/arc/_components/message-list.tsx` — ActivityTimeline for pending steps + collapsed trace on complete.
- Modify `src/app/arc/_components/arc-chat.tsx` — `sameMessages` must compare steps so the poll updates the timeline.
- Deliverable: update Arc's `arc-chat-responder` skill to emit steps.

---

## Task 1: MarkStep type + parse steps in toMessage

**File:** `src/lib/arc-chat/persistence.ts` (re-read first)

- [ ] **Step 1:** Add the type and field:

```typescript
export type MarkStep = { label: string; status: "running" | "done"; at: string };
```
Add `steps: MarkStep[];` to `MarkMessage` (after `media`).

- [ ] **Step 2:** Add a parser and use it in `toMessage`:

```typescript
function parseSteps(value: unknown): MarkStep[] {
  if (!Array.isArray(value)) return [];
  const out: MarkStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    if (typeof label !== "string" || !label.trim()) continue;
    const status = (item as { status?: unknown }).status === "done" ? "done" : "running";
    const at = typeof (item as { at?: unknown }).at === "string" ? (item as { at: string }).at : "";
    out.push({ label, status, at });
  }
  return out;
}
```
In `toMessage`, add: `steps: parseSteps((row.metadata as { steps?: unknown } | null)?.steps),`.

- [ ] **Step 3: Verify** `pnpm lint` + `pnpm vitest run src/lib/arc-chat` green (any code constructing `MarkMessage` literals must add `steps: []` — there are none in app code, but check tests).

## Task 2: appendMarkStep persistence (TDD)

**Files:** `src/lib/arc-chat/persistence.ts`; Test `src/lib/arc-chat/steps.test.ts`

- [ ] **Step 1: Write the failing test** (`steps.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import { mergeStep } from "./persistence";

describe("mergeStep", () => {
  it("appends a running step", () => {
    const next = mergeStep([], { label: "Searching", status: "running", at: "t1" });
    expect(next).toEqual([{ label: "Searching", status: "running", at: "t1" }]);
  });
  it("flips the matching running step to done instead of duplicating", () => {
    const next = mergeStep([{ label: "Searching", status: "running", at: "t1" }], { label: "Searching", status: "done", at: "t2" });
    expect(next).toEqual([{ label: "Searching", status: "done", at: "t2" }]);
  });
  it("appends a done step with no prior running match", () => {
    const next = mergeStep([{ label: "A", status: "done", at: "t1" }], { label: "B", status: "done", at: "t2" });
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ label: "B", status: "done" });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run src/lib/arc-chat/steps.test.ts`.

- [ ] **Step 3: Implement** (pure helper + the I/O fn) in `persistence.ts`:

```typescript
export function mergeStep(steps: MarkStep[], step: MarkStep): MarkStep[] {
  if (step.status === "done") {
    const idx = [...steps].reverse().findIndex((s) => s.label === step.label && s.status === "running");
    if (idx !== -1) {
      const realIdx = steps.length - 1 - idx;
      return steps.map((s, i) => (i === realIdx ? step : s));
    }
  }
  return [...steps, step];
}

export async function appendMarkStep(
  input: { agentTaskId: string; label: string; status: "running" | "done"; at: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id, metadata")
    .eq("agent_task_id", input.agentTaskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
  assertOk("arc_messages step lookup", error);
  if (!data) return false;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const current = parseSteps(meta.steps);
  const nextSteps = mergeStep(current, { label: input.label, status: input.status, at: input.at });
  const { error: upErr } = await client.from("arc_messages").update({ metadata: { ...meta, steps: nextSteps } }).eq("id", data.id);
  assertOk("arc_messages step update", upErr);
  return true;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run src/lib/arc-chat/steps.test.ts` (3 passed).
- [ ] **Step 5: Commit** — `git add src/lib/arc-chat/persistence.ts src/lib/arc-chat/steps.test.ts && git commit -m "feat(arc-chat): activity steps on pending messages (mergeStep + appendMarkStep)"`

## Task 3: Append-step endpoint

**File:** Create `src/app/api/v1/arc/messages/[agentTaskId]/steps/route.ts` (mirror the existing messages route's auth/guards)

- [ ] **Step 1: Implement**

```typescript
import { NextResponse } from "next/server";

import { checkBearerToken } from "@/lib/auth/api-token";
import { appendMarkStep } from "@/lib/arc-chat/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ agentTaskId: string }> }) {
  const auth = checkBearerToken(request, "ARC_AGENT_API_TOKEN");
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set ARC_AGENT_API_TOKEN first." }
        : { ok: false, status: "unauthorized", message: "Valid bearer token required." },
      { status: auth.status },
    );
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: false, status: "not_configured", message: "Supabase admin env vars required." }, { status: 503 });
  }
  const { agentTaskId } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Body must be valid JSON." }, { status: 400 });
  }
  const body = payload as { label?: unknown; status?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const status = body.status === "done" ? "done" : "running";
  if (!label) {
    return NextResponse.json({ ok: false, status: "rejected", message: "label is required." }, { status: 400 });
  }
  try {
    const applied = await appendMarkStep({ agentTaskId, label, status, at: new Date().toISOString() });
    if (!applied) {
      return NextResponse.json({ ok: false, status: "not_found", message: "No pending message for that agentTaskId." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: "recorded" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, status: "failed", message: error instanceof Error ? error.message : "Failed to record step." }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify** `pnpm lint` + `pnpm vitest run` green. **Commit.**

## Task 4: ActivityTimeline UI *(HOT FILE — re-read first, coordinate)*

**File:** `src/app/arc/_components/message-list.tsx`

- [ ] When a Arc message is `pending` and has `steps.length > 0`, render a timeline: each step row shows `✓` (done) or a small spinner (`running`) + the label, newest building downward, with the existing "Waiting for Arc to reply…" line as the fallback when there are no steps yet. When the message is `complete`, render the body and (if steps exist) a small collapsed "Show what Arc did" `<details>` listing the done steps. Keep the app's tokens/classes.

## Task 5: Poll detects step changes *(HOT FILE — re-read first, coordinate)*

**File:** `src/app/arc/_components/arc-chat.tsx`

- [ ] In `sameMessages`, also compare steps so the timeline updates live, e.g. add to the per-message check: `x.steps.length !== y.steps.length || x.steps.some((s, j) => s.status !== y.steps[j]?.status || s.label !== y.steps[j]?.label)`. Without this, an unanswered pending message with changing steps won't re-render.

## Task 6: Arc contract — emit steps *(deliverable for Arc's Mac)*

- [ ] Update `marketing-classifier-agent/arc-skills/arc-chat-responder/SKILL.md`: before each meaningful action, `POST {APP_URL}/api/v1/arc/messages/{agentTaskId}/steps` with `{ "label": "Searching Meta Ad Library", "status": "running" }`, then `{ ..., "status": "done" }` when finished; then post the final reply as today. Steps are best-effort (a failed step POST never blocks the reply). Outbound stays locked.

---

## Self-Review
- **Spec coverage:** steps on message metadata (T1), append endpoint + merge (T2–3), timeline UI (T4), live polling (T5), Arc contract (T6). ✓
- **Additive/safe:** no schema change (reuses `metadata` jsonb); new endpoint is a new file; `appendMarkStep` preserves other metadata keys (e.g. `media`).
- **Type consistency:** `MarkStep`, `MarkMessage.steps`, `mergeStep`, `appendMarkStep` consistent across persistence, endpoint, tests, and the UI consumers.
- **Hot-file caveat:** T4/T5 edit components under active parallel development — coordinate / re-read before editing.
