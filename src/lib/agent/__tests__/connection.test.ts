import { describe, expect, it } from "vitest";
import { mergeConnection, DEFAULT_CONNECTION } from "../connection";

describe("mergeConnection", () => {
  it("uses defaults when no env and no row", () => {
    const c = mergeConnection({}, null);
    expect(c.displayName).toBe(DEFAULT_CONNECTION.displayName);
    expect(c.enabled).toBe(true);
    expect(c.source.displayName).toBe("default");
  });

  it("uses the db row when present and no env", () => {
    const c = mergeConnection({}, {
      workspace_id: "default", display_name: "Atlas", agent_key: "atlas",
      webhook_url: "https://x/hook", webhook_secret_ref: null, enabled: false,
      last_seen_at: "t", last_status: "ok", last_error: null,
    });
    expect(c.displayName).toBe("Atlas");
    expect(c.agentKey).toBe("atlas");
    expect(c.webhookUrl).toBe("https://x/hook");
    expect(c.enabled).toBe(false);
    expect(c.health.lastStatus).toBe("ok");
    expect(c.source.webhookUrl).toBe("db");
  });

  it("env overrides the db row", () => {
    const c = mergeConnection(
      { MARK_DISPLAY_NAME: "EnvName", MARK_RUNNER_URL: "https://env/hook", MARK_AGENT_KEY: "envkey" },
      { workspace_id: "default", display_name: "Atlas", agent_key: "atlas", webhook_url: "https://db/hook", webhook_secret_ref: null, enabled: true, last_seen_at: null, last_status: null, last_error: null },
    );
    expect(c.displayName).toBe("EnvName");
    expect(c.webhookUrl).toBe("https://env/hook");
    expect(c.agentKey).toBe("envkey");
    expect(c.source.displayName).toBe("env");
    expect(c.source.webhookUrl).toBe("env");
  });

  it("honors MARK_WEBHOOK_URL as a webhook fallback alias", () => {
    const c = mergeConnection({ MARK_WEBHOOK_URL: "https://legacy/hook" }, null);
    expect(c.webhookUrl).toBe("https://legacy/hook");
    expect(c.source.webhookUrl).toBe("env");
  });

  it("prefers MARK_RUNNER_URL over MARK_WEBHOOK_URL when both are set", () => {
    const c = mergeConnection({ MARK_RUNNER_URL: "https://runner/hook", MARK_WEBHOOK_URL: "https://legacy/hook" }, null);
    expect(c.webhookUrl).toBe("https://runner/hook");
  });

  it("MARK_WEBHOOK_DISABLED=1 forces enabled off and marks the source env", () => {
    const c = mergeConnection({ MARK_WEBHOOK_DISABLED: "1" }, null);
    expect(c.enabled).toBe(false);
    expect(c.source.enabled).toBe("env");
  });

  it("MARK_WEBHOOK_DISABLED=1 overrides a db row that is enabled", () => {
    const c = mergeConnection({ MARK_WEBHOOK_DISABLED: "1" }, {
      workspace_id: "default", display_name: null, agent_key: null, webhook_url: null,
      webhook_secret_ref: null, enabled: true, last_seen_at: null, last_status: null, last_error: null,
    });
    expect(c.enabled).toBe(false);
  });

  it("does not disable for a non-\"1\" MARK_WEBHOOK_DISABLED value", () => {
    const c = mergeConnection({ MARK_WEBHOOK_DISABLED: "true" }, null);
    expect(c.enabled).toBe(true);
    expect(c.source.enabled).toBe("default");
  });

  it("treats a blank string env var as absent (falls through to default)", () => {
    const c = mergeConnection({ MARK_DISPLAY_NAME: "   ", MARK_AGENT_KEY: "" }, null);
    expect(c.displayName).toBe(DEFAULT_CONNECTION.displayName);
    expect(c.agentKey).toBe(DEFAULT_CONNECTION.agentKey);
    expect(c.source.displayName).toBe("default");
  });
});
