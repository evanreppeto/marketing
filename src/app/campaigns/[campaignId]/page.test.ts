import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the read-model before importing generateMetadata
vi.mock("@/lib/campaigns/read-model", () => ({
  getCampaignWorkspaceDetail: vi.fn(),
}));

// Mock other imports that get pulled in transitively or directly
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { generateMetadata } from "./page";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";

const mockGetDetail = getCampaignWorkspaceDetail as ReturnType<typeof vi.fn>;

describe("CampaignDetailPage generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the campaign name when found", async () => {
    mockGetDetail.mockResolvedValue({
      status: "live",
      campaign: { name: "Spring Flood Push" },
    });
    const result = await generateMetadata({ params: Promise.resolve({ campaignId: "abc" }) });
    expect(result).toEqual({ title: "Spring Flood Push" });
  });

  it("returns fallback 'Campaign' when not found", async () => {
    mockGetDetail.mockResolvedValue({ status: "not_found" });
    const result = await generateMetadata({ params: Promise.resolve({ campaignId: "missing" }) });
    expect(result).toEqual({ title: "Campaign" });
  });

  it("returns fallback 'Campaign' when fetch throws", async () => {
    mockGetDetail.mockRejectedValue(new Error("DB offline"));
    const result = await generateMetadata({ params: Promise.resolve({ campaignId: "err" }) });
    expect(result).toEqual({ title: "Campaign" });
  });
});
