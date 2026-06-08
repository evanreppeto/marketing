import { describe, expect, it } from "vitest";

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

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: "11111111-1111-1111-1111-111111111111",
      attribution_channel: "meta_ad",
      attribution_method: "explicit",
    });
  });
});
