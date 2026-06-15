import { describe, expect, it } from "vitest";

import { getVaultLiveSignals, personaSignalLabel, shortTime, toMarkActivity } from "./live-signals";

const NOW = Date.parse("2026-06-02T12:00:00.000Z");

describe("shortTime", () => {
  it("formats relative times from a fixed now", () => {
    expect(shortTime(null, NOW)).toBe("—");
    expect(shortTime("2026-06-02T11:59:30.000Z", NOW)).toBe("just now");
    expect(shortTime("2026-06-02T11:45:00.000Z", NOW)).toBe("15m ago");
    expect(shortTime("2026-06-02T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(shortTime("2026-05-31T12:00:00.000Z", NOW)).toBe("2d ago");
  });
});

describe("personaSignalLabel", () => {
  it("formats lead counts with a new-this-week suffix", () => {
    expect(personaSignalLabel(12, 3)).toBe("12 leads · 3 new");
    expect(personaSignalLabel(1, 0)).toBe("1 lead");
    expect(personaSignalLabel(0, 0)).toBe("0 leads");
  });
});

describe("toMarkActivity", () => {
  it("shapes agent rows, tasks, outputs, and review count into MarkActivity", () => {
    const activity = toMarkActivity(
      { name: "Mark", status: "ready", metadata: { last_heartbeat_at: "2026-06-02T11:50:00.000Z", kill_switch: "Outbound locked" } },
      [{ objective: "Draft partner note", task_type: "note_draft", status: "running", updated_at: "2026-06-02T11:58:00.000Z" }],
      [{ title: "Partner intel draft", approval_status: "pending_approval", created_at: "2026-06-02T11:40:00.000Z" }],
      2,
      NOW,
    );
    expect(activity).toEqual({
      name: "Mark",
      status: "Ready",
      killSwitch: "Outbound locked",
      lastHeartbeat: "10m ago",
      drafting: [{ title: "Draft partner note", taskType: "Note Draft", updated: "2m ago" }],
      awaitingReview: 2,
      recentOutputs: [{ title: "Partner intel draft", status: "Pending Approval", time: "20m ago" }],
    });
  });
});

describe("getVaultLiveSignals (no Supabase configured)", () => {
  it("returns fallback with an Offline Agent when env vars are unset", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const model = await getVaultLiveSignals();
      expect(model.status).toBe("fallback");
      expect(model.activity.name).toBe("Agent");
      expect(model.activity.status).toBe("Offline");
      expect(model.activity.drafting).toEqual([]);
    } finally {
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});
