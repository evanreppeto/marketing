import { describe, expect, it } from "vitest";

import type { ArcThreadGroupVM } from "./read-model";
import { filterThreadGroups } from "./thread-filter";

const groups: ArcThreadGroupVM[] = [
  {
    group: "Today",
    items: [
      { id: "storm", title: "Storm-damage homeowners", when: "9:38 AM", active: true, pinned: true, running: false },
      { id: "past", title: "Past-customer outreach", when: "8:12 AM", active: false, pinned: false, running: false },
    ],
  },
  {
    group: "Yesterday",
    items: [
      { id: "noaa", title: "NOAA hail report read", when: "2:10 PM", active: false, pinned: false, running: false },
    ],
  },
];

describe("filterThreadGroups", () => {
  it("filters conversations by title without leaving empty groups", () => {
    expect(filterThreadGroups(groups, "NOAA")).toEqual([
      {
        group: "Yesterday",
        items: [groups[1]!.items[0]],
      },
    ]);
  });

  it("matches group and time metadata", () => {
    expect(filterThreadGroups(groups, "8:12")[0]?.items.map((item) => item.id)).toEqual(["past"]);
    expect(filterThreadGroups(groups, "yesterday")[0]?.items.map((item) => item.id)).toEqual(["noaa"]);
  });

  it("returns the original grouping for an empty query", () => {
    expect(filterThreadGroups(groups, "  ")).toBe(groups);
  });
});
