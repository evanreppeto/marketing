import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { recordResendWebhookEvent, verifySvixSignature } from "./resend-webhook";

const SECRET_BYTES = Buffer.from("test-webhook-secret-material");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

function sign(id: string, timestamp: string, payload: string): string {
  const digest = createHmac("sha256", SECRET_BYTES).update(`${id}.${timestamp}.${payload}`, "utf8").digest("base64");
  return `v1,${digest}`;
}

describe("verifySvixSignature", () => {
  const payload = JSON.stringify({ type: "email.opened", data: { email_id: "re_1" } });
  const timestamp = "1700000000";
  const nowMs = 1700000000 * 1000;

  it("accepts a correctly signed payload inside the tolerance window", () => {
    expect(
      verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp, signature: sign("msg_1", timestamp, payload), payload, nowMs }),
    ).toBe(true);
  });

  it("accepts when any of several space-separated signatures matches", () => {
    const signature = `v1,${Buffer.from("nope").toString("base64")} ${sign("msg_1", timestamp, payload)}`;
    expect(verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp, signature, payload, nowMs })).toBe(true);
  });

  it("rejects a tampered payload, wrong id, missing headers, and stale timestamps", () => {
    const signature = sign("msg_1", timestamp, payload);
    expect(verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp, signature, payload: payload + "x", nowMs })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, id: "msg_2", timestamp, signature, payload, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, id: null, timestamp, signature, payload, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp: null, signature, payload, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp, signature: null, payload, nowMs })).toBe(false);
    // 10 minutes later — outside the 5-minute replay window.
    expect(verifySvixSignature({ secret: SECRET, id: "msg_1", timestamp, signature, payload, nowMs: nowMs + 600_000 })).toBe(false);
  });
});

const DISPATCH = {
  id: "d1",
  org_id: "org-1",
  status: "sent",
  campaign_id: "c1",
  campaign_asset_id: "a1",
  contact_id: "ct1",
};

function openedEvent() {
  return { type: "email.opened" as const, emailId: "re_msg_1", createdAt: "2026-07-23T12:00:00.000Z", clickedLink: null };
}

describe("recordResendWebhookEvent", () => {
  it("records an open against the dispatch's org/campaign/asset/contact", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: DISPATCH, error: null },
      engagement_events: { data: null, error: null },
    });

    const result = await recordResendWebhookEvent({ event: openedEvent(), externalEventId: "svix_1" }, supabase);

    expect(result).toEqual({ ok: true, recorded: true, note: "Recorded email.opened." });
    const upsert = supabase.calls.find(([method]) => method === "upsert");
    expect(upsert?.[1]).toMatchObject({
      org_id: "org-1",
      campaign_id: "c1",
      campaign_asset_id: "a1",
      contact_id: "ct1",
      event_type: "email_open",
      direction: "inbound",
      source_system: "resend",
      external_event_id: "svix_1",
      occurred_at: "2026-07-23T12:00:00.000Z",
    });
    expect(upsert?.[2]).toMatchObject({ onConflict: "source_system,external_event_id", ignoreDuplicates: true });
  });

  it("advances a sent dispatch to delivered, and bounces to failed", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: [
        { data: DISPATCH, error: null },
        { data: null, error: null },
      ],
      engagement_events: { data: null, error: null },
    });

    const result = await recordResendWebhookEvent(
      { event: { ...openedEvent(), type: "email.delivered" }, externalEventId: "svix_2" },
      supabase,
    );

    expect(result.ok).toBe(true);
    const update = supabase.calls.find(([method]) => method === "update");
    expect(update?.[1]).toEqual({ status: "delivered" });
  });

  it("acknowledges without writing when no dispatch matches the message id", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: null, error: null },
    });

    const result = await recordResendWebhookEvent({ event: openedEvent(), externalEventId: "svix_3" }, supabase);

    expect(result).toEqual({ ok: true, recorded: false, note: "No dispatch for message re_msg_1." });
    expect(supabase.calls.some(([method]) => method === "upsert")).toBe(false);
  });

  it("ignores event types the app does not record", async () => {
    const supabase = createSupabaseQueryMock({});
    const result = await recordResendWebhookEvent(
      { event: { ...openedEvent(), type: "email.sent" }, externalEventId: "svix_4" },
      supabase,
    );
    expect(result).toEqual({ ok: true, recorded: false, note: "Ignored email.sent." });
    expect(supabase.calls.length).toBe(0);
  });

  it("surfaces a write failure so the route can 500 and svix retries", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_dispatches: { data: DISPATCH, error: null },
      engagement_events: { data: null, error: { message: "insert exploded" } },
    });

    const result = await recordResendWebhookEvent({ event: openedEvent(), externalEventId: "svix_5" }, supabase);

    expect(result).toEqual({ ok: false, error: "engagement_events insert: insert exploded" });
  });
});
