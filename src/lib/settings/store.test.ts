import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS, getAppSettings } from "./store";

describe("app settings agentName", () => {
  it("defaults agentName to empty string (falls through to env/Mark elsewhere)", () => {
    expect(DEFAULT_APP_SETTINGS.agentName).toBe("");
  });

  it("returns defaults incl. agentName when Supabase is not configured", async () => {
    const settings = await getAppSettings();
    expect(settings.agentName).toBe("");
  });
});
