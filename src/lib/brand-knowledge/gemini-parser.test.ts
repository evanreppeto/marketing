import { describe, expect, it } from "vitest";

import { parseBrandKnowledgeJson, toBrandKnowledgeNodeInputs } from "./gemini-parser";

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
