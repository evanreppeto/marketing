import { describe, expect, it, vi } from "vitest";

import { buildOpportunityDigest, postSlackWebhook, type DigestOpportunity } from "./notify";

const opp = (title: string, urgency: DigestOpportunity["urgency"], confidence: number): DigestOpportunity => ({ title, urgency, confidence });

describe("buildOpportunityDigest", () => {
  it("summarizes the count + high-urgency, sorted by urgency then confidence", () => {
    const msg = buildOpportunityDigest([
      opp("Low thing", "low", 40),
      opp("Urgent A", "high", 70),
      opp("Urgent B", "high", 90),
      opp("Medium", "medium", 60),
    ]);
    expect(msg.text).toContain("4 open opportunities");
    const block = (msg.blocks?.[0] as { text: { text: string } }).text.text;
    // high-90 before high-70 before medium before low
    expect(block.indexOf("Urgent B")).toBeLessThan(block.indexOf("Urgent A"));
    expect(block.indexOf("Urgent A")).toBeLessThan(block.indexOf("Medium"));
    expect(block.indexOf("Medium")).toBeLessThan(block.indexOf("Low thing"));
    expect(block).toContain("2 high-urgency");
  });

  it("caps the list and notes the overflow", () => {
    const many = Array.from({ length: 12 }, (_, i) => opp(`Item ${i}`, "low", 50 - i));
    const block = (buildOpportunityDigest(many).blocks?.[0] as { text: { text: string } }).text.text;
    expect(block).toContain("…and 4 more."); // 12 - 8 cap
  });

  it("handles the empty case without a block list", () => {
    const msg = buildOpportunityDigest([], { workspaceName: "BSR" });
    expect(msg.text).toBe("Arc for BSR: no open opportunities right now.");
    expect(msg.blocks).toBeUndefined();
  });

  it("adds a review link when an app url is given", () => {
    const block = (buildOpportunityDigest([opp("X", "high", 80)], { appUrl: "https://arc-studio.ai" }).blocks?.[0] as { text: { text: string } }).text.text;
    expect(block).toContain("<https://arc-studio.ai/opportunities|Review in Arc>");
  });
});

describe("postSlackWebhook", () => {
  it("rejects a non-Slack URL without calling out", async () => {
    const fetchImpl = vi.fn();
    const res = await postSlackWebhook("https://evil.example.com/hook", { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts JSON to a valid Slack webhook and treats 'ok' as success", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await postSlackWebhook("https://hooks.slack.com/services/T/B/x", { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true });
    const call = fetchImpl.mock.calls[0] as unknown as [string, { method: string; body: string; headers: Record<string, string> }];
    expect(call[1].method).toBe("POST");
    expect(call[1].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call[1].body)).toEqual({ text: "hi" });
  });

  it("surfaces a non-2xx as an error", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid_payload", { status: 400 }));
    const res = await postSlackWebhook("https://hooks.slack.com/services/T/B/x", { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.ok).toBe(false);
  });
});
