import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { classifyBrandSource } from "./source-classifier";
import { learnBrandKnowledgeFromAsset, proposeBrandKnowledgeNodes } from "./brain-sync";

describe("proposeBrandKnowledgeNodes", () => {
  it("creates proposed Brain inputs tied to the media asset source", () => {
    const asset = {
      id: "asset-1",
      fileName: "2026 Brand Guidelines.pdf",
      kind: "document" as const,
      source: "google_drive",
      url: "https://example.com/brand.pdf",
      tags: ["brand"],
      availableToArc: true,
    };

    const nodes = proposeBrandKnowledgeNodes(asset, classifyBrandSource(asset));

    expect(nodes).toEqual([
      expect.objectContaining({
        kind: "brand_fact",
        key: "media_asset:asset-1:brand_guidelines",
        label: "Brand guide source: 2026 Brand Guidelines.pdf",
        refTable: "media_assets",
        refId: "asset-1",
        source: "brand_source_ingestion",
        sourceReference: "media_assets:asset-1",
        tags: expect.arrayContaining(["brand-source", "brand_guidelines", "google_drive"]),
      }),
    ]);
  });

  it("maps voice and proof documents into the gated Brain review kinds", () => {
    const voiceAsset = {
      id: "voice-1",
      fileName: "Messaging and tone guide.pdf",
      kind: "document" as const,
      source: "uploaded",
      url: "https://example.com/voice.pdf",
      tags: [],
      availableToArc: true,
    };
    const proofAsset = {
      id: "proof-1",
      fileName: "Customer reviews and certifications.pdf",
      kind: "document" as const,
      source: "uploaded",
      url: "https://example.com/proof.pdf",
      tags: [],
      availableToArc: true,
    };

    expect(proposeBrandKnowledgeNodes(voiceAsset, classifyBrandSource(voiceAsset))[0].kind).toBe("messaging_angle");
    expect(proposeBrandKnowledgeNodes(proofAsset, classifyBrandSource(proofAsset))[0].kind).toBe("proof_point");
  });

  it("does not propose Brain nodes for assets hidden from Arc", () => {
    const asset = {
      id: "asset-2",
      fileName: "Brand book.pdf",
      kind: "document" as const,
      source: "uploaded",
      url: "https://example.com/private.pdf",
      tags: [],
      availableToArc: false,
    };

    expect(proposeBrandKnowledgeNodes(asset, classifyBrandSource(asset))).toEqual([]);
  });

  it("includes extracted document text when available", () => {
    const asset = {
      id: "asset-3",
      fileName: "Brand Guidelines.pdf",
      kind: "document" as const,
      source: "google_drive",
      url: "https://example.com/brand.pdf",
      tags: [],
      availableToArc: true,
      extractedText: "Brand voice should be clear, confident, and specific.",
    };

    const [node] = proposeBrandKnowledgeNodes(asset, classifyBrandSource(asset));

    expect(node.body).toContain("Document preview: Brand voice should be clear");
  });
});

describe("learnBrandKnowledgeFromAsset", () => {
  it("writes missing brand source proposals into Brain", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: [], error: null },
        { data: { id: "node-1" }, error: null },
      ],
    });

    const result = await learnBrandKnowledgeFromAsset(
      {
        id: "asset-1",
        fileName: "Brand Guidelines.pdf",
        kind: "document",
        source: "google_drive",
        tags: [],
        availableToArc: true,
      },
      { client: supabase as never, orgId: "org-1" },
    );

    expect(result).toEqual({ created: 1, skipped: 0, errors: [] });
    const insertCall = supabase.calls.find(([method]) => method === "insert");
    expect(insertCall?.[1]).toEqual(
      expect.objectContaining({
        kind: "brand_fact",
        trust_tier: "proposed",
        ref_table: "media_assets",
        ref_id: "asset-1",
      }),
    );
  });

  it("writes AI-extracted brand facts from readable source text", async () => {
    const supabase = createSupabaseQueryMock({
      knowledge_nodes: [
        { data: [], error: null },
        { data: { id: "node-1" }, error: null },
        { data: { id: "node-2" }, error: null },
      ],
    });

    const result = await learnBrandKnowledgeFromAsset(
      {
        id: "asset-parse",
        fileName: "Brand Guidelines.pdf",
        kind: "document",
        source: "google_drive",
        tags: [],
        availableToArc: true,
        extractedText: "Voice: clear and calm. Proof: IICRC certified.",
      },
      {
        client: supabase as never,
        orgId: "org-1",
        extractNodes: async () => [
          {
            kind: "messaging_angle",
            key: "media_asset:asset-parse:ai:clear-calm-voice",
            label: "Use a clear, calm voice",
            body: "The brand voice should be clear and calm.",
            refTable: "media_assets",
            refId: "asset-parse",
            source: "brand_source_gemini",
            tags: ["brand-source", "ai-extracted"],
          },
        ],
      },
    );

    expect(result).toEqual({ created: 2, skipped: 0, errors: [] });
    expect(supabase.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "messaging_angle",
        trust_tier: "proposed",
        key: "media_asset:asset-parse:ai:clear-calm-voice",
      }),
    ]);
  });
});
