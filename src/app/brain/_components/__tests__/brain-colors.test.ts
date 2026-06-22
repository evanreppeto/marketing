import { describe, expect, it } from "vitest";

import { sourceCounts } from "../brain-colors";

const node = (over: Partial<Parameters<typeof sourceCounts>[0][number]> = {}) => ({
  kind: "proof_point",
  source: null,
  createdBy: "arc",
  refTable: null,
  refId: null,
  tags: [] as string[],
  ...over,
});

describe("sourceCounts", () => {
  it("buckets nodes by source system with a total", () => {
    const counts = sourceCounts([
      node({ refTable: "leads", refId: "l1" }),
      node({ refTable: "media_assets", refId: "a1" }),
      node({ refTable: "media_assets", refId: "a2", tags: ["brand-source"] }),
      node({ createdBy: "arc" }),
      node({ createdBy: "arc" }),
    ]);
    expect(counts.all).toBe(5);
    expect(counts.bySystem.crm).toBe(1);
    expect(counts.bySystem.library).toBe(1);
    expect(counts.bySystem.brand).toBe(1);
    expect(counts.bySystem.arc).toBe(2);
  });
});
