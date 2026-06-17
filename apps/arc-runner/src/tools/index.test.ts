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
const sink = { card: () => {}, suggestion: () => {}, source: () => {}, question: () => {} };

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
  "read_performance",
  "emit_card",
  "suggest_followups",
  "cite_sources",
  "ask_operator",
];
const WRITE = ["record_brain_note", "link_brain_nodes", "log_interaction"];
const DRAFT = ["create_campaign_draft", "generate_image"];

describe("toolsForMode", () => {
  it("ask mode exposes only read tools (no writes)", () => {
    const names = toolsForMode("ask", stubClient, step, sink).map((t) => t.name).sort();
    expect(names).toEqual([...READ].sort());
  });

  it("act mode adds the write tools and draft work products", () => {
    const names = toolsForMode("act", stubClient, step, sink).map((t) => t.name).sort();
    expect(names).toEqual([...READ, ...WRITE, ...DRAFT].sort());
  });

  it("act mode can create drafts and generate images", () => {
    const names = toolsForMode("act", stubClient, step, sink).map((t) => t.name);
    expect(names).toContain("create_campaign_draft");
    expect(names).toContain("generate_image");
  });

  it("draft mode exposes the same tools as act", () => {
    const names = toolsForMode("draft", stubClient, step, sink).map((t) => t.name).sort();
    expect(names).toEqual([...READ, ...WRITE, ...DRAFT].sort());
  });

  it("ask mode excludes draft work products", () => {
    const names = toolsForMode("ask", stubClient, step, sink).map((t) => t.name);
    expect(names).not.toContain("create_campaign_draft");
    expect(names).not.toContain("generate_image");
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
