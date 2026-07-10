import { describe, expect, it } from "vitest";

import { mapAdFlightsToSignals, type CompetitorAdFlight } from "../competitor-ads";

function flight(over: Partial<CompetitorAdFlight> = {}): CompetitorAdFlight {
  return { id: "f1", competitorName: "Rival Restoration", channel: "meta_ad_library", keywords: ["water damage"], ...over };
}

describe("mapAdFlightsToSignals", () => {
  it("maps an ad flight onto the competitor-signal detector input", () => {
    const [s] = mapAdFlightsToSignals([
      flight({ id: "f9", creatives: ["Fast water cleanup", "24/7 crews"], persona: "persona_emergency_homeowner", url: "https://x.co/ad" }),
    ]);
    expect(s).toMatchObject({
      id: "f9",
      competitorName: "Rival Restoration",
      channel: "meta_ad_library",
      status: "needs_review",
      keywords: ["water damage"],
      creativeCount: 2, // derived from creatives[]
      persona: "persona_emergency_homeowner",
      url: "https://x.co/ad",
    });
  });

  it("prefers an explicit creativeCount over the creatives array length", () => {
    const [s] = mapAdFlightsToSignals([flight({ creatives: ["a"], creativeCount: 12 })]);
    expect(s.creativeCount).toBe(12);
  });

  it("dedups by flight id and drops rows missing id or competitor", () => {
    const out = mapAdFlightsToSignals([
      flight({ id: "dup" }),
      flight({ id: "dup" }),
      flight({ id: "", competitorName: "No id" }),
      flight({ id: "x", competitorName: "" }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["dup"]);
  });

  it("drops a non-http url and defaults a blank channel", () => {
    const [s] = mapAdFlightsToSignals([flight({ url: "javascript:alert(1)", channel: "" })]);
    expect(s.url).toBeUndefined();
    expect(s.channel).toBe("ad_library");
  });
});
