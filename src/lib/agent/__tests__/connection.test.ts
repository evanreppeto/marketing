import { describe, expect, it } from "vitest";

import { DEFAULT_CONNECTION, mergeConnection } from "../connection";

describe("mergeConnection", () => {
  it("uses defaults when no env and no row", () => {
    const connection = mergeConnection({}, null);

    expect(connection.displayName).toBe(DEFAULT_CONNECTION.displayName);
    expect(connection.agentKey).toBe(DEFAULT_CONNECTION.agentKey);
    expect(connection.enabled).toBe(true);
    expect(connection.source.displayName).toBe("default");
  });

  it("uses the db row when present and no env", () => {
    const connection = mergeConnection(
      {},
      {
        workspace_id: "default",
        display_name: "Atlas",
        agent_key: "atlas",
        webhook_url: "https://example.com/hook",
        webhook_secret_ref: null,
        enabled: false,
        last_seen_at: "2026-06-11T10:00:00.000Z",
        last_status: "ok",
        last_error: null,
      },
    );

    expect(connection.displayName).toBe("Atlas");
    expect(connection.agentKey).toBe("atlas");
    expect(connection.webhookUrl).toBe("https://example.com/hook");
    expect(connection.enabled).toBe(false);
    expect(connection.health.lastStatus).toBe("ok");
    expect(connection.source.webhookUrl).toBe("db");
  });

  it("lets env override the db row", () => {
    const connection = mergeConnection(
      { MARK_DISPLAY_NAME: "EnvName", MARK_RUNNER_URL: "https://env.example/hook", MARK_AGENT_KEY: "envkey" },
      {
        workspace_id: "default",
        display_name: "Atlas",
        agent_key: "atlas",
        webhook_url: "https://db.example/hook",
        webhook_secret_ref: null,
        enabled: true,
        last_seen_at: null,
        last_status: null,
        last_error: null,
      },
    );

    expect(connection.displayName).toBe("EnvName");
    expect(connection.agentKey).toBe("envkey");
    expect(connection.webhookUrl).toBe("https://env.example/hook");
    expect(connection.source.displayName).toBe("env");
    expect(connection.source.webhookUrl).toBe("env");
  });

  it("honors MARK_WEBHOOK_URL as a webhook fallback alias", () => {
    const connection = mergeConnection({ MARK_WEBHOOK_URL: "https://legacy.example/hook" }, null);

    expect(connection.webhookUrl).toBe("https://legacy.example/hook");
    expect(connection.source.webhookUrl).toBe("env");
  });
});
