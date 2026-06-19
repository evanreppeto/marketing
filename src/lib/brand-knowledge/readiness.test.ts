import { describe, expect, it } from "vitest";

import { summarizeBrandSourceReadiness } from "./readiness";

describe("summarizeBrandSourceReadiness", () => {
  it("counts Arc-readable brand sources that have not produced Brain notes yet", () => {
    const summary = summarizeBrandSourceReadiness(
      [
        { asset: { id: "new-file", availableToArc: true } },
        { asset: { id: "learned-file", availableToArc: true } },
        { asset: { id: "private-file", availableToArc: false } },
      ],
      [
        { refTable: "media_assets", refId: "learned-file" },
      ],
    );

    expect(summary).toEqual({
      total: 3,
      readyToLearn: 1,
      learned: 1,
      blocked: 1,
    });
  });
});
