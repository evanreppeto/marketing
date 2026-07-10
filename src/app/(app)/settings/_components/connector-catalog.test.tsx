import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConnectorView } from "@/lib/connectors/read-model";

import { ConnectorCatalog } from "./connector-catalog";

// A tiny factory so each test only spells out the fields it cares about.
function view(
  partial: Pick<ConnectorView, "key" | "kind" | "label" | "costTier" | "verticals" | "available"> & Partial<ConnectorView>,
): ConnectorView {
  return {
    description: `${partial.label} does a thing.`,
    authKind: "none",
    access: "read_only",
    enabled: false,
    credentialPresent: false,
    credentialOptional: true,
    config: {},
    status: "disabled",
    lastTestedAt: null,
    lastTestOk: null,
    lastTestError: null,
    ...partial,
  };
}

const CONNECTORS: ConnectorView[] = [
  view({ key: "weather-signals", kind: "signal_source", label: "Weather Signals", costTier: "free", verticals: ["restoration", "home_services"], available: true }),
  view({ key: "listing-signals", kind: "signal_source", label: "New Property Listings", costTier: "free", verticals: ["real_estate"], available: false }),
  view({ key: "sms-dispatch", kind: "channel", label: "SMS Outreach", costTier: "metered", verticals: ["home_services"], available: false }),
  view({ key: "gemini-research", kind: "mcp_tool", label: "Gemini Web Research", costTier: "byo_key", verticals: [], available: true }),
];

const noop = () => {};

// The recommended rail is the `catsec-rec` <section>, rendered before the kind
// sections — slice it out so we can assert on the rail's contents specifically
// (connectors also appear in their kind section below).
function railHtml(html: string): string {
  const start = html.indexOf("catsec-rec");
  if (start === -1) return "";
  const rest = html.slice(start);
  return rest.slice(0, rest.indexOf("</section>"));
}

describe("ConnectorCatalog", () => {
  it("renders the kind sections and cost-tier badges for every registered connector", () => {
    const html = renderToStaticMarkup(
      <ConnectorCatalog connectors={CONNECTORS} industry="Restoration & home services" onOpen={noop} onEditIndustry={noop} />,
    );
    // Grouped by kind
    expect(html).toContain("Signal sources");
    expect(html).toContain("Channels");
    expect(html).toContain("Tools");
    // Every connector card present
    expect(html).toContain("Weather Signals");
    expect(html).toContain("Gemini Web Research");
    // Cost-tier badges
    expect(html).toContain("Free");
    expect(html).toContain("Metered");
    expect(html).toContain("Your key");
  });

  it("shows a Recommended rail matched to the industry, and an honest Coming soon state", () => {
    const html = renderToStaticMarkup(
      <ConnectorCatalog connectors={CONNECTORS} industry="Restoration & home services" onOpen={noop} onEditIndustry={noop} />,
    );
    expect(html).toContain("Recommended for your business");
    expect(html).toContain("Restoration &amp; home services");
    // Coming-soon connectors surface the honest badge (no fake enable CTA).
    expect(html).toContain("Coming soon");
  });

  it("changes recommendations when the industry changes", () => {
    const restorationRail = railHtml(
      renderToStaticMarkup(
        <ConnectorCatalog connectors={CONNECTORS} industry="Restoration & home services" onOpen={noop} onEditIndustry={noop} />,
      ),
    );
    const realEstateRail = railHtml(
      renderToStaticMarkup(
        <ConnectorCatalog connectors={CONNECTORS} industry="Real estate" onOpen={noop} onEditIndustry={noop} />,
      ),
    );
    // Restoration recommends the home-services signal source; real estate the listings one.
    expect(restorationRail).toContain("Weather Signals");
    expect(restorationRail).not.toContain("New Property Listings");
    expect(realEstateRail).toContain("New Property Listings");
    expect(realEstateRail).not.toContain("Weather Signals");
    // Universal connectors (verticals: []) are never rail picks, only in their section.
    expect(restorationRail).not.toContain("Gemini Web Research");
  });

  it("prompts to set an industry when none matches (no rail)", () => {
    const html = renderToStaticMarkup(
      <ConnectorCatalog connectors={CONNECTORS} industry="" onOpen={noop} onEditIndustry={noop} />,
    );
    expect(html).not.toContain("Recommended for your business");
    expect(html).toContain("Set your");
    // The full catalog (kind sections) still renders even with no industry.
    expect(html).toContain("Signal sources");
  });
});
