import { describe, expect, it } from "vitest";

import { BSR_CONTEXT } from "./business-context";
import { buildSystemPrompt, formatHistory, modelForRoute, type ArcTurnContext } from "./context";

const baseCtx: ArcTurnContext = {
  business: BSR_CONTEXT,
  mode: "ask",
  scope: { conversationId: "c1", projectId: null, campaignId: null, operator: "Evan" },
  mentions: [],
};

describe("modelForRoute", () => {
  it("maps standard to Opus", () => {
    expect(modelForRoute("standard")).toBe("claude-opus-4-8");
  });
  it("maps fast to Haiku", () => {
    expect(modelForRoute("fast")).toBe("claude-haiku-4-5");
  });
});

describe("formatHistory", () => {
  it("returns empty string for no turns", () => {
    expect(formatHistory(undefined)).toBe("");
    expect(formatHistory([])).toBe("");
  });
  it("renders operator and arc turns in order with a header", () => {
    const out = formatHistory([
      { role: "operator", body: "find me leads" },
      { role: "arc", body: "Found 3." },
    ]);
    expect(out).toContain("Conversation so far");
    expect(out.indexOf("find me leads")).toBeLessThan(out.indexOf("Found 3."));
    expect(out).toContain("Operator:");
    expect(out).toContain("Arc:");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the base prompt and the business name", () => {
    const out = buildSystemPrompt("BASE_PROMPT", baseCtx);
    expect(out).toContain("BASE_PROMPT");
    expect(out).toContain(BSR_CONTEXT.businessName);
  });
  it("states read-only stance for ask mode", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, mode: "ask" });
    expect(out.toLowerCase()).toContain("read-only");
  });
  it("includes the persona taxonomy", () => {
    const out = buildSystemPrompt("BASE", baseCtx);
    expect(out).toContain("persona_homeowner_emergency");
    expect(out).toContain("Emergency Homeowner");
  });
  it("describes act mode: CRM interactions allowed, core CRM and drafts not", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, mode: "act" });
    expect(out).toContain("MODE: act");
    expect(out.toLowerCase()).toContain("interactions");
    expect(out.toLowerCase()).toContain("may not");
  });
  it("permits drafts in draft mode and never outbound", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, mode: "draft" });
    expect(out.toLowerCase()).toContain("draft");
    expect(out.toLowerCase()).toContain("approval");
  });
  it("names the project and campaign when scoped", () => {
    const out = buildSystemPrompt("BASE", {
      ...baseCtx,
      scope: { conversationId: "c1", projectId: "p1", campaignId: "camp1", operator: "Evan" },
    });
    expect(out).toContain("p1");
    expect(out).toContain("camp1");
  });
  it("lists mentions when present", () => {
    const out = buildSystemPrompt("BASE", {
      ...baseCtx,
      mentions: [{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }],
    });
    expect(out).toContain("Dana Kasprak");
  });
  it("includes behavior hints when provided", () => {
    const out = buildSystemPrompt("BASE", { ...baseCtx, assistantTone: "warm", assistantResponseStyle: "concise" });
    expect(out).toContain("warm");
    expect(out).toContain("concise");
  });
});
