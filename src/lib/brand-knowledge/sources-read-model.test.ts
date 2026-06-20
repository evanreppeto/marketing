import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media-library/read-model", () => ({ getMediaLibraryData: vi.fn() }));
vi.mock("@/lib/knowledge-graph/read-model", () => ({ listNodes: vi.fn() }));
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { listNodes } from "@/lib/knowledge-graph/read-model";
import { listBrandSources, getBrandSource } from "./sources-read-model";

const libMock = vi.mocked(getMediaLibraryData);
const nodesMock = vi.mocked(listNodes);

const docAsset = { id: "a1", fileName: "Brand Guide.pdf", kind: "document", source: "uploaded", tags: ["brand source"], riskFlags: [], availableToArc: true };
const blockedAsset = { id: "a2", fileName: "Secret.pdf", kind: "document", source: "uploaded", tags: [], riskFlags: [], availableToArc: false };
const imageAsset = { id: "a3", fileName: "photo.jpg", kind: "image", source: "uploaded", tags: [], riskFlags: [], availableToArc: true };

function liveLib(assets: unknown[]) { libMock.mockResolvedValue({ status: "live", assets, folders: [], totalBytes: 0 } as never); }
function liveNodes(nodes: unknown[]) { nodesMock.mockResolvedValue({ status: "live", nodes } as never); }

describe("listBrandSources", () => {
  it("returns availableToArc brand sources with node stats; excludes blocked + non-source", async () => {
    liveLib([docAsset, blockedAsset, imageAsset]);
    liveNodes([
      { id: "n1", kind: "brand_fact", label: "x", body: null, summary: null, trustTier: "trusted", source: null, refTable: "media_assets", refId: "a1" },
      { id: "n2", kind: "proof_point", label: "y", body: null, summary: null, trustTier: "proposed", source: null, refTable: "media_assets", refId: "a1" },
    ]);
    const out = await listBrandSources();
    expect(out.map((d) => d.id)).toEqual(["a1"]); // a2 blocked, a3 not a brand source (image, low confidence)
    expect(out[0].brain).toEqual({ total: 2, trusted: 1, proposed: 1 });
    expect(out[0].classification.label).toBeTruthy();
  });
  it("returns [] when the library is unavailable", async () => {
    libMock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect(await listBrandSources()).toEqual([]);
  });
});

describe("getBrandSource", () => {
  it("returns the doc + its nodes (including proposed)", async () => {
    liveLib([docAsset]);
    liveNodes([
      { id: "n2", kind: "proof_point", label: "Proof", body: "Document preview: …", summary: "reason", trustTier: "proposed", source: "brand_source_ingestion", refTable: "media_assets", refId: "a1" },
    ]);
    const doc = await getBrandSource("a1");
    expect(doc?.fileName).toBe("Brand Guide.pdf");
    expect(doc?.nodes).toHaveLength(1);
    expect(doc?.nodes[0]).toMatchObject({ kind: "proof_point", trustTier: "proposed", label: "Proof" });
  });
  it("returns null for a blocked / non-source / missing id", async () => {
    liveLib([docAsset, blockedAsset]);
    liveNodes([]);
    expect(await getBrandSource("a2")).toBeNull();   // blocked
    expect(await getBrandSource("nope")).toBeNull();  // missing
  });
  it("returns null when the library is unavailable", async () => {
    libMock.mockResolvedValue({ status: "unavailable", message: "no db" } as never);
    expect(await getBrandSource("a1")).toBeNull();
  });
});
