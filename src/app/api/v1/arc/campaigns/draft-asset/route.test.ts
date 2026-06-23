import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/campaigns/create", () => ({
  createCampaignShell: vi.fn(),
  promoteAssetToCampaign: vi.fn(),
}));

vi.mock("@/lib/opportunities/persistence", () => ({ markOpportunityDrafted: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1",
    workspaceId: "workspace-1",
  })),
}));

vi.mock("@/lib/arc-chat/persistence", () => ({ linkConversationToCampaign: vi.fn(async () => undefined) }));
import { linkConversationToCampaign } from "@/lib/arc-chat/persistence";
const linkMock = vi.mocked(linkConversationToCampaign);

import { createCampaignShell, promoteAssetToCampaign } from "@/lib/campaigns/create";
import { markOpportunityDrafted } from "@/lib/opportunities/persistence";

import { POST } from "./route";

const shellMock = vi.mocked(createCampaignShell);
const promoteMock = vi.mocked(promoteAssetToCampaign);
const markDraftedMock = vi.mocked(markOpportunityDrafted);

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
  markDraftedMock.mockReset();
  linkMock.mockReset();
  shellMock.mockResolvedValue({ campaignId: "camp_1" });
  promoteMock.mockResolvedValue({ assetId: "asset_1" });
  markDraftedMock.mockResolvedValue({ ok: true });
  linkMock.mockResolvedValue(undefined);
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

  it("400s on an out-of-enum asset_type (clean reject, not a late DB 502)", async () => {
    configure();
    const res = await POST(req("Bearer secret", { asset_type: "video_ad", title: "Clip" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("video_ad");
    expect(shellMock).not.toHaveBeenCalled();
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("400s on an out-of-enum restoration_focus when creating a new campaign", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", {
        asset_type: "social_ad",
        title: "Fall ad",
        name: "Fall Push",
        persona: "persona_homeowner_emergency",
        restoration_focus: "water",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("water");
    expect(shellMock).not.toHaveBeenCalled();
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
        restoration_focus: "water_backup",
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
    expect(shellMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: { org_id: "org-1", workspace_id: "workspace-1" } }),
    );
    expect(promoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp_1",
        assetType: "social_ad",
        title: "Fall ad",
        operator: "Arc",
        tenant: { org_id: "org-1", workspace_id: "workspace-1" },
      }),
    );
  });

  it("attaches to an existing campaign without creating a shell", async () => {
    configure();
    const res = await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Reminder" }));
    expect(res.status).toBe(201);
    expect(shellMock).not.toHaveBeenCalled();
    expect(promoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp_existing",
        assetType: "email",
        tenant: { org_id: "org-1", workspace_id: "workspace-1" },
      }),
    );
  });

  it("links the opportunity when opportunity_id is provided", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Re-engage", opportunity_id: "opp-1" }));
    expect(markOpportunityDrafted).toHaveBeenCalledWith("opp-1", "camp_existing", undefined, { orgId: "org-1" });
  });

  it("does not link an opportunity when opportunity_id is absent", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Plain" }));
    expect(markOpportunityDrafted).not.toHaveBeenCalled();
  });

  it("forwards media url, path, and generation provenance to persistence", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", {
        campaign_id: "camp_existing",
        asset_type: "image_prompt",
        title: "Concept",
        media_url: "https://signed/img.png",
        media_path: "arc-generated/abc.png",
        media: { source: "ai_generated", model: "gemini-2.5-flash-image", jobId: "job_1", format: "1:1", riskFlags: ["claim risk"] },
      }),
    );
    expect(res.status).toBe(201);
    expect(promoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: "https://signed/img.png",
        mediaPath: "arc-generated/abc.png",
        media: expect.objectContaining({ source: "ai_generated", model: "gemini-2.5-flash-image", jobId: "job_1", riskFlags: ["claim risk"] }),
      }),
    );
  });

  it("calls linkConversationToCampaign with conversation_id and campaign_id when provided", async () => {
    configure();
    const res = await POST(
      req("Bearer secret", {
        campaign_id: "camp_existing",
        asset_type: "email",
        title: "Hi",
        conversation_id: "conv1",
      }),
    );
    expect(res.status).toBe(201);
    expect(linkMock).toHaveBeenCalledWith("conv1", "camp_existing", expect.any(String));
  });

  it("does not call linkConversationToCampaign when conversation_id is absent", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Plain" }));
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("still returns 201 when linkConversationToCampaign throws (best-effort)", async () => {
    configure();
    linkMock.mockRejectedValue(new Error("boom"));
    const res = await POST(
      req("Bearer secret", {
        campaign_id: "camp_existing",
        asset_type: "email",
        title: "Hi",
        conversation_id: "conv1",
      }),
    );
    expect(res.status).toBe(201);
  });
});
