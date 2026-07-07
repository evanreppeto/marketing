import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("record interactions demo fallback", () => {
  const SUPABASE_ENV = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_MARKETING_SUPABASE_URL",
    "MARKETING_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MARKETING_SUPABASE_SERVICE_ROLE_KEY",
  ];

  afterEach(() => vi.unstubAllEnvs());

  function unconfigureSupabase() {
    for (const key of SUPABASE_ENV) vi.stubEnv(key, "");
  }

  it("serves a populated timeline, notes, and tasks when unconfigured + demo on", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const timeline = await getRecordTimeline("company", "demo-co-1", ORG);
    const notes = await getRecordNotes("company", "demo-co-1", ORG);
    const tasks = await getRecordTasks("company", "demo-co-1", ORG);

    expect(timeline.status).toBe("live");
    expect(notes.status).toBe("live");
    expect(tasks.status).toBe("live");
    if (timeline.status !== "live" || notes.status !== "live" || tasks.status !== "live") return;

    expect(timeline.entries.length).toBeGreaterThan(0);
    // Notes come pinned-first.
    expect(notes.notes[0]?.isPinned).toBe(true);
    // Tasks include at least one open and one completed follow-up.
    expect(tasks.tasks.some((t) => t.status === "open")).toBe(true);
    expect(tasks.tasks.some((t) => t.status === "completed")).toBe(true);
  });

  it("varies the story by entity type (a lead reads differently from a company)", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "1");

    const lead = await getRecordTimeline("lead", "demo-ld-1", ORG);
    const company = await getRecordTimeline("company", "demo-co-1", ORG);
    if (lead.status !== "live" || company.status !== "live") throw new Error("expected live");

    const leadStatus = lead.entries.find((e) => e.activityType === "status_changed")?.detail;
    const companyStatus = company.entries.find((e) => e.activityType === "status_changed")?.detail;
    expect(leadStatus).toBeTruthy();
    expect(leadStatus).not.toEqual(companyStatus);
  });

  it("stays unavailable (no crash) when demo mode is off", async () => {
    unconfigureSupabase();
    vi.stubEnv("ARC_DEMO_DATA", "0");

    expect((await getRecordTimeline("company", "x", ORG)).status).toBe("unavailable");
    expect((await getRecordNotes("company", "x", ORG)).status).toBe("unavailable");
    expect((await getRecordTasks("company", "x", ORG)).status).toBe("unavailable");
  });
});
