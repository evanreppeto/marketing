import { describe, expect, it } from "vitest";

import { mergeActivityEntries, type ActivityEntry } from "./read-model";

function entry(id: string, occurredAt: string): ActivityEntry {
  return {
    id,
    kind: "run",
    tone: "blue",
    title: id,
    detail: "",
    actor: "Agent",
    occurredAt,
    href: null,
  };
}

describe("mergeActivityEntries", () => {
  it("sorts newest-first across sources", () => {
    const merged = mergeActivityEntries(
      [
        entry("a", "2026-05-01T10:00:00Z"),
        entry("c", "2026-05-03T10:00:00Z"),
        entry("b", "2026-05-02T10:00:00Z"),
      ],
      10,
    );
    expect(merged.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("drops entries with no timestamp", () => {
    const merged = mergeActivityEntries([entry("a", "2026-05-01T10:00:00Z"), entry("b", "")], 10);
    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("caps to the requested limit", () => {
    const merged = mergeActivityEntries(
      Array.from({ length: 30 }, (_, i) => entry(`e${i}`, `2026-05-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)),
      5,
    );
    expect(merged).toHaveLength(5);
  });

  it("does not mutate the input array", () => {
    const input = [entry("a", "2026-05-01T10:00:00Z"), entry("b", "2026-05-02T10:00:00Z")];
    const before = input.map((e) => e.id);
    mergeActivityEntries(input, 10);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});
