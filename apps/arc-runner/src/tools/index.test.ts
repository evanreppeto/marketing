import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import { allowedToolNames, toolsForMode } from "./index";

// A stub client — the assembler only wires tools, it never calls these in the test.
const stubClient = {
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  postChatReply: vi.fn(),
  postStep: vi.fn(),
} as unknown as ArcClient;
const step = vi.fn(async () => {});
const collect = () => {};

const READ = [
  "search_companies",
  "search_contacts",
  "search_leads",
  "get_lead",
  "search_jobs",
  "search_outcomes",
  "search_properties",
  "query_brain",
  "list_campaigns",
  "get_campaign",
  "list_approvals",
  "emit_card",
];
const WRITE = ["record_brain_note", "link_brain_nodes", "log_interaction"];

describe("toolsForMode", () => {
  it("ask mode exposes only read tools (no writes)", () => {
    const names = toolsForMode("ask", stubClient, step, collect).map((t) => t.name).sort();
    expect(names).toEqual([...READ].sort());
  });

  it("act mode adds the write tools", () => {
    const names = toolsForMode("act", stubClient, step, collect).map((t) => t.name).sort();
    expect(names).toEqual([...READ, ...WRITE].sort());
  });

  it("draft mode (this plan) has the same tools as act", () => {
    const act = toolsForMode("act", stubClient, step, collect).map((t) => t.name).sort();
    const draft = toolsForMode("draft", stubClient, step, collect).map((t) => t.name).sort();
    expect(draft).toEqual(act);
  });
});

describe("allowedToolNames", () => {
  it("prefixes each tool with the mcp__arc__ namespace", () => {
    const allowed = allowedToolNames("ask");
    expect(allowed).toContain("mcp__arc__search_leads");
    expect(allowed.every((n) => n.startsWith("mcp__arc__"))).toBe(true);
  });
  it("ask excludes write tools; act includes them", () => {
    expect(allowedToolNames("ask")).not.toContain("mcp__arc__log_interaction");
    expect(allowedToolNames("act")).toContain("mcp__arc__log_interaction");
  });
});
