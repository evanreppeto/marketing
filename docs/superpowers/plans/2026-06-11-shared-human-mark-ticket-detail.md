# Shared Human + Mark Ticket Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Linear-style task detail page for the Growth Engine board where humans and Mark share editable tickets, latest outputs, activity, and approval guardrails.

**Architecture:** Add a small persistence layer around `agent_tasks` for human/Mark ownership fields and task events. Extend `src/lib/agent-operations/read-model.ts` to produce ticket-detail data, then build focused client components for editable header/properties while preserving the existing inputs/outputs/log panels.

**Tech Stack:** Next.js App Router 16, React 19, Supabase, TypeScript, Vitest, existing Signal UI primitives in `src/app/_components`.

---

## Scope Check

This plan implements one subsystem: the shared human + Mark ticket detail and the board data it depends on. It does not implement a full Linear clone, realtime multi-user collaboration, a board drawer, publishing/sending/launching, or a broader campaign redesign.

## File Structure

- Create `supabase/migrations/20260611190000_shared_agent_task_ownership.sql`
  - Adds co-ownership columns to `agent_tasks`.
  - Adds `agent_task_events` for human comments, instructions, and property/status changes.
- Modify `src/lib/supabase/database.types.ts`
  - Adds the generated-equivalent table/column types needed by TypeScript.
- Modify `src/lib/agent-operations/read-model.ts`
  - Extends dashboard cards with owner/driver labels.
  - Extends task detail with description, acceptance criteria, latest output, event timeline, and editable property data.
- Modify `src/lib/agent-operations/read-model.test.ts`
  - Adds read-model coverage for owner/driver fields, latest output pinning, and timeline composition.
- Create `src/app/agent-operations/tasks/[taskId]/actions.ts`
  - Server actions for safe human edits and comments/instructions.
- Create `src/app/agent-operations/tasks/[taskId]/actions.test.ts`
  - Unit tests for validation, update payloads, event insertion, and revalidation paths.
- Modify `src/app/agent-operations/tasks/[taskId]/page.tsx`
  - Replaces sparse overview with Linear-style ticket workspace.
- Create `src/app/agent-operations/tasks/[taskId]/ticket-editable-header.tsx`
  - Client editable title/brief and top next-action controls.
- Create `src/app/agent-operations/tasks/[taskId]/ticket-property-rail.tsx`
  - Client property controls for status, owner, driver, priority, due date, scheduled date, and approver.
- Create `src/app/agent-operations/tasks/[taskId]/ticket-activity-timeline.tsx`
  - Unified human/Mark/system/approval timeline.
- Create `src/app/agent-operations/tasks/[taskId]/ticket-latest-output.tsx`
  - Pinned latest output preview and review/revise link.
- Create `src/app/agent-operations/tasks/[taskId]/ticket-acceptance-criteria.tsx`
  - Editable checklist backed by validated task metadata.
- Modify `src/app/agent-operations/task-kanban-board.tsx`
  - Shows owner/driver on cards and keeps click-through behavior.
- Modify `src/app/agent-operations/actions.ts`
  - Seeds new manually-created tasks with owner/driver defaults and event records.

---

### Task 1: Add Shared Task Persistence

**Files:**
- Create: `supabase/migrations/20260611190000_shared_agent_task_ownership.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260611190000_shared_agent_task_ownership.sql`:

```sql
alter table public.agent_tasks
  add column if not exists description text,
  add column if not exists owner_kind text not null default 'human'
    check (owner_kind in ('human', 'agent', 'system')),
  add column if not exists owner_label text not null default 'Operator'
    check (length(btrim(owner_label)) > 0),
  add column if not exists driver_kind text not null default 'agent'
    check (driver_kind in ('human', 'agent', 'system')),
  add column if not exists driver_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists driver_label text not null default 'Mark'
    check (length(btrim(driver_label)) > 0),
  add column if not exists approver_label text not null default 'Owner'
    check (length(btrim(approver_label)) > 0);

create table if not exists public.agent_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('human', 'agent', 'system', 'approval')),
  actor_label text not null check (length(btrim(actor_label)) > 0),
  event_type text not null check (
    event_type in (
      'comment',
      'instruction',
      'property_changed',
      'status_changed',
      'output_created',
      'approval_event',
      'system_event'
    )
  ),
  title text not null check (length(btrim(title)) > 0),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_tasks_owner_kind_idx on public.agent_tasks(owner_kind);
create index if not exists agent_tasks_driver_kind_idx on public.agent_tasks(driver_kind);
create index if not exists agent_tasks_driver_agent_id_idx on public.agent_tasks(driver_agent_id);
create index if not exists agent_task_events_task_id_created_at_idx
  on public.agent_task_events(task_id, created_at desc);
create index if not exists agent_task_events_type_idx on public.agent_task_events(event_type);

alter table public.agent_task_events enable row level security;
```

- [ ] **Step 2: Verify the migration is additive**

Run:

```powershell
Select-String -Path supabase\migrations\20260611190000_shared_agent_task_ownership.sql -Pattern "drop table","drop column","alter type" -SimpleMatch
```

Expected: no output.

- [ ] **Step 3: Update TypeScript database types**

In `src/lib/supabase/database.types.ts`, update `agent_tasks.Row`, `Insert`, and `Update` with:

```ts
description: string | null;
owner_kind: string;
owner_label: string;
driver_kind: string;
driver_agent_id: string | null;
driver_label: string;
approver_label: string;
```

For `agent_tasks.Insert` and `agent_tasks.Update`, make all new fields optional except `description?: string | null`:

```ts
description?: string | null;
owner_kind?: string;
owner_label?: string;
driver_kind?: string;
driver_agent_id?: string | null;
driver_label?: string;
approver_label?: string;
```

Add a new sibling table entry under `Tables`:

```ts
agent_task_events: {
  Row: {
    id: string;
    task_id: string;
    actor_kind: string;
    actor_label: string;
    event_type: string;
    title: string;
    body: string | null;
    metadata: Json;
    created_at: string;
  };
  Insert: {
    id?: string;
    task_id: string;
    actor_kind: string;
    actor_label: string;
    event_type: string;
    title: string;
    body?: string | null;
    metadata?: Json;
    created_at?: string;
  };
  Update: {
    id?: string;
    task_id?: string;
    actor_kind?: string;
    actor_label?: string;
    event_type?: string;
    title?: string;
    body?: string | null;
    metadata?: Json;
    created_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 4: Type-check the type file**

Run:

```powershell
pnpm exec tsc --noEmit --pretty false
```

Expected: either PASS, or failures only from unrelated in-flight Hermes auth work. If it fails, record the exact unrelated files before continuing.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/20260611190000_shared_agent_task_ownership.sql src/lib/supabase/database.types.ts
git commit -m "feat(board): add shared task ownership schema"
```

---

### Task 2: Extend The Read Model And Tests

**Files:**
- Modify: `src/lib/agent-operations/read-model.ts`
- Modify: `src/lib/agent-operations/read-model.test.ts`

- [ ] **Step 1: Write the failing dashboard mapping test**

In `src/lib/agent-operations/read-model.test.ts`, extend the existing `agent_tasks.data[0]` fixture:

```ts
description: "Build the first partner-facing draft and keep outbound locked.",
owner_kind: "human",
owner_label: "Evan",
driver_kind: "agent",
driver_agent_id: "agent-1",
driver_label: "Mark",
approver_label: "Owner",
```

Add these expectations to the dashboard task assertion:

```ts
owner: { kind: "human", label: "Evan" },
driver: { kind: "agent", label: "Mark" },
approverLabel: "Owner",
description: "Build the first partner-facing draft and keep outbound locked.",
```

- [ ] **Step 2: Add a failing task-detail test**

Append this test to `src/lib/agent-operations/read-model.test.ts`:

```ts
import { getAgentTaskDetail } from "./read-model";

it("maps task detail into a shared human and Mark ticket workspace", async () => {
  const supabase = createSupabaseQueryMock({
    agent_tasks: {
      data: {
        id: "task-123456789",
        agent_id: "agent-1",
        status: "running",
        priority: "high",
        objective: "Prepare plumbing partner outreach draft.",
        description: "Build the first partner-facing draft and keep outbound locked.",
        task_type: "campaign_draft",
        source_type: "lead",
        source_id: "00000000-0000-0000-0000-000000000001",
        campaign_id: "campaign-1",
        approval_item_id: "approval-1",
        started_at: "2026-06-11T18:00:00.000Z",
        completed_at: null,
        created_at: "2026-06-11T17:50:00.000Z",
        updated_at: "2026-06-11T18:05:00.000Z",
        owner_kind: "human",
        owner_label: "Evan",
        driver_kind: "agent",
        driver_agent_id: "agent-1",
        driver_label: "Mark",
        approver_label: "Owner",
        metadata: {
          risk_level: "medium",
          acceptance_criteria: [
            { id: "ac-1", label: "Coverage-neutral copy", completed: true },
            { id: "ac-2", label: "Approval item created", completed: false },
          ],
        },
      },
      error: null,
    },
    agents: {
      data: {
        id: "agent-1",
        key: "mark",
        name: "Mark",
        description: "Marketing runner",
        status: "running",
        allowed_actions: ["write_agent_run_logs"],
        blocked_actions: ["send_email"],
        default_approval_policy: "human_required_before_outbound",
        metadata: {},
        updated_at: "2026-06-11T18:05:00.000Z",
      },
      error: null,
    },
    campaigns: {
      data: {
        id: "campaign-1",
        name: "Plumber Referral Campaign",
        persona: "persona_plumbing_partner",
        status: "draft",
        objective: "Grow partner referrals.",
      },
      error: null,
    },
    approval_items: {
      data: {
        id: "approval-1",
        campaign_id: "campaign-1",
        campaign_asset_id: null,
        item_type: "campaign",
        status: "pending_approval",
        risk_level: "medium",
        requested_by: "mark",
        submitted_at: "2026-06-11T18:08:00.000Z",
        reviewed_at: null,
        draft_output: {},
        decision_notes: null,
      },
      error: null,
    },
    agent_task_inputs: { data: [], error: null },
    agent_outputs: {
      data: [
        {
          id: "output-1",
          task_id: "task-123456789",
          approval_item_id: "approval-1",
          campaign_asset_id: null,
          title: "Partner campaign draft",
          output_type: "campaign_brief",
          body: "Draft body",
          edited_body: null,
          structured_payload: {},
          risk_level: "medium",
          compliance_status: "passed",
          approval_status: "pending_approval",
          created_at: "2026-06-11T18:09:00.000Z",
        },
      ],
      error: null,
    },
    agent_run_logs: { data: [], error: null },
    agent_task_events: {
      data: [
        {
          id: "event-1",
          task_id: "task-123456789",
          actor_kind: "human",
          actor_label: "Evan",
          event_type: "instruction",
          title: "Added instruction",
          body: "Keep this partner-facing.",
          metadata: {},
          created_at: "2026-06-11T18:02:00.000Z",
        },
      ],
      error: null,
    },
  });

  const detail = await getAgentTaskDetail("task-123456789", supabase);

  expect(detail.status).toBe("live");
  if (detail.status !== "live") return;
  expect(detail.task).toMatchObject({
    owner: { kind: "human", label: "Evan" },
    driver: { kind: "agent", label: "Mark", agentId: "agent-1" },
    approverLabel: "Owner",
    description: "Build the first partner-facing draft and keep outbound locked.",
  });
  expect(detail.acceptanceCriteria).toEqual([
    { id: "ac-1", label: "Coverage-neutral copy", completed: true },
    { id: "ac-2", label: "Approval item created", completed: false },
  ]);
  expect(detail.latestOutput).toMatchObject({ id: "output-1", title: "Partner campaign draft" });
  expect(detail.timeline.map((event) => event.source)).toContain("Human");
  expect(detail.timeline.map((event) => event.source)).toContain("Mark");
  expect(detail.timeline.map((event) => event.source)).toContain("Approval");
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
pnpm test src/lib/agent-operations/read-model.test.ts
```

Expected: FAIL because `owner`, `driver`, `acceptanceCriteria`, `latestOutput`, and `timeline` are not yet exposed.

- [ ] **Step 4: Extend read-model types**

In `src/lib/agent-operations/read-model.ts`, update `AgentOperationsTask`:

```ts
owner: { kind: "human" | "agent" | "system"; label: string };
driver: { kind: "human" | "agent" | "system"; label: string; agentId: string | null };
approverLabel: string;
description: string | null;
```

Update `AgentTaskDetail.task`:

```ts
description: string | null;
owner: { kind: "human" | "agent" | "system"; label: string };
driver: { kind: "human" | "agent" | "system"; label: string; agentId: string | null };
approverLabel: string;
```

Add detail-level fields:

```ts
acceptanceCriteria: Array<{ id: string; label: string; completed: boolean }>;
latestOutput: AgentTaskDetail["outputs"][number] | null;
timeline: Array<{
  id: string;
  source: "Human" | "Mark" | "System" | "Approval";
  title: string;
  body: string | null;
  createdAt: string | null;
  eventType: string;
}>;
```

- [ ] **Step 5: Extend Supabase row types and selects**

Add to `AgentTaskRow`:

```ts
description: string | null;
owner_kind: string | null;
owner_label: string | null;
driver_kind: string | null;
driver_agent_id: string | null;
driver_label: string | null;
approver_label: string | null;
```

Add:

```ts
type AgentTaskEventRow = {
  id: string;
  task_id: string;
  actor_kind: string | null;
  actor_label: string | null;
  event_type: string | null;
  title: string | null;
  body: string | null;
  metadata: unknown;
  created_at: string | null;
};
```

Add the new columns to both `agent_tasks.select(...)` calls.

- [ ] **Step 6: Implement mapping helpers**

Add these helpers near the existing mapping helpers:

```ts
function mapActor(kind: string | null, label: string | null) {
  const normalizedKind = kind === "human" || kind === "agent" || kind === "system" ? kind : "human";
  return { kind: normalizedKind, label: label?.trim() || (normalizedKind === "agent" ? "Mark" : "Operator") };
}

function mapDriver(row: AgentTaskRow) {
  const actor = mapActor(row.driver_kind, row.driver_label);
  return { ...actor, agentId: row.driver_agent_id ?? row.agent_id ?? null };
}

function parseAcceptanceCriteria(metadata: unknown): Array<{ id: string; label: string; completed: boolean }> {
  if (!metadata || typeof metadata !== "object" || !("acceptance_criteria" in metadata)) return [];
  const raw = (metadata as { acceptance_criteria?: unknown }).acceptance_criteria;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { id?: unknown; label?: unknown; completed?: unknown };
    const label = typeof value.label === "string" ? value.label.trim() : "";
    if (!label) return [];
    return [{ id: typeof value.id === "string" ? value.id : `criterion-${index + 1}`, label, completed: value.completed === true }];
  });
}

function mapEventSource(row: Pick<AgentTaskEventRow, "actor_kind" | "actor_label">): "Human" | "Mark" | "System" | "Approval" {
  if (row.actor_kind === "approval") return "Approval";
  if (row.actor_kind === "agent") return "Mark";
  if (row.actor_kind === "system") return "System";
  return "Human";
}
```

- [ ] **Step 7: Fetch events and compose timeline**

Inside `getAgentTaskDetail`, add:

```ts
const eventsResult = await supabase
  .from("agent_task_events")
  .select("id,task_id,actor_kind,actor_label,event_type,title,body,metadata,created_at")
  .eq("task_id", taskId)
  .order("created_at", { ascending: false })
  .limit(50);
assertSupabaseResult("agent_task_events", eventsResult.error);
```

After mapping outputs/logs/approval, create:

```ts
const latestOutput = outputs[0] ?? null;
const eventTimeline = ((eventsResult.data ?? []) as AgentTaskEventRow[]).map((event) => ({
  id: event.id,
  source: mapEventSource(event),
  title: event.title ?? humanize(event.event_type ?? "event"),
  body: event.body,
  createdAt: event.created_at,
  eventType: event.event_type ?? "system_event",
}));
const outputTimeline = outputs.map((output) => ({
  id: `output-${output.id}`,
  source: "Mark" as const,
  title: `Created output: ${output.title}`,
  body: output.readableBody || null,
  createdAt: output.createdAt,
  eventType: "output_created",
}));
const approvalTimeline = approval
  ? [{
      id: `approval-${approval.id}`,
      source: "Approval" as const,
      title: `Approval ${humanize(approval.status)}`,
      body: null,
      createdAt: null,
      eventType: "approval_event",
    }]
  : [];
const timeline = [...eventTimeline, ...outputTimeline, ...approvalTimeline].sort((a, b) => {
  const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return right - left;
});
```

- [ ] **Step 8: Run tests to verify pass**

Run:

```powershell
pnpm test src/lib/agent-operations/read-model.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- src/lib/agent-operations/read-model.ts src/lib/agent-operations/read-model.test.ts
git commit -m "feat(board): map shared ticket detail state"
```

---

### Task 3: Add Human Edit Server Actions

**Files:**
- Create: `src/app/agent-operations/tasks/[taskId]/actions.ts`
- Create: `src/app/agent-operations/tasks/[taskId]/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Create `src/app/agent-operations/tasks/[taskId]/actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn(async () => ({ email: "evan@example.com" })) }));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { updateTaskFieldAction, addTaskEventAction, toggleAcceptanceCriterionAction } from "./actions";

describe("task detail actions", () => {
  it("updates an editable field and writes a property_changed event", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: { metadata: { acceptance_criteria: [] } }, error: null },
      agent_task_events: { data: null, error: null },
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(supabase as never);

    const result = await updateTaskFieldAction("task-1", { field: "priority", value: "high" });

    expect(result).toEqual({ ok: true });
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual(["from", "agent_task_events"]);
  });

  it("rejects unsafe field names", async () => {
    const result = await updateTaskFieldAction("task-1", { field: "agent_id", value: "agent-2" } as never);
    expect(result).toMatchObject({ ok: false });
  });

  it("adds explicit human instructions", async () => {
    const supabase = createSupabaseQueryMock({ agent_task_events: { data: null, error: null } });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(supabase as never);

    const result = await addTaskEventAction("task-1", { eventType: "instruction", body: "Keep this partner-facing." });

    expect(result).toEqual({ ok: true });
    expect(supabase.calls).toContainEqual(["from", "agent_task_events"]);
  });

  it("toggles acceptance criteria through task metadata", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: {
        data: { metadata: { acceptance_criteria: [{ id: "ac-1", label: "Review", completed: false }] } },
        error: null,
      },
      agent_task_events: { data: null, error: null },
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue(supabase as never);

    const result = await toggleAcceptanceCriterionAction("task-1", "ac-1", true);

    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
pnpm test 'src/app/agent-operations/tasks/[taskId]/actions.test.ts'
```

Expected: FAIL because `actions.ts` does not exist.

- [ ] **Step 3: Implement server actions**

Create `src/app/agent-operations/tasks/[taskId]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; message: string };

type EditableField =
  | "objective"
  | "description"
  | "status"
  | "priority"
  | "owner_label"
  | "driver_kind"
  | "driver_label"
  | "approver_label"
  | "due_at"
  | "scheduled_for"
  | "task_type"
  | "campaign_id";

const editableFields = new Set<EditableField>([
  "objective",
  "description",
  "status",
  "priority",
  "owner_label",
  "driver_kind",
  "driver_label",
  "approver_label",
  "due_at",
  "scheduled_for",
  "task_type",
  "campaign_id",
]);
const allowedStatuses = new Set(["queued", "running", "blocked", "needs_approval", "completed", "failed", "canceled"]);
const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);
const allowedDriverKinds = new Set(["human", "agent", "system"]);

export async function updateTaskFieldAction(
  taskId: string,
  input: { field: EditableField; value: string | null },
): Promise<ActionResult> {
  const operator = await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  if (!editableFields.has(input.field)) return { ok: false, message: "This field cannot be edited." };

  const normalized = normalizeField(input.field, input.value);
  if (!normalized.ok) return normalized;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("agent_tasks").update({ [input.field]: normalized.value }).eq("id", taskId);
  if (error) return { ok: false, message: error.message };

  await supabase.from("agent_task_events").insert({
    task_id: taskId,
    actor_kind: "human",
    actor_label: operator.email ?? "Operator",
    event_type: input.field === "status" ? "status_changed" : "property_changed",
    title: `${humanize(input.field)} changed`,
    body: normalized.value === null ? "Cleared value." : `Set to ${normalized.value}.`,
    metadata: { field: input.field, value: normalized.value },
  });

  revalidateTask(taskId);
  return { ok: true };
}

export async function addTaskEventAction(
  taskId: string,
  input: { eventType: "comment" | "instruction"; body: string },
): Promise<ActionResult> {
  const operator = await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  const body = input.body.trim();
  if (body.length < 2) return { ok: false, message: "Write at least two characters." };
  if (body.length > 4000) return { ok: false, message: "Keep comments under 4000 characters." };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("agent_task_events").insert({
    task_id: taskId,
    actor_kind: "human",
    actor_label: operator.email ?? "Operator",
    event_type: input.eventType,
    title: input.eventType === "instruction" ? "Instruction added" : "Comment added",
    body,
    metadata: {},
  });
  if (error) return { ok: false, message: error.message };

  revalidateTask(taskId);
  return { ok: true };
}

export async function toggleAcceptanceCriterionAction(taskId: string, criterionId: string, completed: boolean): Promise<ActionResult> {
  const operator = await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Supabase is not configured." };
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("agent_tasks").select("metadata").eq("id", taskId).maybeSingle<{ metadata: unknown }>();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Task not found." };

  const metadata = data.metadata && typeof data.metadata === "object" ? { ...(data.metadata as Record<string, unknown>) } : {};
  const criteria = Array.isArray(metadata.acceptance_criteria) ? metadata.acceptance_criteria : [];
  metadata.acceptance_criteria = criteria.map((item) =>
    item && typeof item === "object" && (item as { id?: unknown }).id === criterionId
      ? { ...item, completed }
      : item,
  );

  const update = await supabase.from("agent_tasks").update({ metadata }).eq("id", taskId);
  if (update.error) return { ok: false, message: update.error.message };

  await supabase.from("agent_task_events").insert({
    task_id: taskId,
    actor_kind: "human",
    actor_label: operator.email ?? "Operator",
    event_type: "property_changed",
    title: "Acceptance criterion updated",
    body: completed ? "Marked complete." : "Marked incomplete.",
    metadata: { criterionId, completed },
  });

  revalidateTask(taskId);
  return { ok: true };
}

function normalizeField(field: EditableField, value: string | null): { ok: true; value: string | null } | ActionResult {
  const trimmed = typeof value === "string" ? value.trim() : null;
  if (field === "objective" && (!trimmed || trimmed.length < 3)) return { ok: false, message: "Title is too short." };
  if (field === "status" && (!trimmed || !allowedStatuses.has(trimmed))) return { ok: false, message: "Invalid status." };
  if (field === "priority" && (!trimmed || !allowedPriorities.has(trimmed))) return { ok: false, message: "Invalid priority." };
  if (field === "driver_kind" && (!trimmed || !allowedDriverKinds.has(trimmed))) return { ok: false, message: "Invalid driver." };
  if ((field === "due_at" || field === "scheduled_for") && trimmed) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return { ok: false, message: "Invalid date." };
    return { ok: true, value: date.toISOString() };
  }
  return { ok: true, value: trimmed || null };
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function revalidateTask(taskId: string) {
  revalidatePath(`/agent-operations/tasks/${taskId}`);
  revalidatePath("/agent-operations");
  revalidatePath("/board");
  revalidatePath("/");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
pnpm test 'src/app/agent-operations/tasks/[taskId]/actions.test.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- 'src/app/agent-operations/tasks/[taskId]/actions.ts' 'src/app/agent-operations/tasks/[taskId]/actions.test.ts'
git commit -m "feat(board): add editable task detail actions"
```

---

### Task 4: Redesign The Ticket Detail Page

**Files:**
- Modify: `src/app/agent-operations/tasks/[taskId]/page.tsx`
- Create: `src/app/agent-operations/tasks/[taskId]/ticket-editable-header.tsx`
- Create: `src/app/agent-operations/tasks/[taskId]/ticket-property-rail.tsx`
- Create: `src/app/agent-operations/tasks/[taskId]/ticket-latest-output.tsx`
- Create: `src/app/agent-operations/tasks/[taskId]/ticket-activity-timeline.tsx`
- Create: `src/app/agent-operations/tasks/[taskId]/ticket-acceptance-criteria.tsx`

- [ ] **Step 1: Create the editable header component**

Create `ticket-editable-header.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import { updateTaskFieldAction, addTaskEventAction } from "./actions";

type Props = {
  taskId: string;
  objective: string;
  description: string | null;
  status: string;
  driverLabel: string;
  latestOutputHref: string | null;
};

export function TicketEditableHeader({ taskId, objective, description, status, driverLabel, latestOutputHref }: Props) {
  const [title, setTitle] = useState(objective);
  const [brief, setBrief] = useState(description ?? "");
  const [instruction, setInstruction] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  function save(field: "objective" | "description", value: string) {
    setSaveState("saving");
    startTransition(async () => {
      const result = await updateTaskFieldAction(taskId, { field, value });
      setSaveState(result.ok ? "saved" : "error");
    });
  }

  function submitInstruction() {
    const body = instruction.trim();
    if (!body) return;
    setInstruction("");
    startTransition(async () => {
      await addTaskEventAction(taskId, { eventType: "instruction", body });
    });
  }

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={status === "blocked" ? "red" : status === "completed" ? "green" : "amber"}>{humanize(status)}</StatusPill>
        <StatusPill tone="blue">{driverLabel} driving</StatusPill>
        <StatusPill tone="amber">Outbound locked</StatusPill>
        <span className="text-xs font-medium text-[var(--text-muted)]">{saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</span>
      </div>

      <input
        aria-label="Task title"
        className="w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-[26px] font-semibold leading-tight text-[var(--text-primary)] outline-none transition focus:border-[var(--border-panel)] focus:bg-[var(--surface-inset)] focus:px-3"
        onBlur={() => save("objective", title)}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />

      <textarea
        aria-label="Task brief"
        className="min-h-20 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-secondary)] outline-none transition focus:border-[var(--accent-border)]"
        onBlur={() => save("description", brief)}
        onChange={(event) => setBrief(event.target.value)}
        placeholder="Add the human-readable work brief Mark and the team should follow."
        value={brief}
      />

      <div className="flex flex-wrap items-center gap-2">
        {latestOutputHref ? <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={latestOutputHref}>Review latest output</Link> : null}
        <button className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={submitInstruction} type="button">Ask Mark to continue</button>
        <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/board">Open board</Link>
      </div>

      <div className="flex gap-2">
        <input
          className="min-h-10 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitInstruction();
          }}
          placeholder="Add an instruction for Mark..."
          value={instruction}
        />
        <button className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={submitInstruction} type="button">Send</button>
      </div>
    </header>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
```

- [ ] **Step 2: Create the property rail**

Create `ticket-property-rail.tsx`:

```tsx
"use client";

import { useTransition } from "react";

import { StatusPill } from "@/app/_components/page-header";
import { updateTaskFieldAction } from "./actions";

type Props = {
  taskId: string;
  status: string;
  priority: string;
  ownerLabel: string;
  driverKind: string;
  driverLabel: string;
  approverLabel: string;
  dueAt: string | null;
  scheduledFor?: string | null;
  campaignName?: string | null;
  sourceLabel?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function TicketPropertyRail(props: Props) {
  const [, startTransition] = useTransition();
  function update(field: Parameters<typeof updateTaskFieldAction>[1]["field"], value: string | null) {
    startTransition(async () => {
      await updateTaskFieldAction(props.taskId, { field, value });
    });
  }

  return (
    <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start lg:border-l lg:border-[var(--border-hairline)] lg:pl-6">
      <section className="space-y-3">
        <RailSelect label="Status" value={props.status} options={["queued", "running", "blocked", "needs_approval", "completed", "failed", "canceled"]} onChange={(value) => update("status", value)} />
        <RailSelect label="Priority" value={props.priority} options={["low", "medium", "high", "urgent"]} onChange={(value) => update("priority", value)} />
        <RailInput label="Owner" value={props.ownerLabel} onBlur={(value) => update("owner_label", value)} />
        <RailSelect label="Driver" value={props.driverKind} options={["agent", "human"]} onChange={(value) => update("driver_kind", value)} />
        <RailInput label="Driver label" value={props.driverLabel} onBlur={(value) => update("driver_label", value)} />
        <RailInput label="Approver" value={props.approverLabel} onBlur={(value) => update("approver_label", value)} />
        <RailInput label="Due" value={props.dueAt ?? ""} onBlur={(value) => update("due_at", value || null)} />
      </section>

      <section className="border-t border-[var(--border-hairline)] pt-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Growth context</div>
        {props.campaignName ? <ContextRow label="Campaign" value={props.campaignName} /> : null}
        {props.sourceLabel ? <ContextRow label="Source" value={props.sourceLabel} /> : null}
        <ContextRow label="Outbound" value={<StatusPill tone="amber">Locked</StatusPill>} />
      </section>

      <section className="border-t border-[var(--border-hairline)] pt-4 text-xs text-[var(--text-muted)]">
        <div>Created {formatDate(props.createdAt)}</div>
        <div className="mt-1">Updated {formatDate(props.updatedAt)}</div>
      </section>
    </aside>
  );
}

function RailSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-3 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <select className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1.5 text-[var(--text-primary)]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
      </select>
    </label>
  );
}

function RailInput({ label, value, onBlur }: { label: string; value: string; onBlur: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-3 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <input className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1.5 text-right text-[var(--text-primary)]" defaultValue={value} onBlur={(event) => onBlur(event.target.value)} />
    </label>
  );
}

function ContextRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">{label}</span><span className="text-right font-semibold text-[var(--text-primary)]">{value}</span></div>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
```

- [ ] **Step 3: Create latest output, activity, and criteria components**

Create `ticket-latest-output.tsx`:

```tsx
import Link from "next/link";
import { StatusPill, buttonClasses } from "@/app/_components/page-header";

type Output = {
  id: string;
  title: string;
  outputType: string;
  readableBody: string;
  complianceStatus: string;
  approvalStatus: string;
  approvalHref: string | null;
};

export function TicketLatestOutput({ output, taskId }: { output: Output | null; taskId: string }) {
  if (!output) {
    return <section className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-sm text-[var(--text-muted)]">No output yet. When Mark creates work, the latest useful output appears here.</section>;
  }
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{humanize(output.outputType)}</div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{output.title}</h2>
        </div>
        <StatusPill tone={output.approvalStatus.includes("approved") ? "green" : "amber"}>{humanize(output.approvalStatus)}</StatusPill>
      </div>
      <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{output.readableBody || "No readable body captured."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/agent-operations/tasks/${taskId}?section=outputs`}>Open outputs</Link>
        {output.approvalHref ? <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={output.approvalHref}>Review approval</Link> : null}
      </div>
    </section>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
```

Create `ticket-activity-timeline.tsx`:

```tsx
type TimelineEvent = {
  id: string;
  source: "Human" | "Mark" | "System" | "Approval";
  title: string;
  body: string | null;
  createdAt: string | null;
  eventType: string;
};

export function TicketActivityTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-[var(--text-muted)]">No activity recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li className="grid grid-cols-[28px_1fr] gap-3" key={event.id}>
          <div className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold ${event.source === "Mark" ? "border-[var(--accent-border)] text-[var(--accent)]" : "border-[var(--border-hairline)] text-[var(--text-muted)]"}`}>
            {event.source === "Mark" ? "M" : event.source.slice(0, 1)}
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{event.title}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{formatDate(event.createdAt)}</span>
            </div>
            {event.body ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{event.body}</p> : null}
            <div className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">{event.source} / {humanize(event.eventType)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
```

Create `ticket-acceptance-criteria.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toggleAcceptanceCriterionAction } from "./actions";

export function TicketAcceptanceCriteria({
  taskId,
  criteria,
}: {
  taskId: string;
  criteria: Array<{ id: string; label: string; completed: boolean }>;
}) {
  const [, startTransition] = useTransition();
  if (criteria.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Acceptance criteria</h2>
      <div className="mt-3 space-y-2">
        {criteria.map((criterion) => (
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" key={criterion.id}>
            <input
              checked={criterion.completed}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                startTransition(async () => {
                  await toggleAcceptanceCriterionAction(taskId, criterion.id, checked);
                });
              }}
              type="checkbox"
            />
            <span>{criterion.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Recompose `page.tsx`**

In `src/app/agent-operations/tasks/[taskId]/page.tsx`, replace the current main header and overview composition with imports:

```ts
import { TicketAcceptanceCriteria } from "./ticket-acceptance-criteria";
import { TicketActivityTimeline } from "./ticket-activity-timeline";
import { TicketEditableHeader } from "./ticket-editable-header";
import { TicketLatestOutput } from "./ticket-latest-output";
import { TicketPropertyRail } from "./ticket-property-rail";
```

Use this body shape for live details:

```tsx
return (
  <div className="mx-auto w-full max-w-[1180px]">
    <Link href="/board" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
      Task board / {task.id.slice(0, 8)}
    </Link>

    <div className="mt-5 grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 space-y-6">
        <TicketEditableHeader
          taskId={task.id}
          objective={task.objective}
          description={task.description}
          status={task.status}
          driverLabel={task.driver.label}
          latestOutputHref={detail.latestOutput ? `/agent-operations/tasks/${task.id}?section=outputs` : null}
        />
        <TaskSectionTabs activeSection={activeSection} counts={counts} taskId={task.id} />
        {activeSection === "overview" ? (
          <>
            <TicketAcceptanceCriteria taskId={task.id} criteria={detail.acceptanceCriteria} />
            <TicketLatestOutput output={detail.latestOutput} taskId={task.id} />
            <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Activity</h2>
              <TicketActivityTimeline events={detail.timeline} />
            </section>
          </>
        ) : null}
        {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
        {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
        {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
      </main>
      <TicketPropertyRail
        taskId={task.id}
        status={task.status}
        priority={task.priority}
        ownerLabel={task.owner.label}
        driverKind={task.driver.kind}
        driverLabel={task.driver.label}
        approverLabel={task.approverLabel}
        dueAt={task.dueAt}
        scheduledFor={task.scheduledFor}
        campaignName={detail.campaign?.name ?? null}
        sourceLabel={task.sourceType ? humanize(task.sourceType) : null}
        createdAt={task.createdAt}
        updatedAt={task.updatedAt}
      />
    </div>
  </div>
);
```

Remove the old `TaskOverview` and `TaskSidebar` functions only after the new imports compile.

- [ ] **Step 5: Run TypeScript**

Run:

```powershell
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS, except for unrelated existing Hermes auth work if still present. Fix only errors caused by these files.

- [ ] **Step 6: Commit**

```powershell
git add -- 'src/app/agent-operations/tasks/[taskId]/page.tsx' 'src/app/agent-operations/tasks/[taskId]/ticket-editable-header.tsx' 'src/app/agent-operations/tasks/[taskId]/ticket-property-rail.tsx' 'src/app/agent-operations/tasks/[taskId]/ticket-latest-output.tsx' 'src/app/agent-operations/tasks/[taskId]/ticket-activity-timeline.tsx' 'src/app/agent-operations/tasks/[taskId]/ticket-acceptance-criteria.tsx'
git commit -m "feat(board): redesign shared ticket detail"
```

---

### Task 5: Reflect Owner And Driver On Board Cards

**Files:**
- Modify: `src/app/agent-operations/task-kanban-board.tsx`
- Modify: `src/app/agent-operations/actions.ts`

- [ ] **Step 1: Update create-task defaults**

In `createTaskAction`, add these fields to the `agent_tasks.insert(...)` object:

```ts
description: objective,
owner_kind: "human",
owner_label: "Operator",
driver_kind: "agent",
driver_agent_id: agentId,
driver_label: "Mark",
approver_label: "Owner",
```

After the existing `agent_run_logs.insert`, add an event insert:

```ts
await supabase.from("agent_task_events").insert({
  task_id: data.id,
  actor_kind: "human",
  actor_label: "Operator",
  event_type: "system_event",
  title: "Task created",
  body: objective,
  metadata: { source: "board_create", driver: "Mark" },
});
```

- [ ] **Step 2: Update board card owner/driver copy**

In `task-kanban-board.tsx`, inside `Card`, derive:

```ts
const ownerLabel = task.owner?.label ?? "Operator";
const driverLabel = task.driver?.label ?? task.agentName;
const driverIsMark = task.driver?.kind === "agent";
```

Replace the hard-coded live label:

```tsx
{working ? (
  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
    <span className="kanban-presence" />
    {driverLabel} live
  </span>
) : null}
```

Add owner/driver text to the subtitle:

```tsx
<p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
  {task.task} / #{task.id} / Owner {ownerLabel} / Driver {driverLabel}
</p>
```

Keep `EntityAvatar owner={{ kind: "agent" }}` for Mark-driven cards, but switch to human owner when `driverIsMark` is false:

```tsx
<EntityAvatar owner={driverIsMark ? { kind: "agent" } : { kind: "human", name: driverLabel }} size={22} pending={working} />
```

- [ ] **Step 3: Run focused checks**

Run:

```powershell
pnpm test src/lib/agent-operations/read-model.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: read-model tests pass; TypeScript passes except unrelated in-flight files if present.

- [ ] **Step 4: Commit**

```powershell
git add -- src/app/agent-operations/task-kanban-board.tsx src/app/agent-operations/actions.ts
git commit -m "feat(board): show shared task ownership on cards"
```

---

### Task 6: Verify The Full Board Story

**Files:**
- No source edits unless verification finds defects.

- [ ] **Step 1: Run focused tests**

```powershell
pnpm test src/lib/agent-operations/read-model.test.ts 'src/app/agent-operations/tasks/[taskId]/actions.test.ts' src/lib/hermes-api/__tests__/tasks.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

```powershell
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS. If it fails because of pre-existing Hermes auth files, capture exact errors and do not mix that fix into this slice without user approval.

- [ ] **Step 3: Run build**

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Browser smoke**

Start the dev server if needed:

```powershell
pnpm dev
```

Open:

- `http://localhost:3000/board`
- one real task detail URL from a card, such as `http://localhost:3000/agent-operations/tasks/<taskId>`

Verify:

- Board cards show owner/driver context.
- Clicking a card opens the full ticket detail page.
- The title and brief are editable.
- The rail edits status, priority, owner, driver, approver, and dates.
- Latest output appears on Overview when available.
- Inputs, Outputs, and Logs tabs still work.
- Activity timeline shows human, Mark, system, and approval events where data exists.
- Outbound lock remains visible.

- [ ] **Step 5: Final commit or fixup**

If verification required fixes, commit them:

```powershell
git add -- <fixed-files>
git commit -m "fix(board): polish shared ticket detail verification"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: the plan covers co-owned tickets, editable properties, latest output pinning, activity timeline, acceptance criteria, board owner/driver display, and approval guardrails.
- Scope kept narrow: board/detail only; no drawer, realtime, publishing, launch, or full campaign redesign.
- Persistence is additive: no shipped migration edits and no destructive SQL.
- TDD order is explicit for read-model and action logic before UI composition.
