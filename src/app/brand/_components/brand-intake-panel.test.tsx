import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandIntakePanel } from "./brand-intake-panel";

describe("BrandIntakePanel", () => {
  it("renders one brand intake form for notes, website, and assets", () => {
    const html = renderToStaticMarkup(<BrandIntakePanel defaultWebsite="https://example.com" />);

    expect(html).toContain("Tell Arc about the brand");
    expect(html).toContain("Upload brand files");
    expect(html).toContain("PDFs, logos, photos, voice docs, persona docs, proof, offers, and examples");
    expect(html).toContain('name="brandNotes"');
    expect(html).toContain('name="websiteUrl"');
    expect(html).toContain('value="https://example.com"');
    expect(html).toContain('name="files"');
    expect(html).toContain("Teach Arc");
  });
});
