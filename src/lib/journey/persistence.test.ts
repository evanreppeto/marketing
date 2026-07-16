import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import type { NormalizedCollect } from "@/domain";

import { isIdentitySuppressed, optOutAnonymousId, recordCollectedTouch, resolveCollectOrg, stitchAnonymousToContact } from "./persistence";

const CAMPAIGN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = Date.parse("2026-03-11T00:00:00.000Z");

function collect(over: Partial<NormalizedCollect> = {}): NormalizedCollect {
  return {
    token: null,
    campaignId: null,
    assetId: null,
    channel: null,
    anonymousId: null,
    consent: false,
    kind: "ad_click",
    direction: "inbound",
    occurredAt: null,
    path: null,
    summary: null,
    externalRef: null,
    ...over,
  };
}

describe("resolveCollectOrg", () => {
  it("resolves the org from a campaignId lookup", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: { org_id: "org-1" }, error: null } });
    const resolved = await resolveCollectOrg(supabase, { token: null, campaignId: CAMPAIGN, assetId: null, channel: "meta" });
    expect(resolved).toMatchObject({ orgId: "org-1", campaignId: CAMPAIGN, channel: "meta" });
  });

  it("returns null when the campaign does not exist", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: null, error: null } });
    expect(await resolveCollectOrg(supabase, { token: null, campaignId: CAMPAIGN, assetId: null, channel: null })).toBeNull();
  });

  it("returns null when neither token nor campaignId is present", async () => {
    const supabase = createSupabaseQueryMock({});
    expect(await resolveCollectOrg(supabase, { token: null, campaignId: null, assetId: null, channel: null })).toBeNull();
  });
});

const RESOLVED = { orgId: "org-1", campaignId: CAMPAIGN, assetId: null, channel: "meta" };

describe("recordCollectedTouch", () => {
  it("mints an anonymous id and inserts identity + touchpoint for a new visitor", async () => {
    const supabase = createSupabaseQueryMock({
      journey_identities: [
        { data: null, error: null }, // lookup: not found
        { data: { id: "i1" }, error: null }, // insert
      ],
      journey_touchpoints: { data: { id: "t1" }, error: null },
    });
    const r = await recordCollectedTouch({ supabase, resolved: RESOLVED, input: collect(), nowMs: NOW });
    expect(typeof r.anonymousId).toBe("string");
    expect(r.anonymousId.length).toBeGreaterThan(8);
    expect(r.touchpointId).toBe("t1");
    expect(r.deduped).toBe(false);
  });

  it("reuses a returning visitor's anonymous id", async () => {
    const supabase = createSupabaseQueryMock({
      journey_identities: [
        { data: { id: "i1" }, error: null }, // lookup: found
        { data: null, error: null }, // update last_seen
      ],
      journey_touchpoints: { data: { id: "t2" }, error: null },
    });
    const r = await recordCollectedTouch({ supabase, resolved: RESOLVED, input: collect({ anonymousId: "anon-12345678" }), nowMs: NOW });
    expect(r.anonymousId).toBe("anon-12345678");
    expect(r.touchpointId).toBe("t2");
  });

  it("is idempotent on a duplicate external_ref", async () => {
    const supabase = createSupabaseQueryMock({
      journey_identities: [
        { data: { id: "i1" }, error: null },
        { data: null, error: null },
      ],
      journey_touchpoints: { data: null, error: { message: "duplicate key", code: "23505" } as { message: string } },
    });
    const r = await recordCollectedTouch({ supabase, resolved: RESOLVED, input: collect({ anonymousId: "anon-12345678", externalRef: "beacon-1" }), nowMs: NOW });
    expect(r.deduped).toBe(true);
    expect(r.touchpointId).toBeNull();
  });
});

describe("isIdentitySuppressed", () => {
  it("is true once the identity carries opted_out_at", async () => {
    const supabase = createSupabaseQueryMock({ journey_identities: { data: { opted_out_at: "2026-03-01T00:00:00Z" }, error: null } });
    expect(await isIdentitySuppressed(supabase, "org-1", "anon-12345678")).toBe(true);
  });

  it("is false for a known, non-opted-out identity", async () => {
    const supabase = createSupabaseQueryMock({ journey_identities: { data: { opted_out_at: null }, error: null } });
    expect(await isIdentitySuppressed(supabase, "org-1", "anon-12345678")).toBe(false);
  });

  it("fails CLOSED — an unverifiable lookup suppresses rather than tracks", async () => {
    const supabase = createSupabaseQueryMock({ journey_identities: { data: null, error: { message: "boom" } } });
    expect(await isIdentitySuppressed(supabase, "org-1", "anon-12345678")).toBe(true);
  });
});

describe("optOutAnonymousId", () => {
  it("erases the visitor's touchpoints and tombstones their identities", async () => {
    const supabase = createSupabaseQueryMock({
      journey_identities: [
        { data: [{ id: "i1" }, { id: "i2" }], error: null }, // lookup across orgs
        { data: null, error: null }, // update → opted_out_at
      ],
      journey_touchpoints: { data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }], error: null }, // delete ... select
    });
    const r = await optOutAnonymousId({ supabase, anonymousId: "anon-12345678", nowMs: NOW });
    expect(r).toEqual({ identities: 2, touchpointsDeleted: 3 });
  });

  it("is a no-op for an id that was never seen (and never errors)", async () => {
    const supabase = createSupabaseQueryMock({ journey_identities: { data: [], error: null } });
    expect(await optOutAnonymousId({ supabase, anonymousId: "anon-12345678", nowMs: NOW })).toEqual({
      identities: 0,
      touchpointsDeleted: 0,
    });
  });
});

describe("stitchAnonymousToContact", () => {
  it("merges an anonymous identity's touchpoints onto a contact", async () => {
    const supabase = createSupabaseQueryMock({
      journey_identities: [
        { data: { id: "i1" }, error: null }, // lookup
        { data: null, error: null }, // update
      ],
      journey_touchpoints: { data: [{ id: "a" }, { id: "b" }], error: null }, // update ... select
    });
    const r = await stitchAnonymousToContact({ supabase, orgId: "org-1", anonymousId: "anon-12345678", contactId: "c1", nowMs: NOW });
    expect(r.stitched).toBe(true);
    expect(r.touchpoints).toBe(2);
  });

  it("is a no-op when the anonymous id was never seen", async () => {
    const supabase = createSupabaseQueryMock({ journey_identities: { data: null, error: null } });
    const r = await stitchAnonymousToContact({ supabase, orgId: "org-1", anonymousId: "anon-12345678", contactId: "c1", nowMs: NOW });
    expect(r.stitched).toBe(false);
    expect(r.touchpoints).toBe(0);
  });
});
