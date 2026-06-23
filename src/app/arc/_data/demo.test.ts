import { describe, expect, it } from "vitest";

import type { ArcMessage } from "@/lib/arc-chat/persistence";

import { buildDemoReplyFrames, getDemoChat } from "./demo";

function basePending(): ArcMessage {
  return {
    id: "p1",
    conversationId: "demo-conv-1",
    role: "arc",
    body: "",
    status: "pending",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}

/** Apply every frame in order to a fresh pending message, as ArcChat does. */
function runAll(prompt: string): ArcMessage {
  return buildDemoReplyFrames(prompt).reduce((msg, frame) => frame.apply(msg), basePending());
}

describe("buildDemoReplyFrames", () => {
  it("opens with a single running step (loader → first thinking step)", () => {
    const frames = buildDemoReplyFrames("Draft a campaign");
    expect(frames.length).toBeGreaterThan(0);
    const first = frames[0].apply(basePending());
    expect(first.steps).toHaveLength(1);
    expect(first.steps[0].status).toBe("running");
    expect(first.status).toBe("pending");
  });

  it("every frame has a positive delay so the sequence is paced, not instant", () => {
    for (const frame of buildDemoReplyFrames("hello")) {
      expect(frame.delay).toBeGreaterThan(0);
    }
  });

  it("resolves to a complete reply with body, reasoning, and follow-ups", () => {
    const final = runAll("Find leads in flood zones");
    expect(final.status).toBe("complete");
    expect(final.body.trim().length).toBeGreaterThan(0);
    expect(final.reasoning && final.reasoning.length).toBeTruthy();
    expect(final.suggestions.length).toBeGreaterThan(0);
    // All thinking steps land in the "done" state by the end.
    expect(final.steps.length).toBeGreaterThan(0);
    expect(final.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("echoes the operator's prompt into the reply and truncates long ones", () => {
    const short = runAll("Brief my latest campaign");
    expect(short.body).toContain("Brief my latest campaign");

    const long = "x".repeat(200);
    const final = runAll(long);
    expect(final.body).toContain("…");
    // Never echoes the full 200-char prompt back verbatim.
    expect(final.body).not.toContain(long);
  });

  it("only ever produces valid ArcStep kinds", () => {
    const valid = new Set(["search", "match", "draft", "media", "think", "tool"]);
    for (const frame of buildDemoReplyFrames("anything")) {
      const applied = frame.apply(basePending());
      for (const step of applied.steps) {
        if (step.kind) expect(valid.has(step.kind)).toBe(true);
      }
    }
  });
});

describe("getDemoChat", () => {
  it("brands the preview assistant as Arc (not the bare Agent default)", () => {
    expect(getDemoChat().assistantName).toBe("Arc");
  });
});
