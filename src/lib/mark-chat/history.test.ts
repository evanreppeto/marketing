import { describe, expect, it } from "vitest";

import { buildWakeHistory, type WakeHistoryTurn } from "./history";
import type { MarkMessage } from "./persistence";

function msg(over: Partial<MarkMessage>): MarkMessage {
  return {
    id: "m",
    conversationId: "c1",
    role: "operator",
    body: "hi",
    status: "sent",
    agentTaskId: null,
    mentions: [],
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments: [],
    createdAt: "2026-06-16T00:00:00Z",
    ...over,
  };
}

describe("buildWakeHistory", () => {
  it("maps operator → operator and mark → arc, in order", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "operator", body: "find leads", status: "sent" }),
      msg({ id: "2", role: "mark", body: "found 3", status: "complete" }),
    ]);
    expect(out).toEqual<WakeHistoryTurn[]>([
      { role: "operator", body: "find leads" },
      { role: "arc", body: "found 3" },
    ]);
  });

  it("drops pending, failed, empty-body, and system messages", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "mark", body: "", status: "pending" }),
      msg({ id: "2", role: "mark", body: "oops", status: "failed" }),
      msg({ id: "3", role: "system", body: "system note", status: "complete" }),
      msg({ id: "4", role: "operator", body: "real", status: "sent" }),
    ]);
    expect(out).toEqual<WakeHistoryTurn[]>([{ role: "operator", body: "real" }]);
  });

  it("excludes the current message by id", () => {
    const out = buildWakeHistory(
      [
        msg({ id: "1", role: "operator", body: "old", status: "sent" }),
        msg({ id: "cur", role: "operator", body: "current", status: "sent" }),
      ],
      { excludeId: "cur" },
    );
    expect(out).toEqual<WakeHistoryTurn[]>([{ role: "operator", body: "old" }]);
  });

  it("keeps only the most recent `limit` turns", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      msg({ id: String(i), role: "operator", body: `m${i}`, status: "sent" }),
    );
    const out = buildWakeHistory(many, { limit: 3 });
    expect(out.map((t) => t.body)).toEqual(["m17", "m18", "m19"]);
  });
});
