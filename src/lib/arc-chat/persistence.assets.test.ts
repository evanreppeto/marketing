import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { listProjectAssetMessages } from "./persistence";

function calls(supabase: MockSupabase, method: string): unknown[][] {
  return supabase.calls.filter(([m]) => m === method).map(([, ...args]) => args);
}

function messageRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    conversation_id: "c2",
    role: "arc",
    body: "",
    status: "complete",
    agent_task_id: null,
    mentions: [],
    metadata: { actions: [{ kind: "draft", title: "Sibling draft" }] },
    created_at: "t",
    ...over,
  };
}

describe("listProjectAssetMessages", () => {
  it("returns [] and never queries messages when the project has no other active conversations", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: { data: [{ id: "cur" }], error: null },
    });
    const out = await listProjectAssetMessages("p1", "Evan", { excludeConversationId: "cur" }, supabase);
    expect(out).toEqual([]);
    // short-circuited before touching arc_messages
    expect(calls(supabase, "from")).toEqual([["arc_conversations"]]);
    expect(calls(supabase, "in")).toEqual([]);
  });

  it("loads asset-bearing mark messages from sibling conversations", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: { data: [{ id: "cur" }, { id: "c2" }], error: null },
      arc_messages: {
        data: [
          messageRow({ id: "m1", conversation_id: "c2" }),
          messageRow({ id: "m2", conversation_id: "c2", metadata: {} }), // no actions -> filtered out
        ],
        error: null,
      },
    });
    const out = await listProjectAssetMessages("p1", "Evan", { excludeConversationId: "cur" }, supabase);
    expect(out).toHaveLength(1);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
    expect(out.every((m) => m.actions.length > 0)).toBe(true);
    // both queries ran, in deterministic order: conversations (operator, project_id, status) then messages (role)
    expect(calls(supabase, "from")).toEqual([["arc_conversations"], ["arc_messages"]]);
    expect(calls(supabase, "eq")).toEqual([
      ["operator", "Evan"],
      ["project_id", "p1"],
      ["status", "active"],
      ["role", "arc"],
    ]);
    // the active conversation is dropped from the IN list
    expect(calls(supabase, "in")[0]).toEqual(["conversation_id", ["c2"]]);
    expect(calls(supabase, "limit")[0]).toEqual([100]);
  });

  it("respects a custom limit", async () => {
    const supabase = createSupabaseQueryMock({
      arc_conversations: { data: [{ id: "c2" }], error: null },
      arc_messages: { data: [], error: null },
    });
    await listProjectAssetMessages("p1", "Evan", { limit: 25 }, supabase);
    expect(calls(supabase, "limit")[0]).toEqual([25]);
  });
});
