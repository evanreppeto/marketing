import { beforeEach, describe, expect, it, vi } from "vitest";

const ASSETS = [
  { id: "a1", fileName: "roof.jpg", url: "https://cdn/roof.jpg", kind: "image", source: "uploaded", riskFlags: [] },
  { id: "a2", fileName: "clip.mp4", url: "https://cdn/clip.mp4", kind: "video", source: "ai_generated", riskFlags: ["ai"] },
];

const promote = vi.fn(async () => ({ assetId: "ca-1" }));
const campaignRow: { id: string; name: string } | null = { id: "camp-1", name: "Storm Response" };
const state = { campaign: campaignRow as { id: string; name: string } | null };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn(async () => {}), getOperatorActor: vi.fn(async () => "evan") }));
vi.mock("@/lib/auth/org", () => ({ getCurrentOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/brain-ingestion/sync", () => ({ removeMediaRecordFromBrain: vi.fn(), syncMediaRecordToBrain: vi.fn() }));
vi.mock("@/lib/media-library/persistence", () => ({
  createFolder: vi.fn(), deleteAsset: vi.fn(), deleteFolder: vi.fn(), insertAssetWithUrl: vi.fn(),
  renameAsset: vi.fn(), renameFolder: vi.fn(), setAssetTags: vi.fn(), setAvailableToArc: vi.fn(),
}));
vi.mock("@/lib/media-library/upload-policy", () => ({ MAX_UPLOAD_BYTES: 1, acceptUpload: vi.fn(), kindForContentType: vi.fn() }));
vi.mock("@/lib/media-library/ingest-intelligence", () => ({ scanMediaIngest: vi.fn() }));
vi.mock("@/lib/media-library/fetch-remote", () => ({ fetchRemoteMedia: vi.fn() }));
vi.mock("@/lib/media-library/read-model", () => ({
  getMediaLibraryData: vi.fn(async () => ({ status: "live", assets: ASSETS, folders: [], totalBytes: 0 })),
}));
vi.mock("@/lib/campaigns/create", () => ({ promoteAssetToCampaign: promote }));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.campaign, error: null }) }) }) }),
    }),
  })),
}));

const { addLibraryAssetsToCampaign } = await import("./actions");

beforeEach(() => {
  promote.mockClear();
  state.campaign = { id: "camp-1", name: "Storm Response" };
});

/**
 * The control this backs used to be a bare link to /campaigns: it navigated away
 * and the operator's selection was silently discarded, so nothing was ever added.
 * These pin that it now actually attaches — and that it can't be used to reach
 * across workspaces.
 */
describe("addLibraryAssetsToCampaign", () => {
  it("promotes each selected asset onto the campaign", async () => {
    const res = await addLibraryAssetsToCampaign({ assetIds: ["a1", "a2"], campaignId: "camp-1" });
    expect(res).toMatchObject({ ok: true, persisted: true, added: 2, campaignName: "Storm Response" });
    expect(promote).toHaveBeenCalledTimes(2);
  });

  it("carries media kind + provenance through to the campaign asset", async () => {
    await addLibraryAssetsToCampaign({ assetIds: ["a2"], campaignId: "camp-1" });
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp-1",
        assetType: "video_ad",
        mediaUrl: "https://cdn/clip.mp4",
        media: { source: "ai_generated", riskFlags: ["ai"] },
      }),
    );
  });

  it("refuses an empty selection or a missing campaign", async () => {
    expect(await addLibraryAssetsToCampaign({ assetIds: [], campaignId: "camp-1" })).toMatchObject({ ok: false });
    expect(await addLibraryAssetsToCampaign({ assetIds: ["a1"], campaignId: "  " })).toMatchObject({ ok: false });
    expect(promote).not.toHaveBeenCalled();
  });

  it("ignores asset ids that aren't this workspace's, rather than trusting the browser", async () => {
    const res = await addLibraryAssetsToCampaign({ assetIds: ["a1", "someone-elses-asset"], campaignId: "camp-1" });
    expect(res).toMatchObject({ ok: true, added: 1 });
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it("refuses entirely when NO id belongs to this workspace", async () => {
    const res = await addLibraryAssetsToCampaign({ assetIds: ["nope"], campaignId: "camp-1" });
    expect(res).toMatchObject({ ok: false });
    expect(promote).not.toHaveBeenCalled();
  });

  it("refuses a campaign outside this workspace", async () => {
    state.campaign = null;
    const res = await addLibraryAssetsToCampaign({ assetIds: ["a1"], campaignId: "other-org-campaign" });
    expect(res).toMatchObject({ ok: false });
    expect(promote).not.toHaveBeenCalled();
  });

  it("dedupes repeated ids so one asset can't be attached twice", async () => {
    const res = await addLibraryAssetsToCampaign({ assetIds: ["a1", "a1", "a1"], campaignId: "camp-1" });
    expect(res).toMatchObject({ ok: true, added: 1 });
    expect(promote).toHaveBeenCalledTimes(1);
  });
});
