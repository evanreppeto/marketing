import { type EnrichmentFields } from "@/domain";

import { emailDomain, type EnrichmentLookupKeys, type EnrichmentProvider } from "./provider";

// ---------------------------------------------------------------------------
// The REAL firmographic enrichment provider scaffold (BSR-368), read-only + metered.
// It resolves a company by domain against a generic firmographic vendor (the exact
// vendor is a per-workspace credential; the request/response shape here is the
// common denominator: domain in, firmographics out). Wired behind the injectable
// `EnrichmentProvider` seam so the orchestrator + tests use `fixtureEnrichmentProvider`
// and never hit the network. Because enrichment is `metered`, every live call is
// wrapped by the cost guard in the orchestrator (meterConnectorCall) BEFORE it fires
// — a call that would breach the spend cap is refused, not billed. No write, no send.
// ---------------------------------------------------------------------------

export type EnrichmentVendorOptions = {
  /** Vendor company-enrichment endpoint (per-vendor; injected, no default host assumed). */
  endpoint: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

type VendorCompanyResponse = {
  name?: string;
  domain?: string;
  metrics?: { employees?: number; annualRevenue?: number } | null;
  category?: { industry?: string } | null;
};

/**
 * A read-only EnrichmentProvider backed by a live firmographic vendor. `apiKey` is
 * the workspace's decrypted vendor credential. Best-effort: any non-2xx or network
 * failure resolves to null (no match) so an enrichment outage degrades to
 * "imported without firmographics" rather than throwing the import batch.
 */
export function vendorEnrichmentProvider(apiKey: string, opts: EnrichmentVendorOptions): EnrichmentProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async enrich(keys: EnrichmentLookupKeys): Promise<EnrichmentFields | null> {
      const domain = keys.domain?.trim().toLowerCase() || emailDomain(keys.email);
      if (!domain) return null; // domain is the vendor lookup key; nothing to ask without it
      try {
        const url = new URL(opts.endpoint);
        url.searchParams.set("domain", domain);
        const res = await doFetch(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (!res.ok) return null;
        const body = (await res.json()) as VendorCompanyResponse;
        return mapVendorResponse(body, domain);
      } catch {
        return null;
      }
    },
  };
}

/** Normalize a vendor company payload into our EnrichmentFields shape. */
export function mapVendorResponse(body: VendorCompanyResponse, fallbackDomain: string): EnrichmentFields {
  return {
    companyName: typeof body.name === "string" ? body.name : undefined,
    domain: typeof body.domain === "string" ? body.domain : fallbackDomain,
    employeeCount: typeof body.metrics?.employees === "number" ? body.metrics.employees : undefined,
    annualRevenueUsd: typeof body.metrics?.annualRevenue === "number" ? body.metrics.annualRevenue : undefined,
    industry: typeof body.category?.industry === "string" ? body.category.industry : undefined,
  };
}
