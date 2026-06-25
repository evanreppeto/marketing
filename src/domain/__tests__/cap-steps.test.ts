import { describe, expect, it } from "vitest";

import { capSteps } from "@/domain";

describe("capSteps", () => {
  it("returns all items and hidden:0 when under the cap", () => {
    expect(capSteps([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], hidden: 0 });
  });

  it("caps to max and reports the hidden count", () => {
    expect(capSteps([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ visible: [1, 2, 3, 4, 5], hidden: 2 });
  });

  it("treats max <= 0 as no cap", () => {
    expect(capSteps([1, 2, 3], 0)).toEqual({ visible: [1, 2, 3], hidden: 0 });
  });

  it("handles an empty list", () => {
    expect(capSteps([], 5)).toEqual({ visible: [], hidden: 0 });
  });
});
