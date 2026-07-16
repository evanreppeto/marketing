import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { executeResendDispatch } from "./execute-resend";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

const APPROVED = { status: "approved" };
const ENABLED_RESEND = { enabled: true, env_var: "RESEND_API_KEY", config: { fromEmail: "Arc <mark@bsg.com>" } };

function queuedDispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    org_id: "org-1",
    status: "queued",
    approval_item_id: "appr-1",
    channel: "email",
    campaign_id: "c1",
    provider_message_id: null,
    payload: { to: "lead@example.com", subject: "Roof inspection", html: "<p>Hello</p>" },
    ...overrides,
  };
}

// Live sending is armed for the whole suite; the gate itself is covered by its
// own test below.
beforeEach(() => vi.stubEnv("ARC_SEND_ENABLED", "1"));
afterEach(() => vi.unstubAllEnvs());

describe("executeResendDispatch", () => {
  it("refuses when live sending is not armed (ARC_SEND_ENABLED unset)", async () => {
    vi.stubEnv("ARC_SEND_ENABLED", "");
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ARC_SEND_ENABLED|turned off|armed/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends an approved queued dispatch, stamps the provider message id, and logs dispatch_sent", async () => {
    const send = vi.fn().mockResolvedValue({ id: "resend-123" });
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, {
      apiKey: "re_test",
      send,
    });

    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-123" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("re_test", expect.objectContaining({ to: ["lead@example.com"], subject: "Roof inspection" }));

    const updates = findCalls(supabase, "update");
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "sent", provider: "resend", provider_message_id: "resend-123" }),
    );
    expect(updates.some((u) => "dispatched_at" in u)).toBe(true);
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ event_type: "dispatch_sent" }));
  });

  it("tags first-party links in the body and records an outbound attribution touch", async () => {
    const CAMPAIGN_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const ASSET_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const CONTACT_UUID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const send = vi.fn().mockResolvedValue({ id: "resend-999" });
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: {
        data: queuedDispatch({
          campaign_id: CAMPAIGN_UUID,
          campaign_asset_id: ASSET_UUID,
          contact_id: CONTACT_UUID,
          payload: { to: "lead@example.com", subject: "Storm prep", html: '<a href="https://bigshoulders.com/book">Book now</a>' },
        }),
        error: null,
      },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
      engagement_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });
    expect(result.ok).toBe(true);

    // The body's first-party CTA now carries this campaign's attribution.
    const sentPayload = send.mock.calls[0][1] as { html?: string };
    expect(sentPayload.html).toMatch(/bsg_at=/);
    expect(sentPayload.html).toContain(`utm_campaign=${CAMPAIGN_UUID}`);

    // A durable outbound touch is recorded for last-touch attribution + traffic.
    const touch = findCalls(supabase, "insert").find((row) => row.event_type === "outbound_send");
    expect(touch).toMatchObject({
      event_type: "outbound_send",
      direction: "outbound",
      channel: "email",
      campaign_id: CAMPAIGN_UUID,
      campaign_asset_id: ASSET_UUID,
      contact_id: CONTACT_UUID,
      org_id: "org-1",
    });
  });

  it("sends a scheduled dispatch when the operator forces it (send now)", async () => {
    const send = vi.fn().mockResolvedValue({ id: "resend-sched" });
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch({ status: "scheduled" }), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, {
      apiKey: "re_test",
      send,
    });

    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-sched" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(findCalls(supabase, "update")).toContainEqual(expect.objectContaining({ status: "sent" }));
  });

  it("is idempotent — returns the existing id and never re-sends an already-dispatched row", async () => {
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch({ status: "sent", provider_message_id: "resend-prior" }), error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-prior" });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a dispatch that is not queued", async () => {
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch({ status: "canceled" }), error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/canceled|queued/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses when the dispatch has no linked approval", async () => {
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch({ approval_item_id: null }), error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/approval/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses when the linked approval is not approved", async () => {
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: { status: "pending" }, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/approv/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses when no workspace key is stored and RESEND_API_KEY is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/RESEND_API_KEY|configured/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("prefers the workspace's stored Resend key over the deployment env var", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_env_deployment");
    const send = vi.fn().mockResolvedValue({ id: "resend-ws" });
    const readCredential = vi.fn().mockResolvedValue("re_workspace_stored");
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: { ...ENABLED_RESEND, credential_ref: "vault-ref-1" }, error: null },
      campaign_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { send, readCredential });

    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-ws" });
    expect(readCredential).toHaveBeenCalledWith("vault-ref-1");
    expect(send).toHaveBeenCalledWith("re_workspace_stored", expect.anything());
  });

  it("falls back to RESEND_API_KEY when the workspace has no stored key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_env_deployment");
    const send = vi.fn().mockResolvedValue({ id: "resend-env" });
    const readCredential = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null }, // no credential_ref
      campaign_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { send, readCredential });

    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-env" });
    expect(readCredential).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("re_env_deployment", expect.anything());
  });

  it("refuses when the Resend connection is disabled (kill-switch off)", async () => {
    const send = vi.fn();
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: { ...ENABLED_RESEND, enabled: false }, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/disabled/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("records a failure (status=failed, last_error) and logs dispatch_failed when Resend throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend send failed (422): invalid from"));
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/422|invalid from/i);
    const updates = findCalls(supabase, "update");
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed" }));
    expect(updates.some((u) => "last_error" in u)).toBe(true);
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ event_type: "dispatch_failed" }));
  });

  // The engagement_events row is the only fuel the journey/attribution layer gets
  // from an outbound send, so it's worth asserting the shape — and, more
  // importantly, that a lost write is audible rather than silent.
  it("records the send as an outbound attribution touch in engagement_events", async () => {
    const send = vi.fn().mockResolvedValue({ id: "resend-123" });
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch({ contact_id: "ct-1", campaign_asset_id: "as-1" }), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
      engagement_events: { data: null, error: null },
    });

    await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    expect(findCalls(supabase, "insert")).toContainEqual(
      expect.objectContaining({
        event_type: "outbound_send",
        direction: "outbound",
        channel: "email",
        external_event_id: "resend-123",
        campaign_id: "c1",
        contact_id: "ct-1",
      }),
    );
  });

  it("warns (but still reports success) when the engagement_events touch can't be written", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({ id: "resend-123" });
    // postgrest resolves with `{ error }` rather than rejecting — the shape a real
    // constraint violation takes, and the one the old bare `catch` never saw.
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: queuedDispatch(), error: null },
      approval_items: { data: APPROVED, error: null },
      connections: { data: ENABLED_RESEND, error: null },
      campaign_events: { data: null, error: null },
      engagement_events: { data: null, error: { message: 'violates check constraint "engagement_events_subject_check"' } },
    });

    const result = await executeResendDispatch({ dispatchId: "d1", operator: "Operator" }, supabase, { apiKey: "re_test", send });

    // The mail is already gone; a lost touch must never retroactively fail the send.
    expect(result).toMatchObject({ ok: true, providerMessageId: "resend-123" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("engagement_events insert failed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("engagement_events_subject_check"));
    warn.mockRestore();
  });
});
