import { describe, expect, it } from "vitest";

import { NEUTRAL_DEFAULTS } from "@/domain/brand-kit";

import { extractBrandKnowledgeBundleWithGemini, mergeBrandProfileUpdate, parseBrandKnowledgeJson, toBrandKnowledgeNodeInputs } from "./gemini-parser";

describe("mergeBrandProfileUpdate — vision palette", () => {
  it("fills the empty brand palette and short mark from a vision-extracted update", () => {
    const result = mergeBrandProfileUpdate(NEUTRAL_DEFAULTS, {
      brandPalette: { primary: { label: "Blue", hex: "#3b6ef5" }, headingFont: "Fraunces" },
      shortMark: "ST",
    });
    expect(result.brandPalette.primary).toEqual({ label: "Blue", hex: "#3b6ef5" });
    expect(result.brandPalette.headingFont).toBe("Fraunces");
    expect(result.shortMark).toBe("ST");
  });
});

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

  it("asks for and extracts a structured palette + short mark from a logo", async () => {
    let prompt = "";
    const { profile } = await extractBrandKnowledgeBundleWithGemini(
      {
        id: "logo-1",
        fileName: "logo.png",
        kind: "image",
        source: "uploaded",
        tags: [],
        availableToArc: true,
        contentType: "image/png",
        fileBytes: new Uint8Array([1, 2, 3]),
      },
      {
        generateText: async (nextPrompt) => {
          prompt = nextPrompt;
          return JSON.stringify({
            profile: {
              brandPalette: { primary: { label: "Brand Blue", hex: "#3B6EF5" }, accent: { label: "Amber", hex: "f2a93b" } },
              shortMark: "ST",
            },
            nodes: [],
          });
        },
      },
    );

    expect(prompt.toLowerCase()).toContain("palette");
    expect(profile?.brandPalette?.primary).toEqual({ label: "Brand Blue", hex: "#3B6EF5" });
    expect(profile?.shortMark).toBe("ST");
  });
});
