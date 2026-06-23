import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type ArcTurnContext } from "./context";
import { NEUTRAL_CONTEXT } from "./business-context";

function ctx(memory: ArcTurnContext["memory"]): ArcTurnContext {
  return {
    business: NEUTRAL_CONTEXT,
    mode: "ask",
    scope: { conversationId: "c1", projectId: null, campaignId: null, operator: "ev" },
    mentions: [],
    memory,
  };
}

describe("memory block in buildSystemPrompt", () => {
  it("renders recalled memory lines when present", () => {
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "Flood angle wins", summary: "lead with 24/7 response", kind: "messaging_angle" },
    ]));
    expect(prompt).toContain("WHAT YOU REMEMBER");
    expect(prompt).toContain("Flood angle wins");
    expect(prompt).toContain("lead with 24/7 response");
  });

  it("omits the block when memory is empty or undefined", () => {
    expect(buildSystemPrompt("BASE", ctx([]))).not.toContain("WHAT YOU REMEMBER");
    expect(buildSystemPrompt("BASE", ctx(undefined))).not.toContain("WHAT YOU REMEMBER");
  });

  it("renders related connection lines as indented sub-lines", () => {
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "Flood angle", summary: "lead 24/7", kind: "messaging_angle", related: ["—proves→ 24/7 response (proof_point)"] },
    ]));
    expect(prompt).toContain("- Flood angle — lead 24/7 · messaging_angle");
    expect(prompt).toContain("    —proves→ 24/7 response (proof_point)");
  });
});
