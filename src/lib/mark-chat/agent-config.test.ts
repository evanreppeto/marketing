import { afterEach, describe, expect, it, vi } from "vitest";

import { agentProfile, getAgentDisplayName, isAgentConfigured } from "./agent-config";

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
