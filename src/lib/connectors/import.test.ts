import { describe, expect, it, vi } from "vitest";

import { type EnrichmentFields } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { type EnrichmentProvider } from "@/lib/integrations/enrichment/provider";

import { meteredEnrichmentProvider } from "./import";

function providerReturning(fields: EnrichmentFields | null): { provider: EnrichmentProvider; enrich: ReturnType<typeof vi.fn> } {
  const enrich = vi.fn(async () => fields);
  return { provider: { enrich }, enrich };
}

describe("meteredEnrichmentProvider", () => {
  it("runs the underlying lookup when the spend cap allows it", async () => {
    const { provider, enrich } = providerReturning({ employeeCount: 100 });
    // lead-enrichment is metered ($0.02/lookup): cap $50, nothing spent → allowed.
    const client = createSupabaseQueryMock({
      connector_spend_budgets: { data: { cap_cents: 5000 }, error: null },
      connector_usage_events: [
        { data: [], error: null }, // period spend = 0
        { data: { id: "usage-1" }, error: null }, // usage insert (if recorded)
      ],
    });
    const metered = meteredEnrichmentProvider(provider, { client, orgId: "org-1", workspaceId: "ws-1" });
    const res = await metered.enrich({ domain: "acme.co" });
    expect(res).toEqual({ employeeCount: 100 });
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it("refuses the lookup (no spend, no call) when it would breach the cap", async () => {
    const { provider, enrich } = providerReturning({ employeeCount: 100 });
    // cap of $0 → any priced lookup is refused before it runs.
    const client = createSupabaseQueryMock({
      connector_spend_budgets: { data: { cap_cents: 0 }, error: null },
      connector_usage_events: { data: [], error: null },
    });
    const metered = meteredEnrichmentProvider(provider, { client, orgId: "org-1", workspaceId: "ws-1" });
    const res = await metered.enrich({ domain: "acme.co" });
    expect(res).toBeNull();
    expect(enrich).not.toHaveBeenCalled();
  });
});
