import { describe, expect, it } from "vitest";

import { parseInstalledArcSkillKeys } from "./installation";

describe("Arc skill installation", () => {
  it("keeps unique library skill keys and rejects unknown values", () => {
    expect(parseInstalledArcSkillKeys([
      "competitor-watch",
      "unknown-skill",
      "competitor-watch",
      42,
      "storm-signal-monitor",
    ])).toEqual(["competitor-watch", "storm-signal-monitor"]);
  });

  it("treats malformed settings as an empty installation", () => {
    expect(parseInstalledArcSkillKeys(null)).toEqual([]);
    expect(parseInstalledArcSkillKeys({ key: "competitor-watch" })).toEqual([]);
  });
});
