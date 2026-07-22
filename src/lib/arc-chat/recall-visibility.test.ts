import { describe, expect, it } from "vitest";

import { ARC_RECALL_PREVIEW_LIMIT, visibleRecallCount } from "./recall-visibility";

describe("visibleRecallCount", () => {
  it("keeps short evidence lists fully visible", () => {
    expect(visibleRecallCount(2, false)).toBe(2);
  });

  it("collapses long evidence lists until expanded", () => {
    expect(visibleRecallCount(8, false)).toBe(ARC_RECALL_PREVIEW_LIMIT);
    expect(visibleRecallCount(8, true)).toBe(8);
  });
});
