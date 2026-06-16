import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  applyActivityFilters,
  buildActivitySummary,
  getRecentActivity,
  groupActivityEntriesByDay,
  mapCampaignEvent,
  mapEvent,
  mergeActivityEntries,
  sourceLimitForQuery,
  type ActivityEntry,
} from "./read-model";

type FakeSource = { data?: Array<Record<string, unknown>>; error?: { message: string } };

/** Minimal Supabase stub: from(table).select().order().limit() -> { data, error }. */
function fakeClient(perTable: Record<string, FakeSource>): SupabaseClient {
  return {
    from(table: string) {
      const source = perTable[table] ?? { data: [] };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: source.data ?? null, error: source.error ?? null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function entry(
  id: string,
  occurredAt: string,
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id,
    kind: "run",
    tone: "blue",
    title: id,
    detail: "",
    actor: "Hermes",
    actorType: "hermes",
    category: "agent",
    insightLabel: "Agent work",
    relatedLabel: null,
    occurredAt,
    href: null,
    ...overrides,
  };
}

describe("mergeActivityEntries", () => {
  it("sorts newest-first across sources", () => {
    const merged = mergeActivityEntries(
      [
        entry("a", "2026-05-01T10:00:00Z"),
        entry("c", "2026-05-03T10:00:00Z"),
        entry("b", "2026-05-02T10:00:00Z"),
      ],
      10,
    );
    expect(merged.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("drops entries with no timestamp", () => {
    const merged = mergeActivityEntries([entry("a", "2026-05-01T10:00:00Z"), entry("b", "")], 10);
    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("caps to the requested limit", () => {
    const merged = mergeActivityEntries(
      Array.from({ length: 30 }, (_, i) => entry(`e${i}`, `2026-05-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)),
      5,
    );
    expect(merged).toHaveLength(5);
  });

  it("does not mutate the input array", () => {
    const input = [entry("a", "2026-05-01T10:00:00Z"), entry("b", "2026-05-02T10:00:00Z")];
    const before = input.map((e) => e.id);
    mergeActivityEntries(input, 10);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe("sourceLimitForQuery", () => {
  it("keeps the normal source cap for default activity queries", () => {
    expect(sourceLimitForQuery({})).toBe(50);
  });

  it("widens the source cap for needs-review activity queries", () => {
    expect(sourceLimitForQuery({ needsReview: true })).toBe(250);
  });
});

describe("applyActivityFilters", () => {
  const entries = [
    entry("approval", "2026-06-12T14:00:00Z", {
      actor: "Evan",
      actorType: "human",
      category: "approval",
      title: "Evan approved Launch Email",
      detail: "Approval recorded for Launch Campaign.",
      relatedLabel: "Launch Campaign",
      insightLabel: "Needs review",
    }),
    entry("risk", "2026-06-11T14:00:00Z", {
      actor: "Hermes",
      actorType: "hermes",
      category: "risk",
      tone: "red",
      title: "Compliance blocked one SMS draft",
      detail: "Risky language was detected.",
      insightLabel: "Risk blocked",
    }),
    entry("campaign", "2026-06-10T14:00:00Z", {
      actor: "System",
      actorType: "system",
      category: "campaign",
      title: "Campaign moved to Ready for Review",
      detail: "Spring Winback is ready.",
      relatedLabel: "Spring Winback",
      insightLabel: "Marketing progress",
    }),
  ];

  it("filters by category", () => {
    const filtered = applyActivityFilters(entries, { categories: ["risk"] });
    expect(filtered.map((item) => item.id)).toEqual(["risk"]);
  });

  it("filters by actor type", () => {
    const filtered = applyActivityFilters(entries, { actorTypes: ["human"] });
    expect(filtered.map((item) => item.id)).toEqual(["approval"]);
  });

  it("filters by inclusive date bounds", () => {
    const filtered = applyActivityFilters(entries, {
      since: "2026-06-11T00:00:00Z",
      until: "2026-06-12T23:59:59Z",
    });
    expect(filtered.map((item) => item.id)).toEqual(["approval", "risk"]);
  });

  it("searches title, detail, actor, related label, category, and insight label", () => {
    expect(applyActivityFilters(entries, { search: "launch" }).map((item) => item.id)).toEqual(["approval"]);
    expect(applyActivityFilters(entries, { search: "hermes" }).map((item) => item.id)).toEqual(["risk"]);
    expect(applyActivityFilters(entries, { search: "spring" }).map((item) => item.id)).toEqual(["campaign"]);
    expect(applyActivityFilters(entries, { search: "marketing progress" }).map((item) => item.id)).toEqual(["campaign"]);
    expect(applyActivityFilters(entries, { search: "approval" }).map((item) => item.id)).toEqual(["approval"]);
  });

  it("keeps older review-needed entries before applying the feed limit", () => {
    const newerNonReviewEntries = Array.from({ length: 12 }, (_, index) =>
      entry(`newer-${index}`, `2026-06-12T14:${String(index).padStart(2, "0")}:00Z`, {
        category: "agent",
        insightLabel: "Agent work",
        tone: "green",
      }),
    );
    const olderNeedsReviewEntry = entry("older-needs-review", "2026-06-11T12:00:00Z", {
      category: "approval",
      insightLabel: "Needs review",
      tone: "amber",
    });
    const query = { needsReview: true };

    const filtered = applyActivityFilters([...newerNonReviewEntries, olderNeedsReviewEntry], query);
    const merged = mergeActivityEntries(filtered, 5);

    expect(merged.map((item) => item.id)).toEqual(["older-needs-review"]);
  });

  it("does not treat historical approval decisions as active review work", () => {
    const filtered = applyActivityFilters(
      [
        entry("active-review", "2026-06-12T14:00:00Z", {
          category: "asset",
          insightLabel: "Needs review",
          tone: "amber",
        }),
        entry("declined-history", "2026-06-12T13:00:00Z", {
          category: "approval",
          insightLabel: "Risk blocked",
          tone: "red",
        }),
        entry("revision-history", "2026-06-12T12:00:00Z", {
          category: "approval",
          insightLabel: "Data changed",
          tone: "amber",
        }),
      ],
      { needsReview: true },
    );

    expect(filtered.map((item) => item.id)).toEqual(["active-review"]);
  });
});

describe("buildActivitySummary", () => {
  it("counts the four insight strip buckets", () => {
    const summary = buildActivitySummary([
      entry("review", "2026-06-12T14:00:00Z", {
        category: "approval",
        insightLabel: "Needs review",
        actorType: "human",
      }),
      entry("hermes", "2026-06-12T13:00:00Z", {
        category: "agent",
        actorType: "hermes",
        insightLabel: "Agent work",
      }),
      entry("campaign", "2026-06-12T12:00:00Z", {
        category: "campaign",
        actorType: "system",
        insightLabel: "Marketing progress",
      }),
      entry("risk", "2026-06-12T11:00:00Z", {
        category: "risk",
        actorType: "system",
        tone: "red",
        insightLabel: "Risk blocked",
      }),
    ]);

    expect(summary).toEqual({
      needsReview: 1,
      hermesActions: 1,
      campaignProgress: 1,
      blockedOrRisky: 1,
    });
  });

  it("counts only explicit active-review rows as needs review", () => {
    const summary = buildActivitySummary([
      entry("active-review", "2026-06-12T14:00:00Z", {
        category: "asset",
        insightLabel: "Needs review",
        tone: "amber",
      }),
      entry("declined-history", "2026-06-12T13:00:00Z", {
        category: "approval",
        insightLabel: "Risk blocked",
        tone: "red",
      }),
    ]);

    expect(summary.needsReview).toBe(1);
  });
});

describe("groupActivityEntriesByDay", () => {
  it("groups entries with friendly day labels", () => {
    const groups = groupActivityEntriesByDay(
      [
        entry("today", "2026-06-12T14:00:00Z"),
        entry("yesterday", "2026-06-11T14:00:00Z"),
        entry("older", "2026-06-10T14:00:00Z"),
      ],
      new Date("2026-06-12T16:00:00Z"),
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "June 10, 2026"]);
    expect(groups.map((group) => group.entries.map((item) => item.id))).toEqual([["today"], ["yesterday"], ["older"]]);
  });

  it("groups entries by the same local day basis used by row time formatting", () => {
    const now = new Date(2026, 5, 12, 0, 30);
    const lateYesterday = new Date(2026, 5, 11, 23, 45).toISOString();

    const groups = groupActivityEntriesByDay([entry("late-yesterday", lateYesterday)], now);

    expect(groups.map((group) => group.label)).toEqual(["Yesterday"]);
  });
});

describe("getRecentActivity source resilience", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps rendering other sources when one source's query fails (schema drift)", async () => {
    const client = fakeClient({
      events: {
        data: [
          {
            id: "e1",
            actor: "Evan",
            subject_type: "lead",
            subject_id: "lead_1",
            type: "lead.created",
            payload: { title: "New lead", detail: "Ada entered the workspace." },
            occurred_at: "2026-06-12T14:00:00Z",
          },
        ],
      },
      agent_run_logs: { error: { message: 'column "created_at" does not exist' } },
    });

    const result = await getRecentActivity({}, client);

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.entries.some((entry) => entry.id === "event:e1")).toBe(true);
    expect(result.entries.some((entry) => entry.kind === "run")).toBe(false);
  });

  it("returns unavailable only when every source fails", async () => {
    const client = fakeClient({
      approval_decisions: { error: { message: "boom" } },
      agent_run_logs: { error: { message: "boom" } },
      agent_outputs: { error: { message: "boom" } },
      campaign_events: { error: { message: "boom" } },
      events: { error: { message: "boom" } },
    });

    const result = await getRecentActivity({}, client);

    expect(result.status).toBe("unavailable");
  });
});

describe("mapCampaignEvent", () => {
  it("uses campaign approval decision payloads instead of the generic approval_decided event name", () => {
    const approved = mapCampaignEvent({
      id: "campaign_1",
      campaign_id: "camp_1",
      approval_item_id: "approval_1",
      event_type: "approval_decided",
      actor: "Evan",
      detail: "approve recorded for approval item.",
      payload: { action: "approve", next_status: "approved" },
      occurred_at: "2026-06-12T14:00:00Z",
    });
    const rejected = mapCampaignEvent({
      id: "campaign_2",
      campaign_id: "camp_1",
      approval_item_id: "approval_2",
      event_type: "approval_decided",
      actor: "Evan",
      detail: "reject recorded for approval item.",
      payload: { action: "reject", next_status: "declined" },
      occurred_at: "2026-06-12T13:00:00Z",
    });
    const revision = mapCampaignEvent({
      id: "campaign_3",
      campaign_id: "camp_1",
      approval_item_id: "approval_3",
      event_type: "approval_decided",
      actor: "Evan",
      detail: "Revision requested: tighten the hook",
      payload: { decision: "revision_requested" },
      occurred_at: "2026-06-12T12:00:00Z",
    });

    expect(approved).toMatchObject({
      tone: "green",
      title: "Approval Approved",
      category: "campaign",
      insightLabel: "Marketing progress",
    });
    expect(rejected).toMatchObject({
      tone: "red",
      title: "Approval Declined",
      category: "risk",
      insightLabel: "Risk blocked",
    });
    expect(revision).toMatchObject({
      tone: "amber",
      title: "Approval Revision Requested",
      category: "campaign",
      insightLabel: "Data changed",
    });
  });

  it("marks campaign approval submissions as active review work", () => {
    const mapped = mapCampaignEvent({
      id: "campaign_4",
      campaign_id: "camp_1",
      approval_item_id: "approval_4",
      event_type: "approval_submitted",
      actor: "Hermes",
      detail: "Draft is ready for review.",
      payload: {},
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(mapped).toMatchObject({
      tone: "amber",
      category: "campaign",
      insightLabel: "Needs review",
      href: "/approvals?item=approval_4",
    });
  });
});

describe("mapEvent", () => {
  it("maps CRM events to readable activity rows with CRM hrefs", () => {
    const mapped = mapEvent({
      id: "evt_1",
      actor: "Evan",
      subject_type: "lead",
      subject_id: "lead_1",
      type: "lead.created",
      payload: { title: "New lead created", detail: "Ada Lovelace entered the workspace.", relatedLabel: "Ada Lovelace" },
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(mapped).toMatchObject({
      id: "event:evt_1",
      kind: "event",
      actor: "Evan",
      actorType: "human",
      category: "crm",
      title: "New lead created",
      detail: "Ada Lovelace entered the workspace.",
      relatedLabel: "Ada Lovelace",
      href: "/crm/leads/lead_1",
    });
  });

  it("never exposes raw event names when no title is present", () => {
    const mapped = mapEvent({
      id: "evt_2",
      actor: "system.process.queued_task",
      subject_type: "campaign",
      subject_id: "campaign_1",
      type: "campaign.ready_for_review",
      payload: {},
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(mapped.title).toBe("Campaign Ready For Review");
    expect(mapped.actor).toBe("System");
    expect(mapped.href).toBe("/campaigns/campaign_1");
  });

  it("classifies broader subjects, generic agent actors, and unknown insights", () => {
    const assetEvent = mapEvent({
      id: "evt_3",
      actor: "research_agent",
      subject_type: "marketing_asset_revision",
      subject_id: "asset_1",
      type: "record.touched",
      payload: {},
      occurred_at: "2026-06-12T14:00:00Z",
    });
    const draftEvent = mapEvent({
      id: "evt_4",
      actor: "agent.worker",
      subject_type: "email_draft",
      subject_id: "draft_1",
      type: "record.touched",
      payload: {},
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(assetEvent).toMatchObject({
      actor: "Research Agent",
      actorType: "sub_agent",
      category: "asset",
      insightLabel: "Data changed",
    });
    expect(draftEvent).toMatchObject({
      actor: "Agent Worker",
      actorType: "sub_agent",
      category: "asset",
      insightLabel: "Data changed",
    });
  });
});
