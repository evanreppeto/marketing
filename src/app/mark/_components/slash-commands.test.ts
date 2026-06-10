import { describe, expect, it } from "vitest";

import { SLASH_COMMANDS, matchSlash } from "./slash-commands";

describe("matchSlash", () => {
  it("returns null when text isn't a leading slash query", () => {
    expect(matchSlash("hello")).toBeNull();
    expect(matchSlash("what /find")).toBeNull();
  });
  it("returns all commands for a bare slash", () => {
    expect(matchSlash("/")).toHaveLength(SLASH_COMMANDS.length);
  });
  it("filters by the typed query (cmd or label)", () => {
    const out = matchSlash("/find");
    expect(out).not.toBeNull();
    expect(out!.length).toBeGreaterThan(0);
    expect(out!.every((c) => c.cmd.includes("find") || c.label.toLowerCase().includes("find"))).toBe(true);
  });
  it("draft-campaign presets draft mode", () => {
    const draft = SLASH_COMMANDS.find((c) => c.cmd === "/draft-campaign");
    expect(draft?.mode).toBe("draft");
  });
});
