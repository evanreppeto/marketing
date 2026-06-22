import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "./settings-sections";

describe("settings sections", () => {
  it("includes a workspace team management section", () => {
    expect(SETTINGS_SECTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace",
          label: "Team",
        }),
      ]),
    );
  });

  it("includes a workspaces switcher section", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toContain("workspaces");
  });

  it("keeps company brand management out of settings", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).not.toContain("brand-kit");
  });
});
