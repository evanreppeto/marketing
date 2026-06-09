import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { createProject, assignConversationToProject, unarchiveConversation } from "./persistence";

function calls(supabase: MockSupabase, method: string): Array<Record<string, unknown>> {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("mark projects / archive persistence", () => {
  it("createProject inserts a project for the operator and returns it", async () => {
    const supabase = createSupabaseQueryMock({
      mark_projects: { data: { id: "p1", operator: "Evan", name: "Storm Q3", created_at: "t", updated_at: "t" }, error: null },
    });
    const project = await createProject({ operator: "Evan", name: "Storm Q3" }, supabase);
    expect(project.id).toBe("p1");
    expect(calls(supabase, "insert")[0]).toMatchObject({ operator: "Evan", name: "Storm Q3" });
  });

  it("assignConversationToProject updates the conversation's project_id", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });
    await assignConversationToProject("c1", "p1", supabase);
    expect(calls(supabase, "update")[0]).toMatchObject({ project_id: "p1" });
  });

  it("assignConversationToProject can clear the project (null)", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });
    await assignConversationToProject("c1", null, supabase);
    expect(calls(supabase, "update")[0]).toMatchObject({ project_id: null });
  });

  it("unarchiveConversation sets status back to active", async () => {
    const supabase = createSupabaseQueryMock({ mark_conversations: { data: null, error: null } });
    await unarchiveConversation("c1", supabase);
    expect(calls(supabase, "update")[0]).toMatchObject({ status: "active" });
  });
});
