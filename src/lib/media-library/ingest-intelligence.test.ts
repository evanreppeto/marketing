import { describe, expect, it } from "vitest";

import { scanMediaIngest } from "./ingest-intelligence";

describe("scanMediaIngest", () => {
  it("flags filename review concerns on visual media", () => {
    const scan = scanMediaIngest({ fileName: "before-after-homeowner-face.jpg", kind: "image" });
    expect(scan.riskFlags).toContain("claim risk");
    expect(scan.riskFlags).toContain("privacy/redaction");
  });

  it("scans a declared generation prompt like Arc's own generations", () => {
    const scan = scanMediaIngest({
      fileName: "render.png",
      kind: "image",
      provenance: { tool: "higgsfield", prompt: "flooded basement with a guarantee headline" },
    });
    expect(scan.riskFlags).toContain("unrealistic scene");
    expect(scan.riskFlags).toContain("claim risk");
    expect(scan.riskFlags).toContain("embedded text");
    expect(scan.riskFlags).not.toContain("unverified AI provenance");
  });

  it("marks AI output that arrives without its prompt as unverified", () => {
    const scan = scanMediaIngest({ fileName: "render.png", kind: "image", provenance: { tool: "gemini" } });
    expect(scan.riskFlags).toContain("unverified AI provenance");
  });

  it("does not run scene heuristics on documents", () => {
    const scan = scanMediaIngest({ fileName: "fire-damage-claims-guide.pdf", kind: "document" });
    expect(scan.riskFlags).toEqual([]);
  });

  it("tags from the filename with the tool first", () => {
    const scan = scanMediaIngest({ fileName: "storm-roof.png", kind: "image", provenance: { tool: "Higgsfield" } });
    expect(scan.tags).toEqual(["higgsfield", "storm", "roof"]);
  });
});
