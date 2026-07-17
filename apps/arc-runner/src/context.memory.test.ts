import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatRecordedAge, type ArcTurnContext } from "./context";
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

describe("formatRecordedAge", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");

  it("reports minutes, then hours, then days", () => {
    expect(formatRecordedAge("2026-07-17T11:40:00.000Z", now)).toBe("20m ago");
    expect(formatRecordedAge("2026-07-16T19:00:00.000Z", now)).toBe("17h ago");
    expect(formatRecordedAge("2026-07-10T12:00:00.000Z", now)).toBe("7d ago");
  });

  it("says nothing rather than guessing, for undated or unparseable memory", () => {
    expect(formatRecordedAge(undefined, now)).toBeNull();
    expect(formatRecordedAge("not a date", now)).toBeNull();
  });

  it("says nothing for a future timestamp — 'in 3h' would be worse than silence", () => {
    expect(formatRecordedAge("2026-07-17T15:00:00.000Z", now)).toBeNull();
  });
});

describe("memory freshness in buildSystemPrompt", () => {
  it("dates a recalled fact so the model can tell when it was true", () => {
    const recent = new Date(Date.now() - 20 * 60_000).toISOString();
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "crm_total_leads", summary: "exactly 200 total leads", kind: "learning", recordedAt: recent },
    ]));
    expect(prompt).toContain("recorded 20m ago");
  });

  it("tells the model the newer memory wins when two conflict", () => {
    // The real case: the brain holds "at least 64 leads" (written under a
    // truncation bug) AND "exactly 200 leads". Both are `observed` and both
    // recall together — the date is the only thing that separates them.
    const stale = new Date(Date.now() - 17 * 3_600_000).toISOString();
    const fresh = new Date(Date.now() - 20 * 60_000).toISOString();
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "CRM lead count", summary: "at least 64 real leads", kind: "learning", recordedAt: stale },
      { label: "crm_total_leads", summary: "exactly 200 total leads", kind: "learning", recordedAt: fresh },
    ]));

    expect(prompt).toContain("recorded 17h ago");
    expect(prompt).toContain("recorded 20m ago");
    expect(prompt).toMatch(/more recent one wins/i);
  });

  it("tells the model a remembered number is a hint, not an answer", () => {
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "crm_total_leads", summary: "200 leads", kind: "learning", recordedAt: new Date().toISOString() },
    ]));
    expect(prompt).toMatch(/NOT an answer to quote/i);
    expect(prompt).toMatch(/read it live|read it and cite/i);
  });

  it("renders an undated memory cleanly rather than emitting a dangling separator", () => {
    const prompt = buildSystemPrompt("BASE", ctx([
      { label: "IICRC-certified technicians", summary: null, kind: "brand_fact" },
    ]));
    expect(prompt).toContain("IICRC-certified technicians · brand_fact");
    expect(prompt).not.toContain("recorded ");
  });
});
