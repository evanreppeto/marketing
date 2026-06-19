import { describe, it, expect } from "vitest";
import { buildBusinessProfileFromForm } from "./form";
import { NEUTRAL_DEFAULTS } from "@/domain";

function makeForm(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe("buildBusinessProfileFromForm", () => {
  it("returns a displayName from the form", () => {
    const fd = makeForm({ displayName: "BSR" });
    const result = buildBusinessProfileFromForm(fd, NEUTRAL_DEFAULTS);
    expect(result.displayName).toBe("BSR");
  });

  it("reads palette color slots from form fields", () => {
    const fd = makeForm({
      palette_primary_hex: "#1B2A4A",
      palette_primary_label: "Navy",
      palette_secondary_hex: "#C8A24B",
      palette_secondary_label: "",
      palette_accent_hex: "#C8A24B",
      palette_accent_label: "Gold",
      palette_dark_hex: "#101317",
      palette_dark_label: "",
      palette_light_hex: "#FFFFFF",
      palette_light_label: "White",
    });
    const result = buildBusinessProfileFromForm(fd, NEUTRAL_DEFAULTS);
    expect(result.brandPalette.primary).toEqual({ hex: "#1B2A4A", label: "Navy" });
    expect(result.brandPalette.accent).toEqual({ hex: "#C8A24B", label: "Gold" });
    expect(result.brandPalette.dark).toEqual({ hex: "#101317", label: "" });
  });

  it("reads palette heading and body fonts", () => {
    const fd = makeForm({
      palette_heading_font: "Oswald",
      palette_body_font: "Inter",
    });
    const result = buildBusinessProfileFromForm(fd, NEUTRAL_DEFAULTS);
    expect(result.brandPalette.headingFont).toBe("Oswald");
    expect(result.brandPalette.bodyFont).toBe("Inter");
  });

  it("returns empty strings for missing palette fields", () => {
    const fd = makeForm({});
    const result = buildBusinessProfileFromForm(fd, NEUTRAL_DEFAULTS);
    expect(result.brandPalette.primary).toEqual({ hex: "", label: "" });
    expect(result.brandPalette.headingFont).toBe("");
  });
});
