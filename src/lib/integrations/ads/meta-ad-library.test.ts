import { describe, expect, it, vi } from "vitest";

import { checkMetaAdLibrary, metaAdLibrarySource, metaAdsToFlights } from "./meta-ad-library";

const NOW = "2026-07-24T00:00:00.000Z";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("metaAdsToFlights", () => {
  it("groups an advertiser's ads into ONE flight with a real creative count", () => {
    const flights = metaAdsToFlights(
      [
        { id: "1", page_id: "p1", page_name: "Rival Co", ad_creative_bodies: ["Fast service"], ad_snapshot_url: "https://s/1" },
        { id: "2", page_id: "p1", page_name: "Rival Co", ad_creative_link_titles: ["24/7 response"] },
        { id: "3", page_id: "p2", page_name: "Other Co", ad_creative_bodies: ["Cheap"] },
      ],
      "water damage",
      NOW,
    );
    expect(flights).toHaveLength(2);
    const rival = flights.find((f) => f.competitorName === "Rival Co")!;
    expect(rival.creativeCount).toBe(2);
    expect(rival.creatives).toEqual(expect.arrayContaining(["Fast service", "24/7 response"]));
    expect(rival.channel).toBe("meta_ad_library");
    expect(rival.keywords).toEqual(["water damage"]);
  });

  it("produces a stable id across re-scans so dedup works", () => {
    const once = metaAdsToFlights([{ id: "1", page_id: "p1", page_name: "Rival Co" }], "water damage", NOW);
    const twice = metaAdsToFlights([{ id: "9", page_id: "p1", page_name: "Rival Co" }], "water damage", "2026-08-01T00:00:00.000Z");
    expect(once[0].id).toBe(twice[0].id);
  });

  it("drops ads with no advertiser name (nothing actionable)", () => {
    expect(metaAdsToFlights([{ id: "1", ad_creative_bodies: ["x"] }], "t", NOW)).toEqual([]);
  });

  it("falls back to now when the delivery start time is unparseable", () => {
    const [flight] = metaAdsToFlights([{ id: "1", page_id: "p", page_name: "Rival", ad_delivery_start_time: "nonsense" }], "t", NOW);
    expect(flight.capturedAt).toBe(NOW);
  });
});

describe("metaAdLibrarySource", () => {
  it("queries each term and dedups advertisers across them", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: "1", page_id: "p1", page_name: "Rival Co" }] }));
    const src = metaAdLibrarySource("tok", {
      searchTerms: ["water damage", "flood repair"],
      countries: ["US"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const flights = await src.listAdFlights(NOW);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Same advertiser under two terms → two distinct term-scoped flights, not dupes of one id.
    expect(new Set(flights.map((f) => f.id)).size).toBe(flights.length);
  });

  it("sends the token, countries and ad_type in the query", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const src = metaAdLibrarySource("tok", { searchTerms: ["x"], countries: ["US", "CA"], adType: "ALL", fetchImpl: fetchImpl as unknown as typeof fetch });
    await src.listAdFlights(NOW);
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("access_token=tok");
    expect(url).toContain(encodeURIComponent(JSON.stringify(["US", "CA"])));
    expect(url).toContain("ad_type=ALL");
  });

  it("returns [] without terms or countries, and never calls the API", async () => {
    const fetchImpl = vi.fn();
    const noTerms = metaAdLibrarySource("tok", { searchTerms: [], countries: ["US"], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await noTerms.listAdFlights(NOW)).toEqual([]);
    const noCountries = metaAdLibrarySource("tok", { searchTerms: ["x"], countries: [], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await noCountries.listAdFlights(NOW)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is best-effort: an error on one term yields [] rather than throwing", async () => {
    const src = metaAdLibrarySource("tok", {
      searchTerms: ["x"],
      countries: ["US"],
      fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch,
    });
    expect(await src.listAdFlights(NOW)).toEqual([]);
  });
});

describe("checkMetaAdLibrary", () => {
  it("reports a rejected token distinctly from an empty match", async () => {
    const rejected = await checkMetaAdLibrary("bad", {
      searchTerms: ["x"], countries: ["US"],
      fetchImpl: (async () => jsonResponse({}, 400)) as unknown as typeof fetch,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain("access token");

    // Reachable but zero matches is a SUCCESS with count 0 — the caller explains why.
    const empty = await checkMetaAdLibrary("tok", {
      searchTerms: ["x"], countries: ["US"],
      fetchImpl: (async () => jsonResponse({ data: [] })) as unknown as typeof fetch,
    });
    expect(empty).toEqual({ ok: true, count: 0 });
  });

  it("requires a term and a country before probing", async () => {
    expect((await checkMetaAdLibrary("tok", { searchTerms: [], countries: ["US"] })).ok).toBe(false);
    expect((await checkMetaAdLibrary("tok", { searchTerms: ["x"], countries: [] })).ok).toBe(false);
  });
});
