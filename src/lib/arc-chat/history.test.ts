import { describe, expect, it } from "vitest";

import { buildWakeHistory, planWakeHistory, type WakeHistoryTurn } from "./history";
import type { ArcMessage } from "./persistence";

function msg(over: Partial<ArcMessage>): ArcMessage {
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
  it("keeps operator and arc turns, in order", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "operator", body: "find leads", status: "sent" }),
      msg({ id: "2", role: "arc", body: "found 3", status: "complete" }),
    ]);
    expect(out).toEqual<WakeHistoryTurn[]>([
      { role: "operator", body: "find leads" },
      { role: "arc", body: "found 3" },
    ]);
  });

  it("drops pending, failed, empty-body, and system messages", () => {
    const out = buildWakeHistory([
      msg({ id: "1", role: "arc", body: "", status: "pending" }),
      msg({ id: "2", role: "arc", body: "oops", status: "failed" }),
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

  it("by default keeps far more than the old 12-turn cut (token-budgeted window)", () => {
    // 50 short turns fit comfortably in the default token budget — the old fixed
    // 12-turn cap would have dropped 38 of them.
    const many = Array.from({ length: 50 }, (_, i) =>
      msg({ id: String(i), role: "operator", body: `m${i}`, status: "sent" }),
    );
    const out = buildWakeHistory(many);
    expect(out).toHaveLength(50);
    expect(out[0].body).toBe("m0");
    expect(out.at(-1)?.body).toBe("m49");
  });

  it("drops the oldest turns once the token budget is exceeded, keeping the newest", () => {
    const big = "x".repeat(4000); // ~1000 tokens each
    const many = Array.from({ length: 40 }, (_, i) =>
      msg({ id: String(i), role: "operator", body: `${i}-${big}`, status: "sent" }),
    );
    const out = buildWakeHistory(many, { tokenBudget: 5000 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(40);
    // Whatever survives is the tail of the conversation, oldest-first.
    expect(out.at(-1)?.body.startsWith("39-")).toBe(true);
  });

  it("always keeps at least the latest turn even if it alone blows the budget", () => {
    const huge = "y".repeat(100_000);
    const out = buildWakeHistory([msg({ id: "1", role: "operator", body: huge, status: "sent" })], { tokenBudget: 10 });
    expect(out).toHaveLength(1);
  });
});

describe("planWakeHistory (compaction planner)", () => {
  const big = "x".repeat(4000); // ~1000 tokens each
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => msg({ id: String(i), role: "operator", body: `${i}-${big}`, status: "sent" }));

  it("no overflow when everything fits the budget", () => {
    const plan = planWakeHistory(many(3), { tokenBudget: 100_000 });
    expect(plan.verbatim).toHaveLength(3);
    expect(plan.overflow).toBeNull();
  });

  it("splits older turns into overflow with the correct through-id", () => {
    const plan = planWakeHistory(many(10), { tokenBudget: 3000 });
    expect(plan.verbatim.length).toBeGreaterThan(0);
    expect(plan.overflow).not.toBeNull();
    // verbatim is the tail; overflow is the head, and together they cover all 10.
    expect(plan.verbatim.length + (plan.overflow?.turns.length ?? 0)).toBe(10);
    // through-id is the last (newest) overflow turn = the one just before the window.
    const overflowCount = plan.overflow!.turns.length;
    expect(plan.overflow!.throughMessageId).toBe(String(overflowCount - 1));
  });

  it("excludes turns already folded into the summary (marker)", () => {
    const plan = planWakeHistory(many(10), { tokenBudget: 100_000, summaryThroughMessageId: "4" });
    // messages 0–4 are summarized; only 5–9 remain, all verbatim.
    expect(plan.verbatim).toHaveLength(5);
    expect(plan.verbatim[0].body.startsWith("5-")).toBe(true);
    expect(plan.overflow).toBeNull();
  });
});
