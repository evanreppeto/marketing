import { describe, expect, it } from "vitest";

import { describeProvenance, type Item } from "./studio-view";

/**
 * These pin the ONE media guardrail Studio still shows. The panel this replaced
 * rendered unconditional green checkmarks claiming "Background is an approved
 * Library photo — not stock or invented", "No faces requiring redaction · Privacy
 * scan clear" and a claim check — with no detector behind any of them. The point of
 * these tests is that every line is now derived from the selected item, and in
 * particular that nothing claims "approved" unless the item really is.
 */

const item = (over: Partial<Item> = {}): Item => ({ s: "<svg/>", l: "Roof — exterior", p: "real", url: "https://cdn/x.jpg", ...over });

describe("describeProvenance", () => {
  it("only says approved for real/composite media that is actually stored", () => {
    expect(describeProvenance(item({ p: "real" }))).toMatchObject({ tone: "ok", title: expect.stringContaining("Approved Library media") });
    expect(describeProvenance(item({ p: "comp" }))).toMatchObject({ tone: "ok" });
  });

  it("never claims approved for AI, stock or imported art", () => {
    for (const p of ["ai", "stock", "upload"] as const) {
      const note = describeProvenance(item({ p }));
      expect(note.tone).toBe("warn");
      expect(note.title).not.toContain("Approved");
    }
  });

  it("treats a missing stored asset as unapproved even when tagged real", () => {
    // The regression that mattered: demo/preview art tagged `real` used to render the
    // green "approved Library photo" line. No url = not in the Library.
    const note = describeProvenance(item({ p: "real", url: undefined }));
    expect(note.tone).toBe("warn");
    expect(note.title).toBe("Sample art — not a stored asset");
    expect(note.title).not.toContain("Approved");
  });

  it("says nothing at all when no background is selected", () => {
    const note = describeProvenance(undefined);
    expect(note.tone).toBe("warn");
    expect(note.title).toBe("No background selected");
  });

  it("names the actual selected item, so the line can't be a fixed string", () => {
    expect(describeProvenance(item({ l: "Crew on site" })).detail).toContain("Crew on site");
    expect(describeProvenance(item({ l: "AI hero", p: "ai" })).detail).toContain("AI hero");
  });

  it("makes no claim about faces, logos or unsupported claims — no detector exists", () => {
    const all = (["real", "comp", "ai", "stock", "upload"] as const).map((p) => describeProvenance(item({ p })));
    for (const note of [...all, describeProvenance(undefined)]) {
      const text = `${note.title} ${note.detail}`.toLowerCase();
      expect(text).not.toContain("privacy");
      expect(text).not.toContain("redaction");
      expect(text).not.toContain("legible");
      expect(text).not.toContain("claim check");
    }
  });
});
