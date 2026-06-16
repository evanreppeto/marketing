import { describe, expect, it } from "vitest";

import { mergeStep } from "./persistence";

describe("mergeStep", () => {
  it("appends a running step", () => {
    const next = mergeStep([], { label: "Searching", status: "running", at: "t1" });
    expect(next).toEqual([{ label: "Searching", status: "running", at: "t1" }]);
  });

  it("flips the matching running step to done instead of duplicating", () => {
    const next = mergeStep([{ label: "Searching", status: "running", at: "t1" }], {
      label: "Searching",
      status: "done",
      at: "t2",
    });
    expect(next).toEqual([{ label: "Searching", status: "done", at: "t2" }]);
  });

  it("appends a done step when there is no prior running match", () => {
    const next = mergeStep([{ label: "A", status: "done", at: "t1" }], { label: "B", status: "done", at: "t2" });
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ label: "B", status: "done" });
  });

  it("only flips the most recent matching running step", () => {
    const next = mergeStep(
      [
        { label: "Read page", status: "running", at: "t1" },
        { label: "Read page", status: "running", at: "t2" },
      ],
      { label: "Read page", status: "done", at: "t3" },
    );
    expect(next[0]).toMatchObject({ status: "running" });
    expect(next[1]).toMatchObject({ status: "done", at: "t3" });
  });
});
