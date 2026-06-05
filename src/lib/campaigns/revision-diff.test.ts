import { describe, expect, it } from "vitest";

import { diffLines } from "./revision-diff";

describe("diffLines", () => {
  it("marks added, removed, and unchanged lines", () => {
    const result = diffLines("Hello\nold line\nFooter", "Hello\nnew line\nFooter");
    expect(result).toEqual([
      { kind: "same", text: "Hello" },
      { kind: "removed", text: "old line" },
      { kind: "added", text: "new line" },
      { kind: "same", text: "Footer" },
    ]);
  });

  it("returns all-same when identical", () => {
    expect(diffLines("a\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
  });
});
