import { describe, expect, it } from "vitest";

import { CREATIVE_TEMPLATE_IDS, selectCreativeTemplate } from "@/domain/creative-templates";

import { TEMPLATES } from "./studio-view";

/**
 * Studio's template tiles send their `id` to generateStudioAsset as the template
 * hint. selectCreativeTemplate only honours a hint that is a known template id —
 * anything else silently falls back to hashing the background URL, which is the bug
 * this wiring fixed (pick "Minimal", get whatever the seed hashed to). So a drift
 * between these ids and the domain list must fail loudly here rather than quietly
 * restore random template selection.
 */
describe("Studio template picker ids", () => {
  it("every tile id is a real creative template id", () => {
    for (const t of TEMPLATES) {
      expect(CREATIVE_TEMPLATE_IDS).toContain(t.id);
    }
  });

  it("each tile id actually survives selectCreativeTemplate as a hint", () => {
    for (const t of TEMPLATES) {
      // A seed that would hash to something else if the hint were ignored.
      expect(selectCreativeTemplate({ hint: t.id, seed: "https://example.com/bg.jpg" })).toBe(t.id);
    }
  });

  it("covers the full set, so no template is unreachable from the UI", () => {
    expect([...TEMPLATES.map((t) => t.id)].sort()).toEqual([...CREATIVE_TEMPLATE_IDS].sort());
  });
});
