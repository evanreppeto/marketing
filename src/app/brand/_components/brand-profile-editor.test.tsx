import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NEUTRAL_DEFAULTS } from "@/domain";

import { BrandProfileEditor } from "./brand-profile-editor";

describe("BrandProfileEditor", () => {
  it("renders brand fields with explicit labels and helper associations", () => {
    const html = renderToStaticMarkup(<BrandProfileEditor profile={NEUTRAL_DEFAULTS} />);

    expect(html).toContain('for="brand-services"');
    expect(html).toContain('id="brand-services"');
    expect(html).toContain('name="services"');
    expect(html).toContain('aria-describedby="brand-services-help"');
    expect(html).toContain('id="brand-services-help"');
  });
});
