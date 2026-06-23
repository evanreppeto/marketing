import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import {
  assignConversationToCampaign,
  appendArcStep,
  cancelPendingArcMessage,
  completeArcMessage,
  deleteConversation,
  findPendingMessageByTask,
  insertOperatorMessage,
  linkConversationToCampaign,
  listConversations,
  setConversationPinned,
  setArcMessageFeedback,
} from "./persistence";

function calls(supabase: MockSupabase, method: string): Array<Record<string, unknown>> {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

function orderCalls(supabase: MockSupabase): Array<[string, ...unknown[]]> {
  return supabase.calls.filter(([m]) => m === "order");
}

describe("listConversations", () => {
  it("orders pinned first (nulls last), then by last_message_at desc", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: [], error: null } });

    await listConversations("Operator", supabase);

    const orders = orderCalls(supabase);
    expect(orders).toContainEqual(["order", "pinned_at", { ascending: false, nullsFirst: false }]);
    expect(orders).toContainEqual(["order", "last_message_at", { ascending: false }]);
  });

  it("maps pinned_at onto pinnedAt", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: {
        data: [
          {
            id: "c1",
            operator: "Operator",
            title: "Hi",
            status: "active",
            project_id: null,
            pinned_at: "2026-06-09T00:00:00Z",
            created_at: "t",
            updated_at: "t",
            last_message_at: "t",
          },
        ],
        error: null,
      },
    });

    const rows = await listConversations("Operator", supabase);

    expect(rows[0].pinnedAt).toBe("2026-06-09T00:00:00Z");
  });
});

describe("insertOperatorMessage", () => {
  it("stores command and skill metadata for skill-driven reruns", async () => {
    const supabase = createSupabaseQueryMock({
      arc_messages: {
        data: {
          id: "m1",
          conversation_id: "c1",
          role: "operator",
          body: "Find new leads",
          status: "sent",
          agent_task_id: null,
          mentions: [],
          metadata: { command: "find-leads", skill_id: "opportunity-discovery" },
          created_at: "2026-06-23T00:00:00.000Z",
        },
        error: null,
      },
    });

    const message = await insertOperatorMessage(
      {
        conversationId: "c1",
        body: "Find new leads",
        mentions: [],
        command: "find-leads",
        skillId: "opportunity-discovery",
      },
      supabase,
    );

    const insert = calls(supabase, "insert")[0];
    expect(insert.metadata).toMatchObject({ command: "find-leads", skill_id: "opportunity-discovery" });
    expect(message.command).toBe("find-leads");
    expect(message.skillId).toBe("opportunity-discovery");
  });
});

describe("setConversationPinned", () => {
  it("stamps pinned_at when pinning", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });

    await setConversationPinned("c1", true, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.pinned_at).toEqual(expect.any(String));
    // Must be scoped to the one conversation, not an unscoped UPDATE across all rows.
    expect(supabase.calls).toContainEqual(["eq", "id", "c1"]);
  });

  it("clears pinned_at when unpinning", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });

    await setConversationPinned("c1", false, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.pinned_at).toBeNull();
  });
});

describe("deleteConversation", () => {
  it("hard-deletes the conversation row", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });

    await deleteConversation("c1", supabase);

    expect(supabase.calls).toContainEqual(["delete"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "c1"]);
  });
});

describe("cancelPendingArcMessage", () => {
  it("deletes the latest pending Arc message and reports true", async () => {
    const supabase = createSupabaseQueryMock({ arc_messages: { data: { id: "m9" }, error: null } });

    const cancelled = await cancelPendingArcMessage("c1", supabase);

    expect(cancelled).toBe(true);
    expect(supabase.calls).toContainEqual(["eq", "status", "pending"]);
    expect(supabase.calls).toContainEqual(["delete"]);
    // The delete must target the looked-up row's id, not a blanket delete.
    expect(supabase.calls).toContainEqual(["eq", "id", "m9"]);
  });

  it("is a safe no-op when no pending message exists", async () => {
    const supabase = createSupabaseQueryMock({ arc_messages: { data: null, error: null } });

    const cancelled = await cancelPendingArcMessage("c1", supabase);

    expect(cancelled).toBe(false);
    expect(supabase.calls).not.toContainEqual(["delete"]);
  });
});

describe("setArcMessageFeedback", () => {
  it("writes feedback merged into existing metadata, scoped by id", async () => {
    const supabase = createSupabaseQueryMock({
      arc_messages: { data: { id: "m1", metadata: { steps: [] } }, error: null },
    });

    await setArcMessageFeedback("m1", "up", supabase);

    const update = calls(supabase, "update")[0];
    expect(update.metadata).toMatchObject({ steps: [], feedback: "up" });
    expect(supabase.calls).toContainEqual(["eq", "id", "m1"]);
  });

  it("clears feedback when value is null", async () => {
    const supabase = createSupabaseQueryMock({
      arc_messages: { data: { id: "m1", metadata: { feedback: "up" } }, error: null },
    });

    await setArcMessageFeedback("m1", null, supabase);

    const update = calls(supabase, "update")[0];
    expect(update.metadata).toMatchObject({ feedback: null });
  });
});

describe("assignConversationToCampaign", () => {
  it("updates campaign_id on the conversation row", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });

    await assignConversationToCampaign("conv-1", "camp-9", supabase);

    const update = calls(supabase, "update")[0];
    expect(update).toEqual({ campaign_id: "camp-9" });
  });

  it("clears campaign_id with null", async () => {
    const supabase = createSupabaseQueryMock({ arc_conversations: { data: null, error: null } });

    await assignConversationToCampaign("conv-1", null, supabase);

    const update = calls(supabase, "update")[0];
    expect(update).toEqual({ campaign_id: null });
  });
});

describe("linkConversationToCampaign", () => {
  function makeConvRow(overrides: Partial<{
    project_id: string | null;
    campaign_id: string | null;
  }> = {}) {
    return {
      id: "conv-1",
      operator: "evan",
      title: "Test chat",
      status: "active",
      pinned_at: null,
      project_id: null,
      campaign_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      last_message_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("creates a project and updates conversation when projectId is null", async () => {
    // arc_conversations: first call = getConversation (returns row), second = update (returns null)
    // arc_projects: insert returns new project
    const supabase = createSupabaseQueryMock({
      arc_conversations: [
        { data: makeConvRow({ project_id: null }), error: null },
        { data: null, error: null },
      ],
      arc_projects: { data: { id: "proj-new", operator: "evan", name: "Fall Campaign", created_at: "t", updated_at: "t" }, error: null },
    });

    await linkConversationToCampaign("conv-1", "camp-1", "Fall Campaign", supabase);

    // createProject must have been called (arc_projects insert)
    expect(supabase.calls).toContainEqual(["from", "arc_projects"]);
    expect(supabase.calls).toContainEqual(["insert", { operator: "evan", name: "Fall Campaign" }]);

    // Update must set both project_id and campaign_id
    const updateCalls = supabase.calls.filter(([m]) => m === "update").map(([, arg]) => arg as Record<string, unknown>);
    expect(updateCalls).toContainEqual(expect.objectContaining({ project_id: "proj-new", campaign_id: "camp-1" }));
  });

  it("reuses existing projectId without calling createProject", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: [
        { data: makeConvRow({ project_id: "pExisting" }), error: null },
        { data: null, error: null },
      ],
    });

    await linkConversationToCampaign("conv-1", "camp-2", "Unused Name", supabase);

    // No arc_projects interaction
    expect(supabase.calls).not.toContainEqual(["from", "arc_projects"]);

    // Update must use the existing project_id
    const updateCalls = supabase.calls.filter(([m]) => m === "update").map(([, arg]) => arg as Record<string, unknown>);
    expect(updateCalls).toContainEqual(expect.objectContaining({ project_id: "pExisting", campaign_id: "camp-2" }));
  });

  it("is a no-op when getConversation returns null", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: { data: null, error: null },
    });

    await linkConversationToCampaign("conv-missing", "camp-1", "Name", supabase);

    expect(supabase.calls).not.toContainEqual(["from", "arc_projects"]);
    const updateCalls = supabase.calls.filter(([m]) => m === "update");
    expect(updateCalls).toHaveLength(0);
  });
});

describe("completeArcMessage", () => {
  it("writes mentions onto the row when provided", async () => {
    const supabase = createSupabaseQueryMock({ arc_messages: { data: null, error: null } });
    await completeArcMessage(
      {
        messageId: "m1",
        body: "done",
        metadata: { actions: [] },
        mentions: [{ type: "lead", id: "L1", label: "Dana", href: "/crm/leads/L1" }],
      },
      supabase,
    );
    const update = calls(supabase, "update")[0];
    expect(update).toMatchObject({
      body: "done",
      status: "complete",
      mentions: [{ type: "lead", id: "L1", label: "Dana", href: "/crm/leads/L1" }],
    });
  });

  it("omits the mentions key when not provided (no clobber)", async () => {
    const supabase = createSupabaseQueryMock({ arc_messages: { data: null, error: null } });
    await completeArcMessage({ messageId: "m1", body: "done" }, supabase);
    const update = calls(supabase, "update")[0];
    expect(update).not.toHaveProperty("mentions");
  });
});

describe("findPendingMessageByTask", () => {
  it("verifies the agent task belongs to the resolved Arc workspace before reading the pending message", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: { id: "task-1" }, error: null },
      arc_messages: {
        data: {
          id: "m1",
          conversation_id: "c1",
          role: "arc",
          body: "",
          status: "pending",
          agent_task_id: "task-1",
          mentions: [],
          metadata: {},
          created_at: "t",
        },
        error: null,
      },
    });

    const pending = await findPendingMessageByTask("task-1", supabase, { orgId: "org-1", workspaceId: "workspace-1" });

    expect(pending?.id).toBe("m1");
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual(["eq", "id", "task-1"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
  });

  it("does not read arc_messages when the scoped task is missing", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: null, error: null },
      arc_messages: {
        data: {
          id: "m1",
          conversation_id: "c1",
          role: "arc",
          body: "",
          status: "pending",
          agent_task_id: "task-1",
          mentions: [],
          metadata: {},
          created_at: "t",
        },
        error: null,
      },
    });

    await expect(findPendingMessageByTask("task-1", supabase, { orgId: "org-1", workspaceId: "workspace-1" })).resolves.toBeNull();

    expect(supabase.calls.filter((call) => call[0] === "from" && call[1] === "arc_messages")).toHaveLength(0);
  });
});

describe("appendArcStep", () => {
  it("verifies the agent task belongs to the resolved Arc workspace before updating steps", async () => {
    const supabase = createSupabaseQueryMock({
      agent_tasks: { data: { id: "task-1" }, error: null },
      arc_messages: [
        { data: { id: "m1", metadata: {} }, error: null },
        { data: null, error: null },
      ],
    });

    const applied = await appendArcStep(
      { agentTaskId: "task-1", label: "Checking leads", status: "running", at: "2026-06-19T12:00:00.000Z" },
      supabase,
      { orgId: "org-1", workspaceId: "workspace-1" },
    );

    expect(applied).toBe(true);
    expect(supabase.calls).toContainEqual(["from", "agent_tasks"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(supabase.calls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
  });
});
