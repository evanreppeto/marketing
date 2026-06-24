import { afterEach, describe, expect, it, vi } from "vitest";

import { toBrandTokens } from "@/domain";
import { renderCreative } from "./renderer";

// 1x1 transparent PNG, used as both background and logo fetch responses.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

afterEach(() => vi.unstubAllGlobals());

describe("renderCreative", () => {
  // next/og can't initialize under vitest here; covered by the route test (Task 5) + live verification (Task 7)
  it.skip("renders the bold template to a non-empty PNG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(TINY_PNG, { headers: { "content-type": "image/png" } })),
    );
    const brand = toBrandTokens(null);
    const out = await renderCreative({
      template: "bold",
      format: "1:1",
      brand,
      copy: { headline: "Flooded? On-site in 60 minutes.", kicker: "24/7 Water Emergency", ctaLabel: "Call now" },
      backgroundUrl: "https://cdn.example/bg.png",
    });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes.length).toBeGreaterThan(1000);
    // PNG magic bytes
    expect(out.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
