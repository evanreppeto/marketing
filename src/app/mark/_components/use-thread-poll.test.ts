import { describe, expect, it } from "vitest";

import { sameMessages } from "./use-thread-poll";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

function msg(over: Partial<MarkMessage>): MarkMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "mark",
    body: "",
    status: "pending",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    createdAt: "t",
    ...over,
  };
}

describe("sameMessages", () => {
  it("is true for identical lists", () => {
    expect(sameMessages([msg({})], [msg({})])).toBe(true);
  });
  it("is false on differing length", () => {
    expect(sameMessages([msg({})], [])).toBe(false);
  });
  it("is false when status changes", () => {
    expect(sameMessages([msg({ status: "pending" })], [msg({ status: "complete" })])).toBe(false);
  });
  it("is false when a step status changes", () => {
    const a = [msg({ steps: [{ label: "Searching", status: "running", at: "t" }] })];
    const b = [msg({ steps: [{ label: "Searching", status: "done", at: "t" }] })];
    expect(sameMessages(a, b)).toBe(false);
  });
});
