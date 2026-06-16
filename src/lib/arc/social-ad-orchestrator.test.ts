import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { runArcSocialAd } from "./social-ad-orchestrator";

type InsertArg = {
  company_id?: unknown;
  asset_type?: string;
  status?: string;
  dispatch_locked?: boolean;
  launch_locked?: boolean;
  locked_until_approved?: boolean;
  source_signal?: Record<string, unknown>;
  audit_payload?: { media_assets?: Array<{ url: string; type?: string }> };
};

function insertsByTable(supabase: MockSupabase, table: string): InsertArg[] {
  const out: InsertArg[] = [];
  let current: string | null = null;
  for (const [method, arg] of supabase.calls) {
    if (method === "from") current = arg as string;
    else if (method === "insert" && current === table) out.push(arg as InsertArg);
  }
  return out;
}

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const validRequest = {
  workflow: "social_ad",
  name: "Storm Damage Safety",
  persona: "persona_homeowner_emergency",
  restorationFocus: "storm_surge",
  headline: "Tree on the roof?",
  operator: "Arc",
  assets: [
    { imageBase64: PNG_B64, format: "feed_1080x1080" },
    { imageBase64: PNG_B64, format: "story_1080x1920" },
  ],
};

describe("runArcSocialAd", () => {
  it("uploads each image to app storage and records ONE campaign with a deliverable per image", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-1" }, error: null },
      campaign_assets: { data: { id: "asset-1" }, error: null },
      approval_items: { data: { id: "appr-1" }, error: null },
    });

    const uploaded: Array<{ path: string; bytes: number; contentType: string }> = [];
    const fakeUpload = async (path: string, bytes: Uint8Array, contentType: string) => {
      uploaded.push({ path, bytes: bytes.length, contentType });
      return `https://app.example/storage/v1/object/public/${path}`;
    };

    const result = await runArcSocialAd(validRequest, supabase, fakeUpload);
    expect(result.status).toBe("needs_approval");
    expect(result.campaignAssetIds).toHaveLength(2);

    // Each image was uploaded as PNG.
    expect(uploaded).toHaveLength(2);
    expect(uploaded.every((u) => u.contentType === "image/png")).toBe(true);
    expect(uploaded.every((u) => u.bytes > 0)).toBe(true);

    // No CRM pollution.
    expect(insertsByTable(supabase, "companies")).toHaveLength(0);

    // Exactly ONE campaign; one asset + approval per image.
    const campaigns = insertsByTable(supabase, "campaigns");
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].company_id).toBeNull();
    expect(campaigns[0].launch_locked).toBe(true);

    const assets = insertsByTable(supabase, "campaign_assets");
    expect(assets).toHaveLength(2);
    expect(assets.every((a) => a.asset_type === "social_ad")).toBe(true);
    expect(assets.every((a) => a.dispatch_locked === true)).toBe(true);
    // The stored media URL is the app-hosted upload URL, classified as an ad/image.
    const mediaUrls = assets.flatMap((a) => a.audit_payload?.media_assets?.map((m) => m.url) ?? []);
    expect(mediaUrls.every((u) => u.startsWith("https://app.example/storage/"))).toBe(true);
    expect(mediaUrls).toHaveLength(2);

    const approvals = insertsByTable(supabase, "approval_items");
    expect(approvals).toHaveLength(2);
    expect(approvals.every((a) => a.locked_until_approved === true)).toBe(true);
  });
});
