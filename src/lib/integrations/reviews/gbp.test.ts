import { describe, expect, it, vi } from "vitest";

import { checkGbpConnection, gbpReviewSource, gbpReviewToInput } from "./gbp";

const LOCATION = "accounts/1/locations/2";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("gbpReviewToInput", () => {
  it("maps a full review, converting the star enum to a number", () => {
    const out = gbpReviewToInput(
      { reviewId: "r1", starRating: "FOUR", comment: "Great crew", reviewer: { displayName: "Dana" }, createTime: "2026-07-01T10:00:00Z" },
      LOCATION,
    );
    expect(out).toEqual({
      id: "r1",
      rating: 4,
      author: "Dana",
      snippet: "Great crew",
      postedAt: "2026-07-01T10:00:00.000Z",
      provider: "google",
      location: LOCATION,
    });
  });

  it("returns null without an id or a rating (can't dedup or classify it)", () => {
    expect(gbpReviewToInput({ starRating: "FIVE" }, LOCATION)).toBeNull();
    expect(gbpReviewToInput({ reviewId: "r2" }, LOCATION)).toBeNull();
  });

  it("survives an unparseable createTime instead of throwing", () => {
    const out = gbpReviewToInput({ reviewId: "r3", starRating: "ONE", createTime: "nonsense" }, LOCATION);
    expect(out?.postedAt).toBeUndefined();
    expect(out?.rating).toBe(1);
  });

  it("truncates the snippet rather than storing the full review text", () => {
    const out = gbpReviewToInput({ reviewId: "r4", starRating: "FIVE", comment: "x".repeat(500) }, LOCATION);
    expect(out?.snippet?.length).toBe(200);
  });
});

describe("gbpReviewSource", () => {
  it("lists mapped reviews for the configured location", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse({ reviews: [{ reviewId: "a", starRating: "FIVE" }, { reviewId: "b", starRating: "TWO" }] }),
    );
    const src = gbpReviewSource("tok", { locationName: LOCATION, fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await src.listRecentReviews("2026-07-24T00:00:00Z");
    expect(out.map((r) => r.rating)).toEqual([5, 2]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain(`/v4/${LOCATION}/reviews`);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("is best-effort: a non-2xx or a throw yields [] rather than sinking the scan", async () => {
    const bad = gbpReviewSource("tok", { locationName: LOCATION, fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch });
    expect(await bad.listRecentReviews("now")).toEqual([]);
    const boom = gbpReviewSource("tok", { locationName: LOCATION, fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch });
    expect(await boom.listRecentReviews("now")).toEqual([]);
  });

  it("returns [] with no location configured, without calling the API", async () => {
    const fetchImpl = vi.fn();
    const src = gbpReviewSource("tok", { locationName: "", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await src.listRecentReviews("now")).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("checkGbpConnection", () => {
  it("reports reachable with a count", async () => {
    const res = await checkGbpConnection("tok", LOCATION, { fetchImpl: (async () => jsonResponse({ reviews: [{ reviewId: "a" }] })) as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, count: 1 });
  });

  it("distinguishes a rejected token from a missing location (not a silent empty)", async () => {
    const auth = await checkGbpConnection("bad", LOCATION, { fetchImpl: (async () => jsonResponse({}, 403)) as unknown as typeof fetch });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.error).toContain("reconnect");
    const missing = await checkGbpConnection("tok", LOCATION, { fetchImpl: (async () => jsonResponse({}, 404)) as unknown as typeof fetch });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("location not found");
  });

  it("fails when no location is set", async () => {
    expect((await checkGbpConnection("tok", "")).ok).toBe(false);
  });
});
