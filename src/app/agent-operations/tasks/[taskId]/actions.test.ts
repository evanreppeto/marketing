import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import {
  addTaskEventAction,
  toggleAcceptanceCriterionAction,
  updateTaskFieldAction,
} from "./actions";

const mocks = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  getOperatorActor: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/operator", () => ({
  requireOperator: mocks.requireOperator,
  getOperatorActor: mocks.getOperatorActor,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
  isSupabaseAdminConfigured: mocks.isSupabaseAdminConfigured,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

describe("task detail actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperator.mockResolvedValue(undefined);
    mocks.getOperatorActor.mockReturnValue("owner@example.com");
    mocks.isSupabaseAdminConfigured.mockReturnValue(true);
  });

  it("updates an editable task field and writes a property_changed event", async () => {
    const supabase = mockSupabase({
      agent_tasks: { data: null, error: null },
      agent_task_events: { data: null, error: null },
    });

    const result = await updateTaskFieldAction("task-1", { field: "priority", value: "high" });

    expect(result).toEqual({ ok: true });
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual(["update", { priority: "high" }]);
    expect(supabase.calls).toContainEqual(["eq", "id", "task-1"]);
    expect(eventInsertPayload(supabase)).toMatchObject({
      task_id: "task-1",
      actor_kind: "human",
      actor_label: "owner@example.com",
      event_type: "property_changed",
      title: "Priority changed",
      body: "Priority changed to high.",
      metadata: { field: "priority", value: "high" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent-operations/tasks/task-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent-operations");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/board");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("rejects unsafe field names before updating", async () => {
    const supabase = mockSupabase({
      agent_tasks: { data: null, error: null },
      agent_task_events: { data: null, error: null },
    });

    const result = await updateTaskFieldAction("task-1", { field: "agent_id" as never, value: "agent-2" });

    expect(result.ok).toBe(false);
    expect(supabase.calls).not.toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).not.toContainEqual(["update", { agent_id: "agent-2" }]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed update field values before trimming or updating", async () => {
    const supabase = mockSupabase({
      agent_tasks: { data: null, error: null },
      agent_task_events: { data: null, error: null },
    });

    const result = await (updateTaskFieldAction as any)("task-1", { field: "owner_label", value: {} });

    expect(result.ok).toBe(false);
    expect(supabase.calls).not.toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls.some((call) => call[0] === "update")).toBe(false);
    expect(supabase.calls.some((call) => call[0] === "insert")).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("adds a human instruction event", async () => {
    const supabase = mockSupabase({
      agent_task_events: { data: null, error: null },
    });

    const result = await addTaskEventAction("task-1", {
      eventType: "instruction",
      body: "Keep this partner-facing.",
    });

    expect(result).toEqual({ ok: true });
    expect(eventInsertPayload(supabase)).toMatchObject({
      task_id: "task-1",
      actor_kind: "human",
      actor_label: "owner@example.com",
      event_type: "instruction",
      title: "Instruction added",
      body: "Keep this partner-facing.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent-operations/tasks/task-1");
  });

  it("rejects malformed event bodies before trimming or inserting", async () => {
    const supabase = mockSupabase({
      agent_task_events: { data: null, error: null },
    });

    const result = await (addTaskEventAction as any)("task-1", { eventType: "instruction", body: 123 });

    expect(result.ok).toBe(false);
    expect(supabase.calls.some((call) => call[0] === "insert")).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates acceptance criteria metadata and writes an event", async () => {
    const supabase = mockSupabase({
      agent_tasks: {
        data: {
          metadata: {
            risk_level: "medium",
            acceptance_criteria: [
              { id: "ac-1", label: "Partner-facing copy is approved", completed: false },
              { id: "ac-2", label: "Outbound remains locked", completed: false },
            ],
          },
        },
        error: null,
      },
      agent_task_events: { data: null, error: null },
    });

    const result = await toggleAcceptanceCriterionAction("task-1", "ac-1", true);

    expect(result).toEqual({ ok: true });
    expect(supabase.calls).toContainEqual(["select", "metadata"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "task-1"]);
    expect(supabase.calls).toContainEqual(["update", {
      metadata: {
        risk_level: "medium",
        acceptance_criteria: [
          { id: "ac-1", label: "Partner-facing copy is approved", completed: true },
          { id: "ac-2", label: "Outbound remains locked", completed: false },
        ],
      },
    }]);
    expect(eventInsertPayload(supabase)).toMatchObject({
      task_id: "task-1",
      actor_kind: "human",
      actor_label: "owner@example.com",
      event_type: "property_changed",
      title: "Acceptance criterion updated",
      body: "Partner-facing copy is approved marked complete.",
      metadata: { criterion_id: "ac-1", completed: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent-operations/tasks/task-1");
  });

  it("rejects malformed acceptance criterion toggles before updating metadata", async () => {
    const supabase = mockSupabase({
      agent_tasks: {
        data: {
          metadata: {
            acceptance_criteria: [
              { id: "ac-1", label: "Partner-facing copy is approved", completed: false },
            ],
          },
        },
        error: null,
      },
      agent_task_events: { data: null, error: null },
    });

    const result = await (toggleAcceptanceCriterionAction as any)("task-1", "ac-1", "true");

    expect(result.ok).toBe(false);
    expect(supabase.calls.some((call) => call[0] === "update")).toBe(false);
    expect(supabase.calls.some((call) => call[0] === "insert")).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

function mockSupabase(responses: Parameters<typeof createSupabaseQueryMock>[0]) {
  const supabase = createSupabaseQueryMock(responses);
  mocks.getSupabaseAdminClient.mockReturnValue(supabase);
  return supabase;
}

function eventInsertPayload(supabase: MockSupabase) {
  return supabase.calls.find((call) => call[0] === "insert")?.[1];
}
