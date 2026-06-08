import { describe, expect, it } from "vitest";

import {
  buildApprovalHistory,
  buildAuditLog,
  buildExecutiveOverview,
  buildLaunchState,
  buildMarkConversation,
  buildReasoning,
  buildSources,
  classifyMediaAsset,
  selectPendingDeliverables,
  type CampaignWorkspaceAsset,
} from "../read-model";

function asset(overrides: Partial<CampaignWorkspaceAsset>): CampaignWorkspaceAsset {
  return {
    id: "asset-1",
    title: "Asset",
    assetType: "Email",
    category: "virtual",
    channel: "Email",
    status: "pending_approval",
    body: "",
    preview: "",
    complianceNotes: "",
    dispatchLocked: true,
    toolSource: null,
    updatedAt: "",
    media: [],
    revision: null,
    approval: null,
    ...overrides,
  };
}

const baseCampaign = {
  id: "campaign-1",
  name: "North Shore Spring Launch",
  persona: "persona_property_manager",
  restoration_focus: "water_mitigation",
  status: "pending_approval",
  company_id: null,
  contact_id: null,
  lead_id: null,
  owner: "Mark",
  objective: "Pre-approve Big Shoulders as the priority water-loss vendor before spring thaw.",
  audience_summary: "Property managers in 60091/60093/60201.",
  offer_summary: "Insurance-ready water-loss response with a managed-building SLA.",
  compliance_notes: null,
  launch_locked: true,
  source_signal: {},
  reasoning_payload: {},
  audit_payload: {},
  created_at: "2026-01-15T14:00:00.000Z",
  updated_at: "2026-01-20T15:30:00.000Z",
};

describe("buildExecutiveOverview", () => {
  it("uses explicit payload answers for timeframe, geography, and success metrics", () => {
    const campaign = {
      ...baseCampaign,
      reasoning_payload: {
        customer_journey_overview: "A property-manager journey from risk awareness to vendor pre-approval.",
        why_mark_built_it: "Spring thaw increases managed-building water-loss risk.",
        campaign_window: { start_date: "2026-03-01", end_date: "2026-04-15" },
        markets: ["60091", "60093", "60201"],
        success_metrics: ["approved vendor packets", "booked water-loss referrals"],
      },
    };
    const reasoning = buildReasoning(campaign as Parameters<typeof buildReasoning>[0], []);

    const overview = buildExecutiveOverview({
      campaign: campaign as Parameters<typeof buildExecutiveOverview>[0]["campaign"],
      assets: [],
      approvals: [],
      sources: [],
      reasoning,
    });

    expect(overview).toMatchObject({
      what: "A property-manager journey from risk awareness to vendor pre-approval.",
      why: "Spring thaw increases managed-building water-loss risk. Goal: reduce decision friction and make the next step clear.",
      timeframe: "2026-03-01 to 2026-04-15",
      where: "60091, 60093, 60201",
      successTracking: "approved vendor packets, booked water-loss referrals",
    });
  });

  it("falls back to existing campaign evidence when Mark has not supplied explicit fields yet", () => {
    const reasoning = buildReasoning(baseCampaign as Parameters<typeof buildReasoning>[0], []);

    const overview = buildExecutiveOverview({
      campaign: baseCampaign as Parameters<typeof buildExecutiveOverview>[0]["campaign"],
      assets: [],
      approvals: [],
      sources: [
        {
          id: "source-1",
          label: "Property manager directory",
          detail: "Evidence URL captured by Mark.",
          url: "https://example.com",
          recordHref: null,
          kind: "web",
        },
      ],
      reasoning,
    });

    expect(overview.what).toContain("Move");
    expect(overview.what).toContain("Property managers in 60091/60093/60201");
    expect(overview.why).toContain("reduce decision friction");
    expect(overview.timeframe).toContain("Decision window: before spring thaw");
    expect(overview.where).toContain("Client context");
    expect(overview.where).toContain(baseCampaign.audience_summary);
    expect(overview.successTracking).toContain("Current evidence: 1 source record");
    expect(overview.successTracking).toContain("form/phone/photo uploads");
  });
});

describe("buildLaunchState", () => {
  it("is In review while any gating piece is undecided", () => {
    const state = buildLaunchState(
      [asset({ id: "a", approval: { id: "ap", status: "Pending approval" } }), asset({ id: "b", approval: { id: "ap2", status: "Approved" } })],
      true,
    );
    expect(state.lifecycle).toBe("In review");
    expect(state.ready).toBe(false);
    expect(state.pendingCount).toBe(1);
    expect(state.approvedCount).toBe(1);
  });

  it("is Ready once every piece is decided with at least one approved", () => {
    const state = buildLaunchState(
      [asset({ id: "a", approval: { id: "ap", status: "Approved" } }), asset({ id: "b", status: "approved" })],
      true,
    );
    expect(state.lifecycle).toBe("Ready");
    expect(state.ready).toBe(true);
    expect(state.pendingCount).toBe(0);
  });

  it("counts deployed pieces and reads Live once launched", () => {
    const state = buildLaunchState([asset({ id: "a", approval: { id: "ap", status: "Approved" }, dispatchLocked: false })], false);
    expect(state.live).toBe(true);
    expect(state.lifecycle).toBe("Live");
    expect(state.deployedCount).toBe(1);
  });

  it("treats an ungated draft asset as a pending piece (no dead-ends)", () => {
    const state = buildLaunchState([asset({ id: "a", status: "draft", approval: null })], true);
    expect(state.requiredCount).toBe(1);
    expect(state.pendingCount).toBe(1);
  });
});

describe("buildApprovalHistory", () => {
  it("maps decisions to clear actions, newest first, resolving item titles", () => {
    const decisions = [
      { id: "d1", approval_item_id: "ap1", decision: "approved", decided_by: "ops@bigshoulders.test", decided_at: "2026-06-01T10:00:00.000Z", decision_notes: null, previous_status: "pending_approval", next_status: "approved" },
      { id: "d2", approval_item_id: "ap1", decision: "declined", decided_by: "ops@bigshoulders.test", decided_at: "2026-06-02T10:00:00.000Z", decision_notes: "Tighten the hook", previous_status: "approved", next_status: "declined" },
    ];
    const approvals = [{ id: "ap1", item_type: "email_campaign_asset", prompt_inputs: { title: "Partner intro email" } }];

    const history = buildApprovalHistory(
      decisions as Parameters<typeof buildApprovalHistory>[0],
      approvals as Parameters<typeof buildApprovalHistory>[1],
    );

    expect(history.map((h) => h.action)).toEqual(["Sent back for rework", "Approved"]);
    expect(history[0]).toMatchObject({ itemTitle: "Partner intro email", decidedBy: "ops@bigshoulders.test", notes: "Tighten the hook", tone: "red" });
  });
});

describe("buildAuditLog", () => {
  it("tags actors and merges events with Mark outputs, newest first", () => {
    const events = [
      { id: "e1", event_type: "launched", actor: "ops@bigshoulders.test", detail: "Campaign launched", occurred_at: "2026-06-03T09:00:00.000Z" },
      { id: "e2", event_type: "asset_generated", actor: "Mark", detail: "Drafted email", occurred_at: "2026-06-01T09:00:00.000Z" },
    ];
    const outputs = [
      { id: "o1", output_type: "email_draft", title: "Partner intro email", created_at: "2026-06-02T09:00:00.000Z", body: "", edited_body: null, structured_payload: {}, approval_status: "approved" },
    ];

    const log = buildAuditLog(
      events as Parameters<typeof buildAuditLog>[0],
      outputs as Parameters<typeof buildAuditLog>[1],
    );

    expect(log.map((entry) => entry.id)).toEqual(["evt-e1", "out-o1", "evt-e2"]);
    expect(log[0]).toMatchObject({ actorKind: "user", action: "Launched" });
    expect(log[1]).toMatchObject({ actorKind: "mark", action: "Produced Email Draft" });
    expect(log[2]).toMatchObject({ actorKind: "mark" });
  });
});

describe("buildMarkConversation", () => {
  it("includes only human-initiated directives as operator turns, with Mark's outputs, chronological", () => {
    const tasks = [
      { id: "t1", objective: "Draft 2 more ads", task_type: "campaign_directive", status: "queued", priority: "high", metadata: { requested_by: "ops@bigshoulders.test", human_instruction: "Draft 2 more ads" }, created_at: "2026-06-02T09:00:00.000Z", updated_at: "" },
      { id: "t2", objective: "autonomous sweep", task_type: "scheduled_scan", status: "queued", priority: "low", metadata: {}, created_at: "2026-06-01T09:00:00.000Z", updated_at: "" },
    ];
    const outputs = [
      { id: "o1", output_type: "ad_draft", title: "Search ad", created_at: "2026-06-03T09:00:00.000Z", body: "Body", edited_body: null, structured_payload: {}, approval_status: "pending_approval" },
    ];

    const convo = buildMarkConversation(
      tasks as Parameters<typeof buildMarkConversation>[0],
      outputs as Parameters<typeof buildMarkConversation>[1],
    );

    // Autonomous task (no requester) is excluded; ordered oldest→newest.
    expect(convo.map((m) => m.id)).toEqual(["task-t1", "output-o1"]);
    expect(convo[0]).toMatchObject({ role: "operator", author: "ops@bigshoulders.test" });
    expect(convo[1]).toMatchObject({ role: "mark", title: "Search ad" });
  });
});

describe("classifyMediaAsset", () => {
  it("keeps hosted video players as embeds even when metadata says video", () => {
    expect(classifyMediaAsset("https://www.youtube.com/watch?v=aqz-KE-bpKQ", null, "video")).toBe("embed");
    expect(classifyMediaAsset("https://youtu.be/aqz-KE-bpKQ", "video/youtube", "video")).toBe("embed");
    expect(classifyMediaAsset("https://vimeo.com/123456", null, "video")).toBe("embed");
    expect(classifyMediaAsset("https://example.com/asset.mp4", "video/mp4", "video")).toBe("video");
  });
});

describe("buildSources", () => {
  it("excludes the campaign's own creative/media URLs from evidence sources", () => {
    const storageUrl =
      "https://fpjvgqrfqncnudqeudee.supabase.co/storage/v1/object/public/campaign-media/social-ads/run/0-feed.png";
    const realEvidence = "https://competitor-example.com/ads";

    const sources = buildSources({
      campaign: { ...baseCampaign, source_signal: { evidence_urls: [realEvidence] } },
      assets: [
        { id: "a1", audit_payload: { media_assets: [{ url: storageUrl, type: "ad" }] }, prompt_inputs: {}, reasoning_payload: {} },
      ],
      approvals: [],
      companies: [],
      contacts: [],
      leads: [],
      outputs: [],
    } as unknown as Parameters<typeof buildSources>[0]);

    const webUrls = sources.filter((s) => s.kind === "web").map((s) => s.url);
    expect(webUrls).toContain(realEvidence);
    expect(webUrls).not.toContain(storageUrl);
  });
});

describe("selectPendingDeliverables", () => {
  it("returns only deliverables still awaiting a decision", () => {
    const pending = selectPendingDeliverables([
      asset({ id: "a1", title: "Welcome email", status: "Needs approval", approval: null }),
      asset({ id: "a2", status: "Approved", approval: { id: "x", status: "Approved" } }),
      asset({ id: "a3", status: "Draft", approval: { id: "y", status: "Pending owner approval" } }),
    ]);
    expect(pending.map((d) => d.assetId)).toEqual(["a1", "a3"]);
    expect(pending[0]).toMatchObject({ assetId: "a1", title: "Welcome email", kind: "Email" });
  });
});
