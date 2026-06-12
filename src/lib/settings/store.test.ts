import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUPPORT_EMAIL,
  getSupportContactEmail,
  isValidSupportEmail,
  mergeAppSettingsRows,
  normalizeWorkspaceName,
} from "./store";

describe("settings store helpers", () => {
  it("normalizes editable workspace names before saving", () => {
    expect(normalizeWorkspaceName("  Big Shoulders  ")).toBe("Big Shoulders");
    expect(normalizeWorkspaceName("x".repeat(100))).toHaveLength(80);
  });

  it("accepts blank support email but rejects malformed addresses", () => {
    expect(isValidSupportEmail("")).toBe(true);
    expect(isValidSupportEmail("support@bigshouldersmp.com")).toBe(true);
    expect(isValidSupportEmail("not-an-email")).toBe(false);
  });

  it("merges persisted app settings without carrying dead setting rows into the app contract", () => {
    const settings = mergeAppSettingsRows([
      { key: "workspace_name", value: "Growth Desk" },
      { key: "support_email", value: "help@example.com" },
      { key: "mark_default_mode", value: "draft" },
      { key: "mark_default_route", value: "standard" },
      { key: "appearance_accent", value: "emerald" },
      { key: "appearance_density", value: "compact" },
      { key: "appearance_motion", value: "reduced" },
      { key: "mark_webhook_enabled", value: false },
    ]);

    expect(settings).toEqual({
      workspaceName: "Growth Desk",
      supportEmail: "help@example.com",
      markDefaultMode: "draft",
      markDefaultRoute: "standard",
      appearanceAccent: "emerald",
      appearanceDensity: "compact",
      appearanceMotion: "reduced",
    });
    expect(settings).not.toHaveProperty("markWebhookEnabled");
  });

  it("falls back to safe Mark defaults when persisted rows are invalid", () => {
    const settings = mergeAppSettingsRows([
      { key: "mark_default_mode", value: "go-wild" },
      { key: "mark_default_route", value: "premium" },
      { key: "appearance_accent", value: "rainbow" },
      { key: "appearance_density", value: "tiny" },
      { key: "appearance_motion", value: "spinny" },
    ]);

    expect(settings.markDefaultMode).toBe("act");
    expect(settings.markDefaultRoute).toBe("fast");
    expect(settings.appearanceAccent).toBe("gold");
    expect(settings.appearanceDensity).toBe("comfortable");
    expect(settings.appearanceMotion).toBe("standard");
  });

  it("uses the saved support email before env fallbacks", () => {
    const env = { OPERATOR_SUPPORT_EMAIL: "env-support@example.com", OPERATOR_EMAIL: "operator@example.com" };

    expect(getSupportContactEmail({ supportEmail: "saved@example.com" }, env)).toBe("saved@example.com");
    expect(getSupportContactEmail({ supportEmail: "" }, env)).toBe("env-support@example.com");
    expect(getSupportContactEmail({ supportEmail: "" }, { OPERATOR_EMAIL: "operator@example.com" })).toBe("operator@example.com");
    expect(getSupportContactEmail({ supportEmail: "" }, {})).toBe(DEFAULT_SUPPORT_EMAIL);
  });
});
