import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getRecordTimeline, getRecordNotes, getRecordTasks } from "./read-model";

const ORG = "00000000-0000-0000-0000-000000000001";

describe("getRecordTimeline", () => {
  it("shapes activity rows with actor badge + tone and scopes by org", async () => {
    const supabase = createSupabaseQueryMock({
      crm_activities: {
        data: [
          {
            id: "a1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            activity_type: "note_added",
            summary: "Note added",
            detail: "Left a voicemail",
            actor_kind: "human",
            actor_name: "Evan",
            occurred_at: "2026-06-12T10:00:00.000Z",
            metadata: {},
          },
        ],
        error: null,
      },
    });

    const result = await getRecordTimeline("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.entries[0]).toMatchObject({
      id: "a1",
      activityType: "note_added",
      summary: "Note added",
      actorLabel: "Evan",
      actorKind: "human",
    });
    expect(supabase.calls).toContainEqual(["eq", "org_id", ORG]);
    expect(supabase.calls).toContainEqual(["eq", "entity_type", "lead"]);
    expect(supabase.calls).toContainEqual(["eq", "entity_id", "lead-1"]);
  });

  it("reports unavailable when the query errors", async () => {
    const supabase = createSupabaseQueryMock({
      crm_activities: { data: null, error: { message: "boom" } },
    });
    const result = await getRecordTimeline("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("unavailable");
  });
});

describe("getRecordTasks", () => {
  it("derives urgency from due_at relative to now", async () => {
    const supabase = createSupabaseQueryMock({
      crm_tasks: {
        data: [
          {
            id: "t1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            title: "Send estimate",
            description: null,
            due_at: "2000-01-01T00:00:00.000Z",
            priority: "high",
            status: "open",
            assignee_kind: "human",
            assignee_name: "Evan",
            completed_at: null,
            author_kind: "human",
            author_name: "Evan",
            created_at: "2026-06-10T00:00:00.000Z",
            updated_at: "2026-06-10T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await getRecordTasks("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.tasks[0]).toMatchObject({ id: "t1", urgency: "overdue", priority: "high" });
  });

  it("reports unavailable when the query errors", async () => {
    const supabase = createSupabaseQueryMock({
      crm_tasks: { data: null, error: { message: "boom" } },
    });
    const result = await getRecordTasks("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("unavailable");
  });
});

describe("getRecordNotes", () => {
  it("orders pinned notes first", async () => {
    const supabase = createSupabaseQueryMock({
      crm_notes: {
        data: [
          {
            id: "n1",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            body: "Plain note",
            is_pinned: false,
            is_internal: false,
            author_kind: "human",
            author_name: "Evan",
            created_at: "2026-06-12T09:00:00.000Z",
            updated_at: "2026-06-12T09:00:00.000Z",
          },
          {
            id: "n2",
            org_id: ORG,
            entity_type: "lead",
            entity_id: "lead-1",
            body: "Pinned note",
            is_pinned: true,
            is_internal: true,
            author_kind: "agent",
            author_name: "Arc",
            created_at: "2026-06-12T08:00:00.000Z",
            updated_at: "2026-06-12T08:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await getRecordNotes("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.notes.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(result.notes[0]).toMatchObject({ isPinned: true, actorKind: "agent", actorLabel: "Arc" });
  });

  it("reports unavailable when the query errors", async () => {
    const supabase = createSupabaseQueryMock({
      crm_notes: { data: null, error: { message: "boom" } },
    });
    const result = await getRecordNotes("lead", "lead-1", ORG, supabase);
    expect(result.status).toBe("unavailable");
  });
});
