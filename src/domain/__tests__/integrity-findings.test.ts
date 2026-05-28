import { describe, expect, it } from "vitest";

import { IntegrityFindingSchema } from "../integrity-findings";

describe("IntegrityFindingSchema", () => {
  it("parses a snake_case row with an unresolved finding", () => {
    const row = {
      id: "cccc1111-1111-4111-8111-111111111111",
      rule_key: "missing_email",
      subject_type: "contact",
      subject_id: "dddd2222-2222-4222-8222-222222222222",
      severity: "warning",
      detail: { field: "email" },
      detected_at: "2026-05-28T11:00:00.000Z",
      resolved_at: null,
      created_at: "2026-05-28T11:00:00.000Z",
      updated_at: "2026-05-28T11:00:00.000Z",
    };

    expect(IntegrityFindingSchema.parse(row)).toEqual({
      id: "cccc1111-1111-4111-8111-111111111111",
      ruleKey: "missing_email",
      subjectType: "contact",
      subjectId: "dddd2222-2222-4222-8222-222222222222",
      severity: "warning",
      detail: { field: "email" },
      detectedAt: "2026-05-28T11:00:00.000Z",
      resolvedAt: null,
      createdAt: "2026-05-28T11:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("parses a resolved finding", () => {
    const parsed = IntegrityFindingSchema.parse({
      id: "cccc1111-1111-4111-8111-111111111111",
      rule_key: "duplicate_company",
      subject_type: "company",
      subject_id: "eeee3333-3333-4333-8333-333333333333",
      severity: "blocking",
      detail: { duplicate_of: "ffff4444-4444-4444-8444-444444444444" },
      detected_at: "2026-05-27T10:00:00.000Z",
      resolved_at: "2026-05-28T12:00:00.000Z",
      created_at: "2026-05-27T10:00:00.000Z",
      updated_at: "2026-05-28T12:00:00.000Z",
    });

    expect(parsed.resolvedAt).toBe("2026-05-28T12:00:00.000Z");
    expect(parsed.severity).toBe("blocking");
  });
});
