import { describe, expect, it } from "vitest";

import { RoutingDecisionSchema } from "../routing-decisions";

describe("RoutingDecisionSchema", () => {
  it("parses a snake_case row into a camelCase domain RoutingDecision", () => {
    const row = {
      id: "aaaa1111-1111-4111-8111-111111111111",
      lead_id: "bbbb2222-2222-4222-8222-222222222222",
      decision: "mitigation",
      confidence: 92,
      sla_target_minutes: 15,
      decided_by: "system",
      decided_at: "2026-05-28T12:05:00.000Z",
      rationale: { signal: "standing water" },
      created_at: "2026-05-28T12:05:00.000Z",
    };

    expect(RoutingDecisionSchema.parse(row)).toEqual({
      id: "aaaa1111-1111-4111-8111-111111111111",
      leadId: "bbbb2222-2222-4222-8222-222222222222",
      decision: "mitigation",
      confidence: 92,
      slaTargetMinutes: 15,
      decidedBy: "system",
      decidedAt: "2026-05-28T12:05:00.000Z",
      rationale: { signal: "standing water" },
      createdAt: "2026-05-28T12:05:00.000Z",
    });
  });

  it("rejects an out-of-range confidence", () => {
    expect(() =>
      RoutingDecisionSchema.parse({
        id: "aaaa1111-1111-4111-8111-111111111111",
        lead_id: "bbbb2222-2222-4222-8222-222222222222",
        decision: "mitigation",
        confidence: 250,
        sla_target_minutes: null,
        decided_by: "system",
        decided_at: "2026-05-28T12:05:00.000Z",
        rationale: {},
        created_at: "2026-05-28T12:05:00.000Z",
      }),
    ).toThrow();
  });
});
