import { describe, expect, it } from "vitest";

import { dispatchThroughApprovedChannel } from "../dispatch";

// These exercise the security-critical guards, which short-circuit BEFORE any
// DB/credential I/O — so no Supabase client is needed. The happy dispatch path
// is covered by the webhook stub test (registry.test.ts).
const base = {
  client: {} as never,
  orgId: "org-1",
  workspaceId: "ws-1",
  payload: { body: "hello" },
};

describe("dispatchThroughApprovedChannel — human gate", () => {
  it("refuses to dispatch without an approvalId (no auto-send)", async () => {
    const res = await dispatchThroughApprovedChannel({ ...base, connectorKey: "webhook-dispatch", approvalId: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/approval/i);
  });

  it("refuses a connector that is not a channel", async () => {
    const res = await dispatchThroughApprovedChannel({ ...base, connectorKey: "gemini-research", approvalId: "appr-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not a channel/i);
  });

  it("refuses an unknown connector key", async () => {
    const res = await dispatchThroughApprovedChannel({ ...base, connectorKey: "nope", approvalId: "appr-1" });
    expect(res.ok).toBe(false);
  });
});
