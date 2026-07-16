import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
  resolveCollectOrg: vi.fn(),
  isIdentitySuppressed: vi.fn(),
  recordCollectedTouch: vi.fn(),
  getAppSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
  isSupabaseAdminConfigured: mocks.isSupabaseAdminConfigured,
}));
vi.mock("@/lib/journey/persistence", () => ({
  resolveCollectOrg: mocks.resolveCollectOrg,
  isIdentitySuppressed: mocks.isIdentitySuppressed,
  recordCollectedTouch: mocks.recordCollectedTouch,
}));
vi.mock("@/lib/settings/store", () => ({ getAppSettings: mocks.getAppSettings }));

import { POST } from "./route";

const CAMPAIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function req(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/journey/collect", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const arrival = { campaignId: CAMPAIGN, kind: "site_visit", channel: "meta" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSupabaseAdminConfigured.mockReturnValue(true);
  mocks.getSupabaseAdminClient.mockReturnValue({});
  mocks.resolveCollectOrg.mockResolvedValue({ orgId: "org-1", campaignId: CAMPAIGN, assetId: null, channel: "meta" });
  mocks.isIdentitySuppressed.mockResolvedValue(false);
  mocks.recordCollectedTouch.mockResolvedValue({ identityId: "i1", anonymousId: "anon-1", touchpointId: "t1", deduped: false });
  mocks.getAppSettings.mockResolvedValue({ journeyConsentMode: "implied" });
});

/**
 * Consent is enforced server-side — a landing page can't opt itself back in. Each
 * refusal is accepted-and-discarded (202) so the page never learns a visitor's
 * suppression state, and recordCollectedTouch must never run.
 */
describe("POST /api/v1/journey/collect — consent enforcement", () => {
  it("records a campaign arrival under implied consent", async () => {
    const res = await POST(req(arrival));
    expect(res.status).toBe(201);
    expect(mocks.recordCollectedTouch).toHaveBeenCalledTimes(1);
  });

  it("records nothing when the workspace has collection off", async () => {
    mocks.getAppSettings.mockResolvedValue({ journeyConsentMode: "off" });
    const res = await POST(req(arrival));
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "disabled", anonymousId: null });
    expect(mocks.recordCollectedTouch).not.toHaveBeenCalled();
  });

  it("refuses in explicit mode until the page signals consent", async () => {
    mocks.getAppSettings.mockResolvedValue({ journeyConsentMode: "explicit" });
    const refused = await POST(req(arrival));
    expect(refused.status).toBe(202);
    await expect(refused.json()).resolves.toMatchObject({ status: "consent_required" });
    expect(mocks.recordCollectedTouch).not.toHaveBeenCalled();

    const granted = await POST(req({ ...arrival, consent: true }));
    expect(granted.status).toBe(201);
    expect(mocks.recordCollectedTouch).toHaveBeenCalledTimes(1);
  });

  it("honors the Sec-GPC header even when the page claims consent", async () => {
    const res = await POST(req({ ...arrival, consent: true }, { "sec-gpc": "1" }));
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({ status: "gpc" });
    expect(mocks.recordCollectedTouch).not.toHaveBeenCalled();
  });

  it("refuses a suppressed (opted-out) visitor, consent claim notwithstanding", async () => {
    mocks.isIdentitySuppressed.mockResolvedValue(true);
    const res = await POST(req({ ...arrival, anonymousId: "anon-12345678", consent: true }));
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({ status: "opted_out" });
    expect(mocks.recordCollectedTouch).not.toHaveBeenCalled();
  });

  it("skips the suppression lookup for a brand-new visitor with no id", async () => {
    await POST(req(arrival));
    expect(mocks.isIdentitySuppressed).not.toHaveBeenCalled();
  });

  it("still rejects a beacon that resolves to no campaign", async () => {
    mocks.resolveCollectOrg.mockResolvedValue(null);
    const res = await POST(req(arrival));
    expect(res.status).toBe(400);
    expect(mocks.recordCollectedTouch).not.toHaveBeenCalled();
  });
});
