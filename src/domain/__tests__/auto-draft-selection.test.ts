import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR,
  DEFAULT_AUTO_DRAFT_LIMIT,
  selectOpportunitiesForAutoDraft,
  summarizeAutoDraftSkips,
  type AutoDraftCandidate,
} from "../auto-draft-selection";

const NOW = new Date("2026-07-22T13:00:00.000Z");

function candidate(overrides: Partial<AutoDraftCandidate> & { id: string }): AutoDraftCandidate {
  return {
    confidence: 90,
    urgency: "medium",
    status: "pending",
    subjectType: "company",
    subjectId: `co-${overrides.id}`,
    kind: "cold_lead",
    campaignId: null,
    snoozedUntil: null,
    detectedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function reasonFor(selection: ReturnType<typeof selectOpportunitiesForAutoDraft>, id: string) {
  return selection.skipped.find((skip) => skip.id === id)?.reason;
}

describe("eligibility", () => {
  it("selects a high-confidence pending opportunity", () => {
    const result = selectOpportunitiesForAutoDraft({ candidates: [candidate({ id: "a" })], now: NOW });
    expect(result.selected.map((c) => c.id)).toEqual(["a"]);
    expect(result.skipped).toEqual([]);
  });

  it("never drafts an opportunity that already has a campaign", () => {
    // Idempotency: a cron that fires twice must not fork a second campaign.
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", campaignId: "cmp-1" })],
      now: NOW,
    });
    expect(result.selected).toEqual([]);
    expect(reasonFor(result, "a")).toBe("already_drafted");
  });

  it("reports already_drafted ahead of not_pending when both apply", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", status: "drafted", campaignId: "cmp-1" })],
      now: NOW,
    });
    expect(reasonFor(result, "a")).toBe("already_drafted");
  });

  it("skips anything an operator already triaged", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [
        candidate({ id: "dismissed", status: "dismissed" }),
        candidate({ id: "snoozed-status", status: "snoozed" }),
        candidate({ id: "drafting", status: "drafting" }),
      ],
      now: NOW,
    });
    expect(result.selected).toEqual([]);
    expect(new Set(result.skipped.map((s) => s.reason))).toEqual(new Set(["not_pending"]));
  });

  it("respects a live snooze even at maximum confidence", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", confidence: 100, snoozedUntil: "2026-08-01T00:00:00.000Z" })],
      now: NOW,
    });
    expect(result.selected).toEqual([]);
    expect(reasonFor(result, "a")).toBe("snoozed");
  });

  it("allows an expired snooze through", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", snoozedUntil: "2026-07-01T00:00:00.000Z" })],
      now: NOW,
    });
    expect(result.selected.map((c) => c.id)).toEqual(["a"]);
  });

  it("treats an unparseable snooze as active", () => {
    // Suppressing one draft is cheaper than drafting against something the
    // operator deliberately set aside.
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", snoozedUntil: "not-a-date" })],
      now: NOW,
    });
    expect(reasonFor(result, "a")).toBe("snoozed");
  });
});

describe("confidence floor", () => {
  it("defaults to 65 on the 0-100 integer scale", () => {
    // 65, not 80: at 80 only crm_inactivity clears, so a stricter floor buys a
    // monoculture rather than quality.
    expect(DEFAULT_AUTO_DRAFT_CONFIDENCE_FLOOR).toBe(65);
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "at", confidence: 65 }), candidate({ id: "below", confidence: 64 })],
      now: NOW,
    });
    expect(result.selected.map((c) => c.id)).toEqual(["at"]);
    expect(reasonFor(result, "below")).toBe("below_confidence_floor");
  });

  it("honours an explicit floor", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [candidate({ id: "a", confidence: 85 })],
      now: NOW,
      confidenceFloor: 95,
    });
    expect(result.selected).toEqual([]);
    expect(reasonFor(result, "a")).toBe("below_confidence_floor");
  });
});

describe("bounding", () => {
  it("caps a pass at the limit and says what it dropped", () => {
    const many = Array.from({ length: 10 }, (_, i) => candidate({ id: `a${i}`, confidence: 100 - i }));
    const result = selectOpportunitiesForAutoDraft({ candidates: many, now: NOW });
    expect(result.selected).toHaveLength(DEFAULT_AUTO_DRAFT_LIMIT);
    expect(summarizeAutoDraftSkips(result).over_limit).toBe(10 - DEFAULT_AUTO_DRAFT_LIMIT);
  });

  it("drafts nothing when the limit is zero or negative", () => {
    for (const limit of [0, -1]) {
      const result = selectOpportunitiesForAutoDraft({ candidates: [candidate({ id: "a" })], now: NOW, limit });
      expect(result.selected).toEqual([]);
      expect(reasonFor(result, "a")).toBe("over_limit");
    }
  });

  it("drafts at most one per subject in a single pass", () => {
    // Five opportunities on one company should not become five campaigns.
    const sameCompany = Array.from({ length: 5 }, (_, i) =>
      candidate({ id: `a${i}`, subjectId: "co-1", confidence: 95 - i }),
    );
    const result = selectOpportunitiesForAutoDraft({ candidates: sameCompany, now: NOW });
    expect(result.selected.map((c) => c.id)).toEqual(["a0"]);
    expect(summarizeAutoDraftSkips(result).duplicate_subject).toBe(4);
  });

  it("treats the same id under a different subject type as distinct", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [
        candidate({ id: "a", subjectType: "company", subjectId: "x" }),
        candidate({ id: "b", subjectType: "contact", subjectId: "x" }),
      ],
      now: NOW,
    });
    expect(result.selected).toHaveLength(2);
  });
});

describe("kind quota", () => {
  it("is off by default", () => {
    const sameKind = Array.from({ length: 3 }, (_, i) =>
      candidate({ id: `a${i}`, subjectId: `co-${i}`, kind: "crm_inactivity" }),
    );
    expect(selectOpportunitiesForAutoDraft({ candidates: sameKind, now: NOW }).selected).toHaveLength(3);
  });

  it("caps drafts sharing one kind so a pass isn't a monoculture", () => {
    // Real data motivates this: 19 of the top 20 pending opportunities are
    // crm_inactivity, so an uncapped pass drafts the same campaign every day.
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) =>
        candidate({ id: `inactive${i}`, subjectId: `co-${i}`, kind: "crm_inactivity", confidence: 99 - i }),
      ),
      candidate({ id: "storm", subjectId: "seg-1", kind: "storm_response", confidence: 80 }),
    ];
    const result = selectOpportunitiesForAutoDraft({ candidates, now: NOW, maxPerKind: 1 });
    expect(result.selected.map((c) => c.kind)).toEqual(["crm_inactivity", "storm_response"]);
    expect(summarizeAutoDraftSkips(result).kind_quota).toBe(4);
  });

  it("keeps the highest-ranked member of each kind", () => {
    const candidates = [
      candidate({ id: "weak", subjectId: "co-1", kind: "crm_inactivity", confidence: 81 }),
      candidate({ id: "strong", subjectId: "co-2", kind: "crm_inactivity", confidence: 99 }),
    ];
    const result = selectOpportunitiesForAutoDraft({ candidates, now: NOW, maxPerKind: 1 });
    expect(result.selected.map((c) => c.id)).toEqual(["strong"]);
  });
});

describe("ranking", () => {
  it("ranks by confidence first", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [
        candidate({ id: "low", confidence: 82 }),
        candidate({ id: "high", confidence: 99 }),
        candidate({ id: "mid", confidence: 90 }),
      ],
      now: NOW,
    });
    expect(result.selected.map((c) => c.id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks a confidence tie on urgency", () => {
    const result = selectOpportunitiesForAutoDraft({
      candidates: [
        candidate({ id: "low", urgency: "low" }),
        candidate({ id: "high", urgency: "high" }),
        candidate({ id: "medium", urgency: "medium" }),
      ],
      now: NOW,
    });
    expect(result.selected.map((c) => c.id)).toEqual(["high", "medium", "low"]);
  });

  it("drains the backlog oldest-first when confidence and urgency tie", () => {
    // Otherwise the newest scan output perpetually jumps the queue and a stale
    // high-confidence opportunity is never drafted.
    const result = selectOpportunitiesForAutoDraft({
      candidates: [
        candidate({ id: "newest", detectedAt: "2026-07-22T00:00:00.000Z" }),
        candidate({ id: "oldest", detectedAt: "2026-07-06T00:00:00.000Z" }),
        candidate({ id: "middle", detectedAt: "2026-07-14T00:00:00.000Z" }),
      ],
      now: NOW,
    });
    expect(result.selected.map((c) => c.id)).toEqual(["oldest", "middle", "newest"]);
  });

  it("is deterministic for otherwise identical candidates", () => {
    const candidates = [candidate({ id: "b" }), candidate({ id: "a" }), candidate({ id: "c" })];
    const first = selectOpportunitiesForAutoDraft({ candidates, now: NOW });
    const second = selectOpportunitiesForAutoDraft({ candidates, now: NOW });
    expect(first.selected.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("does not mutate the caller's array", () => {
    const candidates = [candidate({ id: "b" }), candidate({ id: "a" })];
    selectOpportunitiesForAutoDraft({ candidates, now: NOW });
    expect(candidates.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("summarizeAutoDraftSkips", () => {
  it("returns every reason with a zero default", () => {
    const summary = summarizeAutoDraftSkips({ selected: [], skipped: [] });
    expect(summary).toEqual({
      not_pending: 0,
      already_drafted: 0,
      snoozed: 0,
      below_confidence_floor: 0,
      duplicate_subject: 0,
      kind_quota: 0,
      over_limit: 0,
    });
  });
});

describe("against the shape of real prod data", () => {
  it("selects a bounded, sane set from a 69-item pending backlog", () => {
    // Mirrors the live distribution: 9 in 49-58, 40 in 60-78, 18 in 80-98, 2 at 100.
    const bands: Array<[number, number]> = [[9, 55], [40, 70], [18, 90], [2, 100]];
    let n = 0;
    const backlog = bands.flatMap(([count, confidence]) =>
      Array.from({ length: count }, () => candidate({ id: `o${n}`, subjectId: `co-${n++}`, confidence })),
    );
    expect(backlog).toHaveLength(69);

    const result = selectOpportunitiesForAutoDraft({ candidates: backlog, now: NOW });
    expect(result.selected).toHaveLength(3);
    expect(result.selected.map((c) => c.confidence)).toEqual([100, 100, 90]);
    // Only the 49-58 band falls below the 65 floor.
    expect(summarizeAutoDraftSkips(result).below_confidence_floor).toBe(9);
  });
});
