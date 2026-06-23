import { describe, expect, it } from "vitest";

import { SLASH_COMMANDS, matchSlash, filterCommands } from "./slash-commands";

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
  it("attaches runner skill ids to commands that need scoped tool access", () => {
    expect(SLASH_COMMANDS.find((c) => c.cmd === "/find-leads")?.skillId).toBe("opportunity-discovery");
    expect(SLASH_COMMANDS.find((c) => c.cmd === "/draft-campaign")?.skillId).toBe("approval-gated-drafting");
    expect(SLASH_COMMANDS.find((c) => c.cmd === "/signals")?.skillId).toBe("company-research");
  });
});

describe("filterCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });
  it("matches against cmd, label, and hint (case-insensitive)", () => {
    const out = filterCommands("pending");
    expect(out.some((c) => c.cmd === "/whats-pending")).toBe(true);
  });
  it("is subsequence-fuzzy, not just substring", () => {
    // "dc" -> /draft-campaign (d…c subsequence across the command)
    const out = filterCommands("dc");
    expect(out.some((c) => c.cmd === "/draft-campaign")).toBe(true);
  });
  it("returns empty for no match", () => {
    expect(filterCommands("zzzzz")).toHaveLength(0);
  });
});
