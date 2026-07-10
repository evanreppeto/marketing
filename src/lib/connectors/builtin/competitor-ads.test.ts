import { describe, expect, it } from "vitest";

import { getSignalSource } from "../registry";
import { configAdSource, detectCompetitorAdOpportunities } from "./competitor-ads";
// Importing the barrel triggers registerSignalSource for the built-ins.
import "./index";

const NOW = "2026-07-10T12:00:00Z";

describe("competitor-ads connector", () => {
  it("self-registers as a signal source", () => {
    expect(getSignalSource("competitor-ads")?.key).toBe("competitor-ads");
  });

  it("configAdSource reads seeded flights from config and ignores malformed rows", async () => {
    const src = configAdSource({ flights: [{ id: "f1", competitorName: "Rival" }, { id: "", competitorName: "x" }, { nope: 1 }, "bad"] });
    const rows = await src.listAdFlights(NOW);
    expect(rows.map((f) => f.id)).toEqual(["f1"]);
  });

  it("detects competitor_signal opportunities from the config source", async () => {
    const out = await detectCompetitorAdOpportunities({
      now: NOW,
      config: {
        flights: [
          { id: "f1", competitorName: "Rival Restoration", channel: "meta_ad_library", keywords: ["water damage"], capturedAt: NOW },
        ],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "competitor_signal", subjectType: "competitor_signal", subjectId: "f1" });
  });

  it("proposes nothing when no flights are configured (read-only, no invention)", async () => {
    expect(await detectCompetitorAdOpportunities({ now: NOW, config: {} })).toEqual([]);
  });

  it("honors an injected source (the live-library seam)", async () => {
    const out = await detectCompetitorAdOpportunities({
      now: NOW,
      config: {},
      source: { listAdFlights: async () => [{ id: "g1", competitorName: "Ad Co", channel: "google_ads_transparency", capturedAt: NOW }] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].subjectId).toBe("g1");
  });
});
