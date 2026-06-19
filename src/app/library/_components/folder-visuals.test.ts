import { describe, expect, it } from "vitest";

import { folderToneForName } from "./folder-visuals";

describe("folderToneForName", () => {
  it("uses recognizable colors for common restoration folder names", () => {
    expect(folderToneForName("[Demo] Water Damage").accent).toBe("#38BDF8");
    expect(folderToneForName("[Demo] Fire & Smoke").accent).toBe("#F97316");
    expect(folderToneForName("[Demo] Mold Remediation").accent).toBe("#22C55E");
    expect(folderToneForName("[Demo] Brand Assets").accent).toBe("#D6B25E");
  });

  it("keeps the all-media root neutral", () => {
    expect(folderToneForName("All media", true).accent).toBe("#9CA3AF");
  });

  it("gives the demo tree folders distinct accents", () => {
    const names = [
      "[Demo] Job Photos",
      "[Demo] Water Damage",
      "[Demo] Before",
      "[Demo] After",
      "[Demo] Fire & Smoke",
      "[Demo] Mold Remediation",
      "[Demo] Brand Assets",
    ];

    const accents = names.map((name) => folderToneForName(name).accent);

    expect(new Set(accents).size).toBe(names.length);
  });
});
