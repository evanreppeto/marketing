import { describe, expect, it } from "vitest";

import { DEMO_SEQUENCE, initialDemoFrame, nextDemoFrame } from "../board-demo";

describe("board demo sequence", () => {
  it("starts queued and not working", () => {
    expect(initialDemoFrame()).toEqual({ step: 0, status: "queued", working: false });
  });

  it("advances queued -> running and marks working only while running", () => {
    const frame = nextDemoFrame(0);
    expect(frame).toEqual({ step: 1, status: "running", working: true });
  });

  it("advances running -> needs_approval (not working)", () => {
    expect(nextDemoFrame(1)).toEqual({ step: 2, status: "needs_approval", working: false });
  });

  it("wraps from the last step back to queued", () => {
    const last = DEMO_SEQUENCE.length - 1;
    expect(nextDemoFrame(last)).toEqual({ step: 0, status: "queued", working: false });
  });

  it("normalizes out-of-range / non-integer input", () => {
    expect(nextDemoFrame(-1)).toEqual({ step: 1, status: "running", working: true });
    expect(nextDemoFrame(3.7)).toEqual({ step: 0, status: "queued", working: false });
  });
});
