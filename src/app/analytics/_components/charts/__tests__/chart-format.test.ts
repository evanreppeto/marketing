import { describe, expect, it } from "vitest";

import { formatValue } from "../chart-kit";

describe("formatValue", () => {
  it("formats whole-dollar USD", () => {
    expect(formatValue(1250, "usd")).toBe("$1,250");
  });
  it("formats plain numbers as a string", () => {
    expect(formatValue(12, "number")).toBe("12");
  });
  it("defaults to plain number formatting", () => {
    expect(formatValue(7)).toBe("7");
  });
});
