vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
vi.mock("@/lib/media-library/persistence", () => ({
  insertAssetWithUrl: vi.fn(async () => ({ id: "asset_1", url: "https://store.example/logo.png" })),
}));

import { afterEach, describe, expect, it, vi } from "vitest";

import { storeBrandImageFromUrl } from "./brand-image";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";

afterEach(() => vi.restoreAllMocks());

describe("storeBrandImageFromUrl", () => {
  it("downloads an image and returns the stored asset url", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const url = await storeBrandImageFromUrl({
      orgId: "org_1", url: "https://acme.com/logo.png", role: "logo", sourceUrl: "https://acme.com", uploadedBy: "arc",
    });
    expect(url).toBe("https://store.example/logo.png");
    expect(insertAssetWithUrl).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org_1", source: "url", provenance: { brandRole: "logo", sourceUrl: "https://acme.com" } }),
    );
  });

  it("returns null when the image fetch is blocked (SSRF)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const url = await storeBrandImageFromUrl({
      orgId: "org_1", url: "http://127.0.0.1/logo.png", role: "logo", sourceUrl: "", uploadedBy: "arc",
    });
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
