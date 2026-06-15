import { afterEach, describe, expect, it, vi } from "vitest";

import { AGENT_LIVENESS_WINDOW_MS, agentProfile, getAgentDisplayName, isAgentConfigured, isAgentLive } from "./agent-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agentProfile", () => {
  it("defaults to Arc/A for empty input", () => {
    expect(agentProfile("")).toEqual({ name: "Arc", shortName: "Arc", monogram: "A" });
    expect(agentProfile(undefined)).toEqual({ name: "Arc", shortName: "Arc", monogram: "A" });
    expect(agentProfile(null)).toEqual({ name: "Arc", shortName: "Arc", monogram: "A" });
  });

  it("derives first-word shortName and uppercase monogram", () => {
    expect(agentProfile("Hermes")).toEqual({ name: "Hermes", shortName: "Hermes", monogram: "H" });
    expect(agentProfile("Ada Lovelace")).toEqual({ name: "Ada Lovelace", shortName: "Ada", monogram: "A" });
    expect(agentProfile("@nova").monogram).toBe("N");
  });
});

describe("getAgentDisplayName", () => {
  it("prefers the operator override, then env, then Arc", () => {
    vi.stubEnv("MARK_DISPLAY_NAME", "Hermes");
    expect(getAgentDisplayName("Nova")).toBe("Nova");
    expect(getAgentDisplayName("")).toBe("Hermes");
    expect(getAgentDisplayName(null)).toBe("Hermes");
    vi.stubEnv("MARK_DISPLAY_NAME", "");
    expect(getAgentDisplayName(undefined)).toBe("Arc");
  });
});

describe("isAgentConfigured", () => {
  it("is false when neither runner nor token is set", () => {
    expect(isAgentConfigured({})).toBe(false);
  });
  it("is true when a runner URL or the API token is set", () => {
    expect(isAgentConfigured({ MARK_RUNNER_URL: "https://r" })).toBe(true);
    expect(isAgentConfigured({ MARK_WEBHOOK_URL: "https://w" })).toBe(true);
    expect(isAgentConfigured({ HERMES_AGENT_API_TOKEN: "tok" })).toBe(true);
  });
});

describe("isAgentLive", () => {
  const now = Date.parse("2026-06-15T16:00:00.000Z");

  it("is true for an ok heartbeat within the window", () => {
    const seen = new Date(now - 60_000).toISOString(); // 1 min ago
    expect(isAgentLive("ok", seen, now)).toBe(true);
  });

  it("is false once the heartbeat is older than the window", () => {
    const seen = new Date(now - (AGENT_LIVENESS_WINDOW_MS + 1_000)).toISOString();
    expect(isAgentLive("ok", seen, now)).toBe(false);
  });

  it("is false when the last status is not ok, even if recent", () => {
    const seen = new Date(now - 1_000).toISOString();
    expect(isAgentLive("error", seen, now)).toBe(false);
    expect(isAgentLive("unreachable", seen, now)).toBe(false);
  });

  it("is false when there is no heartbeat or an unparseable timestamp", () => {
    expect(isAgentLive("ok", null, now)).toBe(false);
    expect(isAgentLive("ok", undefined, now)).toBe(false);
    expect(isAgentLive("ok", "not-a-date", now)).toBe(false);
    expect(isAgentLive(null, null, now)).toBe(false);
  });

  it("treats the exact window boundary as live", () => {
    const seen = new Date(now - AGENT_LIVENESS_WINDOW_MS).toISOString();
    expect(isAgentLive("ok", seen, now)).toBe(true);
  });
});
