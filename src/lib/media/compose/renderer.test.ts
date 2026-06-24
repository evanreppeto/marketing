import { describe, expect, it } from "vitest";

import { toBrandTokens } from "@/domain";
import { renderCreative } from "./renderer";

// A 1x1 transparent PNG as a data: URL — Node's fetch resolves data: URLs natively,
// so we DON'T stub global fetch (stubbing it breaks @vercel/og's WASM load).
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("renderCreative", () => {
  it("renders the bold template to a non-empty PNG", async () => {
    const brand = toBrandTokens(null); // logoUrl null → only the background is fetched
    const out = await renderCreative({
      template: "bold",
      format: "1:1",
      brand,
      copy: { headline: "Flooded? On-site in 60 minutes.", kicker: "24/7 Water Emergency", ctaLabel: "Call now" },
      backgroundUrl: TINY_PNG_DATA_URL,
    });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes.length).toBeGreaterThan(1000);
    expect(out.bytes.subarray(0, 4).toString("hex")).toBe("89504e47"); // PNG magic
  }, 30000); // ImageResponse + WASM init can be slow on first run

  it("renders every template across square and portrait", async () => {
    const brand = toBrandTokens(null);
    for (const template of ["bold", "editorial", "minimal"] as const) {
      for (const format of ["1:1", "4:5"] as const) {
        const out = await renderCreative({
          template,
          format,
          brand,
          copy: { headline: "We restore. You recover.", kicker: "Storm Response", ctaLabel: "Get help" },
          backgroundUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        });
        expect(out.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
      }
    }
  }, 30000);
});
