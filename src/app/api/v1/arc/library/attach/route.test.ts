import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/campaigns/create", () => ({
  createCampaignShell: vi.fn(),
  promoteAssetToCampaign: vi.fn(),
}));
vi.mock("@/lib/media-library/arc-handoff", () => ({ resolveAvailableArcMediaAsset: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "workspace-1" })),
}));

import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { resolveAvailableArcMediaAsset } from "@/lib/media-library/arc-handoff";

import { POST } from "./route";

const shellMock = vi.mocked(createCampaignShell);
const promoteMock = vi.mocked(promoteAssetToCampaign);
const resolveMock = vi.mocked(resolveAvailableArcMediaAsset);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/library/attach", {
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
  resolveMock.mockReset();
  shellMock.mockResolvedValue({ campaignId: "camp_1" });
  promoteMock.mockResolvedValue({ assetId: "asset_1" });
  resolveMock.mockResolvedValue({
    public_url: "https://cdn/real.png",
    storage_path: "library/real.png",
    kind: "image",
    risk_flags: [],
  } as never);
});
afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POST /api/v1/arc/library/attach", () => {
  it("400s on an unknown asset_type instead of a late Postgres 502", async () => {
    configure();
    const res = await POST(req("Bearer secret", { library_asset_id: "lib-1", title: "x", campaign_id: "c1", asset_type: "banana" }));
    expect(res.status).toBe(400);
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("normalizes asset_type alias video_ad -> video_prompt", async () => {
    configure();
    const res = await POST(req("Bearer secret", { library_asset_id: "lib-1", title: "x", campaign_id: "c1", asset_type: "video_ad" }));
    expect(res.status).toBe(201);
    expect(promoteMock).toHaveBeenCalledWith(expect.objectContaining({ assetType: "video_prompt" }));
  });

  it("400s on an unknown persona / restoration_focus when creating a new campaign", async () => {
    configure();
    expect(
      (await POST(req("Bearer secret", { library_asset_id: "lib-1", title: "x", name: "N", persona: "persona_alien", restoration_focus: "flood" }))).status,
    ).toBe(400);
    expect(
      (await POST(req("Bearer secret", { library_asset_id: "lib-1", title: "x", name: "N", persona: "persona_landlord", restoration_focus: "lava" }))).status,
    ).toBe(400);
    expect(shellMock).not.toHaveBeenCalled();
  });

  it("normalizes restoration_focus water -> water_backup on the shell", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", { library_asset_id: "lib-1", title: "x", name: "N", persona: "persona_landlord", restoration_focus: "water" }),
    );
    expect(res.status).toBe(201);
    expect(shellMock).toHaveBeenCalledWith(expect.objectContaining({ restorationFocus: "water_backup" }));
  });
});
