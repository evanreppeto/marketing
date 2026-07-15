import { afterEach, describe, expect, it, vi } from "vitest";

import { parseLeadIngestionPayload } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { persistLeadIngestion } from "./persistence";

function insertFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  // The insert call immediately follows the matching `from(table)` call.
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table) {
      const next = supabase.calls[i + 1];
      if (next && next[0] === "insert") out.push(next[1] as Record<string, unknown>);
    }
  }
  return out;
}

describe("persistLeadIngestion attribution", () => {
  it("writes the resolved attribution columns onto the leads insert", async () => {
    const result = parseLeadIngestionPayload({
      persona: "persona_homeowner_emergency",
      source: "website_form",
      lossSignals: ["standing water"],
      contact: { email: "a@b.com" },
      attribution: { campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad" },
    });
    if (!result.ok) throw new Error("expected accepted result");

    const supabase = createSupabaseQueryMock({
      contacts: { data: { id: "contact-1" }, error: null },
      leads: { data: { id: "lead-1" }, error: null },
    });

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase, orgId: "org-test" });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: "11111111-1111-1111-1111-111111111111",
      attributed_asset_id: null,
      attribution_channel: "meta_ad",
      attribution_method: "explicit",
      attribution_utm: {},
    });
  });
});

describe("persistLeadIngestion last-touch backfill", () => {
  afterEach(() => vi.useRealTimers());

  function unattributedLead() {
    const result = parseLeadIngestionPayload({
      persona: "persona_homeowner_emergency",
      source: "phone_call",
      lossSignals: ["burst pipe"],
      contact: { email: "repeat@customer.com" },
    });
    if (!result.ok) throw new Error("expected accepted result");
    // The lead itself carries no campaign — resolves to unattributed.
    expect(result.attribution.method).toBe("unattributed");
    return result;
  }

  it("stamps the most recent in-window outbound touch onto an otherwise unattributed lead", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    const result = unattributedLead();

    const supabase = createSupabaseQueryMock({
      contacts: { data: { id: "contact-1" }, error: null },
      engagement_events: {
        data: [
          { campaign_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", campaign_asset_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", channel: "email", occurred_at: "2026-07-10T00:00:00Z" },
        ],
        error: null,
      },
      leads: { data: { id: "lead-1" }, error: null },
    });

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase, orgId: "org-test" });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      attributed_asset_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      attribution_channel: "email",
      attribution_method: "last_touch",
    });
  });

  it("leaves the lead unattributed when the only touch is outside the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    const result = unattributedLead();

    const supabase = createSupabaseQueryMock({
      contacts: { data: { id: "contact-1" }, error: null },
      engagement_events: {
        data: [{ campaign_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", campaign_asset_id: null, channel: "email", occurred_at: "2026-05-01T00:00:00Z" }],
        error: null,
      },
      leads: { data: { id: "lead-1" }, error: null },
    });

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase, orgId: "org-test" });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: null,
      attribution_method: "unattributed",
    });
  });

  it("does not override an explicit campaign already on the lead", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    const result = parseLeadIngestionPayload({
      persona: "persona_homeowner_emergency",
      source: "website_form",
      lossSignals: ["standing water"],
      contact: { email: "a@b.com" },
      attribution: { campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad" },
    });
    if (!result.ok) throw new Error("expected accepted result");

    const supabase = createSupabaseQueryMock({
      contacts: { data: { id: "contact-1" }, error: null },
      // A touch exists, but the explicit campaign must win — this must be ignored.
      engagement_events: {
        data: [{ campaign_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", campaign_asset_id: null, channel: "email", occurred_at: "2026-07-14T00:00:00Z" }],
        error: null,
      },
      leads: { data: { id: "lead-1" }, error: null },
    });

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase, orgId: "org-test" });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: "11111111-1111-1111-1111-111111111111",
      attribution_method: "explicit",
    });
  });
});
