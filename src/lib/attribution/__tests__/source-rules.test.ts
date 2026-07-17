import { describe, expect, it } from "vitest";

import { parseLeadIngestionPayload } from "@/domain";

import { getAttributionSourceRules, parseSourceRules } from "../source-rules";

const CAMPAIGN = "8f14e45f-ceea-467a-9575-1f0b1a2c3d4e";

function settingsClient(value: unknown, error: { message: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, v: unknown) => {
      calls.push(["eq", col, v]);
      return builder;
    },
    maybeSingle: async () => ({ data: error ? null : { value }, error }),
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return builder;
      },
    } as never,
  };
}

describe("parseSourceRules", () => {
  it("keeps string→uuid pairs", () => {
    expect(parseSourceRules({ "Google Ads": CAMPAIGN })).toEqual({ "Google Ads": CAMPAIGN });
  });

  it("drops values that are not uuids, so a stray string can't become attribution", () => {
    // The whole point of a rules MAP over inferring from `source`: only a real
    // campaign id counts. "google-ads-spring" is a plausible-looking lie.
    expect(parseSourceRules({ "Google Ads": "google-ads-spring", Referral: CAMPAIGN })).toEqual({ Referral: CAMPAIGN });
  });

  it("survives jsonb that isn't the shape it claims", () => {
    // It arrives as unstructured jsonb — whatever wrote it (form, script, psql) is
    // not guaranteed to have written this shape.
    expect(parseSourceRules({ "Google Ads": { campaign: CAMPAIGN } })).toEqual({});
    expect(parseSourceRules([CAMPAIGN])).toEqual({});
    expect(parseSourceRules("nope")).toEqual({});
    expect(parseSourceRules(null)).toEqual({});
    expect(parseSourceRules({ "  ": CAMPAIGN })).toEqual({});
  });
});

describe("getAttributionSourceRules", () => {
  it("reads the org's rules, scoped to that org and key", async () => {
    const { client, calls } = settingsClient({ "Google Ads": CAMPAIGN });

    const rules = await getAttributionSourceRules("org-1", client);

    expect(rules).toEqual({ "Google Ads": CAMPAIGN });
    expect(calls).toContainEqual(["from", "app_settings"]);
    expect(calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(calls).toContainEqual(["eq", "key", "attribution_source_rules"]);
  });

  it("returns {} for a caller with no org rather than reading across tenants", async () => {
    const { client, calls } = settingsClient({ "Google Ads": CAMPAIGN });

    expect(await getAttributionSourceRules(null, client)).toEqual({});
    // Not "it read and found nothing" — it must not have queried at all.
    expect(calls).toEqual([]);
  });

  it("never fails a lead over a settings read error", async () => {
    const { client } = settingsClient(null, { message: "boom" });
    expect(await getAttributionSourceRules("org-1", client)).toEqual({});
  });
});

describe("lead ingest + source rules (the path that was unreachable)", () => {
  const payload = {
    persona: "persona_homeowner_emergency",
    source: "Google Ads",
    contact: { firstName: "Dana", email: "dana@example.com" },
    lossSummary: "Basement flooding after burst pipe",
    lossSignals: ["standing water"],
  };

  it("attributes a source-only lead when the operator has declared a rule", () => {
    const result = parseLeadIngestionPayload(payload, "2026-07-17T00:00:00.000Z", undefined, {
      "Google Ads": CAMPAIGN,
    });

    if (!result.ok) throw new Error("expected the payload to parse");
    expect(result.attribution.method).toBe("source_rule");
    expect(result.attribution.campaignId).toBe(CAMPAIGN);
  });

  it("leaves it unattributed with no rules — which is what every prod lead does today", () => {
    // Reproduces prod: 200 leads carrying a source, zero attributed, because nothing
    // ever passed a rules map. Asserting campaignId null is the regression guard —
    // the fix must not start inventing attribution from `source` itself.
    const result = parseLeadIngestionPayload(payload, "2026-07-17T00:00:00.000Z");

    if (!result.ok) throw new Error("expected the payload to parse");
    expect(result.attribution.method).toBe("unattributed");
    expect(result.attribution.campaignId).toBeNull();
  });

  it("does not attribute a source the operator hasn't mapped", () => {
    const result = parseLeadIngestionPayload(payload, "2026-07-17T00:00:00.000Z", undefined, {
      Referral: CAMPAIGN,
    });

    if (!result.ok) throw new Error("expected the payload to parse");
    expect(result.attribution.method).toBe("unattributed");
    expect(result.attribution.campaignId).toBeNull();
  });

  it("still prefers utm over a source rule", () => {
    // Precedence matters: an explicit signal on the click beats a standing rule
    // about where leads of this kind usually come from.
    const other = "1c8e4d5a-2b3f-4c6d-8e9a-0b1c2d3e4f5a";
    const result = parseLeadIngestionPayload(
      { ...payload, attribution: { utmCampaign: other } },
      "2026-07-17T00:00:00.000Z",
      undefined,
      { "Google Ads": CAMPAIGN },
    );

    if (!result.ok) throw new Error("expected the payload to parse");
    expect(result.attribution.method).toBe("utm");
    expect(result.attribution.campaignId).toBe(other);
  });
});
