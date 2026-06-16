import { describe, expect, it } from "vitest";

import {
  deriveTaskUrgency,
  entityTypeFromCrmObjectKey,
  parseNoteInput,
  parseTaskInput,
  parseActivityInput,
} from "../interactions";

describe("parseNoteInput", () => {
  it("accepts a valid note and trims the body", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "  Called the homeowner, left voicemail  ",
      authorKind: "human",
      authorName: "Evan",
      isInternal: true,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        entityType: "contact",
        entityId: "11111111-1111-1111-1111-111111111111",
        body: "Called the homeowner, left voicemail",
        isPinned: false,
        isInternal: true,
        authorKind: "human",
        authorName: "Evan",
      },
    });
  });

  it("rejects an empty body", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "   ",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "A note needs some text." });
  });

  it("rejects an unknown entity type", () => {
    const result = parseNoteInput({
      entityType: "spaceship",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "hi",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "Unknown record type." });
  });

  it("rejects an empty entityId", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "   ",
      body: "hi",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "A note needs a record to attach to." });
  });

  it("rejects an unknown authorKind", () => {
    const result = parseNoteInput({
      entityType: "contact",
      entityId: "11111111-1111-1111-1111-111111111111",
      body: "hi",
      authorKind: "bot",
    });
    expect(result).toEqual({ ok: false, error: "Unknown author." });
  });
});

describe("parseTaskInput", () => {
  it("accepts a valid task with defaults", () => {
    const result = parseTaskInput({
      entityType: "lead",
      entityId: "22222222-2222-2222-2222-222222222222",
      title: "Follow up on water damage estimate",
      authorKind: "agent",
      authorName: "Arc",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.priority).toBe("normal");
    expect(result.value.status).toBe("open");
    expect(result.value.title).toBe("Follow up on water damage estimate");
  });

  it("rejects an empty title", () => {
    const result = parseTaskInput({ title: "  ", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "A task needs a title." });
  });

  it("rejects a bad priority", () => {
    const result = parseTaskInput({ title: "x", priority: "yesterday", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "Unknown task priority." });
  });

  it("rejects an entity id without an entity type", () => {
    const result = parseTaskInput({
      entityId: "22222222-2222-2222-2222-222222222222",
      title: "x",
      authorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "A linked task needs both a record type and id." });
  });

  it("rejects a bad status", () => {
    const result = parseTaskInput({ title: "x", status: "frozen", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "Unknown task status." });
  });

  it("rejects a bad assigneeKind", () => {
    const result = parseTaskInput({ title: "x", assigneeKind: "robot", authorKind: "human" });
    expect(result).toEqual({ ok: false, error: "Unknown assignee." });
  });
});

describe("parseActivityInput", () => {
  it("accepts a logged call", () => {
    const result = parseActivityInput({
      entityType: "company",
      entityId: "33333333-3333-3333-3333-333333333333",
      activityType: "call_logged",
      summary: "Spoke with facilities manager",
      actorKind: "human",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown activity type", () => {
    const result = parseActivityInput({
      entityType: "company",
      entityId: "33333333-3333-3333-3333-333333333333",
      activityType: "telepathy",
      summary: "x",
      actorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "Unknown activity type." });
  });

  it("rejects an empty summary", () => {
    const result = parseActivityInput({
      entityType: "company",
      entityId: "33333333-3333-3333-3333-333333333333",
      activityType: "call_logged",
      summary: "   ",
      actorKind: "human",
    });
    expect(result).toEqual({ ok: false, error: "An activity needs a summary." });
  });
});

describe("deriveTaskUrgency", () => {
  const now = new Date("2026-06-12T12:00:00.000Z");

  it("returns none when there is no due date", () => {
    expect(deriveTaskUrgency(null, now)).toBe("none");
  });

  it("returns overdue when due in the past", () => {
    expect(deriveTaskUrgency("2026-06-11T12:00:00.000Z", now)).toBe("overdue");
  });

  it("returns due_today when due on the same UTC day", () => {
    expect(deriveTaskUrgency("2026-06-12T23:00:00.000Z", now)).toBe("due_today");
  });

  it("returns upcoming when due in the future on a later day", () => {
    expect(deriveTaskUrgency("2026-06-15T08:00:00.000Z", now)).toBe("upcoming");
  });

  it("returns due_today when due earlier on the same UTC day as now", () => {
    const laterNow = new Date("2026-06-12T12:00:00.000Z");
    expect(deriveTaskUrgency("2026-06-12T08:00:00.000Z", laterNow)).toBe("due_today");
  });

  it("returns none for an invalid date string", () => {
    expect(deriveTaskUrgency("not-a-date", now)).toBe("none");
  });
});

describe("entityTypeFromCrmObjectKey", () => {
  it("maps plural object keys to singular entity types", () => {
    expect(entityTypeFromCrmObjectKey("companies")).toBe("company");
    expect(entityTypeFromCrmObjectKey("properties")).toBe("property");
    expect(entityTypeFromCrmObjectKey("outcomes")).toBe("outcome");
  });

  it("maps contacts, leads, and jobs to their singular forms", () => {
    expect(entityTypeFromCrmObjectKey("contacts")).toBe("contact");
    expect(entityTypeFromCrmObjectKey("leads")).toBe("lead");
    expect(entityTypeFromCrmObjectKey("jobs")).toBe("job");
  });

  it("returns null for an unknown key", () => {
    expect(entityTypeFromCrmObjectKey("widgets")).toBeNull();
  });
});
