// Per-vertical connector recommendations for the catalog (BSR-371). Pure +
// deterministic: given a connector's `verticals` tags and the workspace's
// (free-text) industry, decide whether it's tailored to that business. The
// catalog uses this for the "Recommended for your business" rail.

import { type ConnectorRegistryEntry } from "./connectors";

/**
 * Does a connector's vertical tags match the workspace's industry? Match is a
 * case-insensitive token containment (vertical `home_services` → "home services"
 * ⊂ "Restoration & home services"). Universal connectors (`verticals: []`) are
 * NOT "recommended for your business" — they're always in the catalog, just not
 * tailored — so they return false here.
 */
export function connectorMatchesIndustry(verticals: string[], industry: string): boolean {
  const hay = (industry || "").toLowerCase().trim();
  if (!hay || verticals.length === 0) return false;
  return verticals.some((vertical) => {
    const needle = vertical.replace(/[_-]+/g, " ").toLowerCase().trim();
    return needle.length > 0 && hay.includes(needle);
  });
}

/** Registry entries tailored to `industry` (non-universal + a vertical match). */
export function recommendConnectors(entries: ConnectorRegistryEntry[], industry: string): ConnectorRegistryEntry[] {
  return entries.filter((entry) => connectorMatchesIndustry(entry.verticals, industry));
}
