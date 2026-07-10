import { type EnrichmentFields } from "@/domain";

// The injectable seam for firmographic enrichment (BSR-368). The orchestrator asks
// an `EnrichmentProvider` to enrich a lead by its lookup keys (domain / email /
// company name); the provider returns `EnrichmentFields` or null when it has no
// match. The pure mapping from those fields onto partner-scoring signals +
// persisted firmographics lives in `src/domain/enrichment.ts`. Read-only: a
// provider only fetches facts, it never writes or contacts anyone.

export type EnrichmentLookupKeys = {
  /** Company web domain — the strongest enrichment key. */
  domain?: string;
  /** Contact email; a provider may derive the domain from it. */
  email?: string;
  /** Company name as a fallback key. */
  companyName?: string;
};

export type EnrichmentProvider = {
  /** Fetch firmographics for the keys, or null when there's no confident match. */
  enrich(keys: EnrichmentLookupKeys): Promise<EnrichmentFields | null>;
};

/**
 * A deterministic in-memory provider keyed by domain (falling back to the email's
 * domain, then company name), for tests and the offline path. An un-onboarded
 * enrichment connector returns null for everything rather than inventing data.
 */
export function fixtureEnrichmentProvider(byKey: Record<string, EnrichmentFields>): EnrichmentProvider {
  const table = new Map(Object.entries(byKey).map(([k, v]) => [k.trim().toLowerCase(), v]));
  return {
    async enrich(keys: EnrichmentLookupKeys): Promise<EnrichmentFields | null> {
      const domain = keys.domain?.trim().toLowerCase() || emailDomain(keys.email);
      const candidates = [domain, keys.companyName?.trim().toLowerCase()].filter(Boolean) as string[];
      for (const candidate of candidates) {
        const hit = table.get(candidate);
        if (hit) return hit;
      }
      return null;
    },
  };
}

/** The domain portion of an email, lower-cased; undefined when not an email. */
export function emailDomain(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || undefined;
}
