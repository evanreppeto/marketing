import { describe, expect, it } from "vitest";

import {
  extractBrandKnowledgeBundleWithGemini,
  parseBrandKnowledgeExtractionJson,
  parseBrandKnowledgeJson,
  toBrandKnowledgeNodeInputs,
} from "./gemini-parser";

describe("parseBrandKnowledgeJson", () => {
  it("keeps only simple approved Brain node kinds from Gemini JSON", () => {
    const parsed = parseBrandKnowledgeJson(JSON.stringify({
      nodes: [
        {
          kind: "messaging_angle",
          label: "Use a calm expert voice",
          body: "Marketing copy should sound calm, local, and specific.",
          confidence: 91,
          tags: ["voice", "brand"],
        },
        {
          kind: "persona",
          label: "Emergency homeowner",
          body: "Homeowners in a water-loss emergency need calm reassurance and a direct phone CTA.",
          confidence: 86,
          tags: ["persona"],
        },
        {
          kind: "unknown_kind",
          label: "Ignore me",
        },
      ],
    }));

    expect(parsed).toEqual([
      {
        kind: "messaging_angle",
        label: "Use a calm expert voice",
        body: "Marketing copy should sound calm, local, and specific.",
        summary: null,
        confidence: 91,
        tags: ["voice", "brand"],
      },
      {
        kind: "persona",
        label: "Emergency homeowner",
        body: "Homeowners in a water-loss emergency need calm reassurance and a direct phone CTA.",
        summary: null,
        confidence: 86,
        tags: ["persona"],
      },
    ]);
  });
});

describe("toBrandKnowledgeNodeInputs", () => {
  it("ties AI-extracted nodes back to the source media asset", () => {
    const nodes = toBrandKnowledgeNodeInputs(
      {
        id: "asset-1",
        fileName: "Brand Guidelines.pdf",
        kind: "document",
        source: "google_drive",
        tags: [],
        availableToArc: true,
      },
      [
        {
          kind: "proof_point",
          label: "IICRC certified",
          body: "The company can cite IICRC certification when supported by the source.",
          summary: null,
          confidence: 88,
          tags: ["certification"],
        },
      ],
    );

    expect(nodes).toEqual([
      expect.objectContaining({
        kind: "proof_point",
        key: "media_asset:asset-1:ai:iicrc-certified",
        refTable: "media_assets",
        refId: "asset-1",
        source: "brand_source_gemini",
        sourceReference: "media_assets:asset-1",
        tags: expect.arrayContaining(["brand-source", "ai-extracted", "certification"]),
      }),
    ]);
  });
});

describe("parseBrandKnowledgeExtractionJson", () => {
  it("keeps valid brand palette colors from profile updates", () => {
    const parsed = parseBrandKnowledgeExtractionJson(JSON.stringify({
      profile: {
        brandColors: [
          { hex: "#143c5a", label: "Deep blue", source: "Brand guide" },
          { hex: "gold", label: "Bad" },
        ],
      },
      nodes: [],
    }));

    expect(parsed.profile?.brandColors).toEqual([
      { hex: "#143C5A", label: "Deep blue", source: "Brand guide" },
    ]);
  });
});

describe("extractBrandKnowledgeBundleWithGemini", () => {
  it("asks Gemini to extract visual identity themes from media assets", async () => {
    let prompt = "";

    await extractBrandKnowledgeBundleWithGemini(
      {
        id: "image-1",
        fileName: "Brand moodboard.png",
        kind: "image",
        source: "uploaded",
        tags: ["brand source"],
        availableToArc: true,
        contentType: "image/png",
        fileBytes: new Uint8Array([1, 2, 3]),
      },
      {
        generateText: async (nextPrompt) => {
          prompt = nextPrompt;
          return JSON.stringify({ profile: null, nodes: [] });
        },
      },
    );

    expect(prompt).toContain("visual themes");
    expect(prompt).toContain("colors");
  });
});
