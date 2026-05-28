import { describe, expect, it } from "vitest";

import { EventSchema } from "../events";

describe("EventSchema", () => {
  it("parses a snake_case row into a camelCase domain Event", () => {
    const row = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      actor: "system",
      subject_type: "lead",
      subject_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "lead.routed",
      payload: { decision: "mitigation" },
      occurred_at: "2026-05-28T12:00:00.000Z",
      created_at: "2026-05-28T12:00:00.000Z",
    };

    expect(EventSchema.parse(row)).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      actor: "system",
      subjectType: "lead",
      subjectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "lead.routed",
      payload: { decision: "mitigation" },
      occurredAt: "2026-05-28T12:00:00.000Z",
      createdAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it("rejects rows missing required fields", () => {
    expect(() =>
      EventSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        actor: "system",
        subject_type: "lead",
        // subject_id missing
        type: "lead.routed",
        payload: {},
        occurred_at: "2026-05-28T12:00:00.000Z",
        created_at: "2026-05-28T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
