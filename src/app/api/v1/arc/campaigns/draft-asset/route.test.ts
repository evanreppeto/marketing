import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/campaigns/create", () => ({
  createCampaignShell: vi.fn(),
  promoteAssetToCampaign: vi.fn(),
}));

import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";

import { POST } from "./route";

const shellMock = vi.mocked(createCampaignShell);
const promoteMock = vi.mocked(promoteAssetToCampaign);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/campaigns/draft-asset", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  shellMock.mockReset();
  promoteMock.mockReset();
  shellMock.mockResolvedValue({ campaignId: "camp_1" });
  promoteMock.mockResolvedValue({ assetId: "asset_1" });
});

afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/campaigns/draft-asset", () => {
  it("returns 401 without a valid token and never writes", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(req("Bearer wrong", { asset_type: "social_ad", title: "x" }));
    expect(res.status).toBe(401);
    expect(shellMock).not.toHaveBeenCalled();
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("400s when asset_type or title is missing", async () => {
    configure();
    expect((await POST(req("Bearer secret", { title: "x" }))).status).toBe(400);
    expect((await POST(req("Bearer secret", { asset_type: "social_ad" }))).status).toBe(400);
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("400s when creating a new campaign without name/persona/restoration_focus", async () => {
    configure();
    const res = await POST(req("Bearer secret", { asset_type: "social_ad", title: "Fall ad" }));
    expect(res.status).toBe(400);
    expect(shellMock).not.toHaveBeenCalled();
  });

  it("creates a shell + asset and returns 201 with both ids", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", {
        asset_type: "social_ad",
        title: "Fall ad",
        body: "Before winter…",
        name: "Fall Water Push",
        persona: "persona_homeowner_emergency",
        restoration_focus: "water",
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      ok: true,
      status: "created",
      campaignId: "camp_1",
      assetId: "asset_1",
    });
    expect(shellMock).toHaveBeenCalledOnce();
    expect(promoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp_1", assetType: "social_ad", title: "Fall ad", operator: "Arc" }),
    );
  });

  it("attaches to an existing campaign without creating a shell", async () => {
    configure();
    const res = await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Reminder" }));
    expect(res.status).toBe(201);
    expect(shellMock).not.toHaveBeenCalled();
    expect(promoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp_existing", assetType: "email" }),
    );
  });
});
