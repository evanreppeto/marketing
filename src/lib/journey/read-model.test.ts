import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getJourneysReadModel } from "./read-model";

const NOW = Date.parse("2026-03-11T00:00:00.000Z");

describe("getJourneysReadModel", () => {
  it("assembles a contact's converted journey from engagement + lead + outcome rows", async () => {
    const supabase = createSupabaseQueryMock({
      contacts: { data: [{ id: "c1", full_name: "Dana Whitfield", email: null, persona: "persona_distressed", created_at: "2026-03-01T00:00:00Z" }], error: null },
      engagement_events: {
        data: [
          {
            id: "e1",
            contact_id: "c1",
            campaign_id: "camp-1",
            campaign_asset_id: null,
            event_type: "outbound_send",
            channel: "meta",
            direction: "outbound",
            occurred_at: "2026-03-01T00:00:00Z",
            summary: "Sent ad",
          },
        ],
        error: null,
      },
      leads: {
        data: [
          {
            id: "l1",
            contact_id: "c1",
            attributed_campaign_id: "camp-1",
            attributed_asset_id: null,
            attribution_channel: "meta",
            source: "meta_ad",
            received_at: "2026-03-02T00:00:00Z",
            created_at: "2026-03-02T00:00:00Z",
          },
        ],
        error: null,
      },
      jobs: { data: [], error: null },
      outcomes: {
        data: [{ id: "o1", contact_id: "c1", status: "won", gross_revenue_cents: 500000, closed_at: "2026-03-10T00:00:00Z", created_at: "2026-03-10T00:00:00Z" }],
        error: null,
      },
    });

    const model = await getJourneysReadModel(supabase, undefined, NOW);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;

    expect(model.journeys).toHaveLength(1);
    const j = model.journeys[0];
    expect(j.identity.label).toBe("Dana Whitfield");
    expect(j.persona).toBe("persona_distressed");
    expect(j.currentStage).toBe("converted");
    expect(j.converted).toBe(true);
    expect(j.conversionValueCents).toBe(500000);

    expect(model.kpis.total).toBe(1);
    expect(model.kpis.converted).toBe(1);
    expect(model.kpis.realizedCents).toBe(500000);

    const converted = model.funnel.find((f) => f.key === "converted");
    expect(converted?.count).toBe(1);
    expect(model.funnel.find((f) => f.key === "reached")?.count).toBe(1);

    // Last-touch credit lands on the last attributable channel (the lead's meta touch).
    expect(model.channelCreditByModel.last_touch[0]).toMatchObject({ channel: "meta", valueCents: 500000 });
  });

  it("computes channel credit under every attribution lens, and the lenses disagree", async () => {
    // meta reached them first (engagement), email closed them (the attributed lead).
    const supabase = createSupabaseQueryMock({
      contacts: { data: [{ id: "c1", full_name: "Split Journey", email: null, persona: null, created_at: "2026-03-01T00:00:00Z" }], error: null },
      engagement_events: {
        data: [
          {
            id: "e1",
            contact_id: "c1",
            campaign_id: "camp-1",
            campaign_asset_id: null,
            event_type: "outbound_send",
            channel: "meta",
            direction: "outbound",
            occurred_at: "2026-03-01T00:00:00Z",
            summary: "first touch",
          },
        ],
        error: null,
      },
      leads: {
        data: [
          {
            id: "l1",
            contact_id: "c1",
            attributed_campaign_id: "camp-2",
            attributed_asset_id: null,
            attribution_channel: "email",
            source: "email",
            received_at: "2026-03-05T00:00:00Z",
            created_at: "2026-03-05T00:00:00Z",
          },
        ],
        error: null,
      },
      outcomes: {
        data: [{ id: "o1", contact_id: "c1", status: "won", gross_revenue_cents: 400000, closed_at: "2026-03-10T00:00:00Z", created_at: "2026-03-10T00:00:00Z" }],
        error: null,
      },
    });

    const model = await getJourneysReadModel(supabase, undefined, NOW);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;

    const byModel = model.channelCreditByModel;
    // Every lens is precomputed server-side so the picker switches with no round-trip.
    expect(Object.keys(byModel).sort()).toEqual(["first_touch", "last_touch", "linear", "position_based", "time_decay"]);

    // The whole point of lenses: they credit different channels.
    expect(byModel.last_touch).toEqual([{ channel: "email", valueCents: 400000, conversions: 1 }]);
    expect(byModel.first_touch).toEqual([{ channel: "meta", valueCents: 400000, conversions: 1 }]);

    // Linear splits the same conversion evenly across both channels.
    const linear = Object.fromEntries(byModel.linear.map((c) => [c.channel, c.valueCents]));
    expect(linear).toEqual({ meta: 200000, email: 200000 });
  });

  it("returns an empty live model when there is data access but no records (demo flag off)", async () => {
    const supabase = createSupabaseQueryMock({
      contacts: { data: [], error: null },
      engagement_events: { data: [], error: null },
      leads: { data: [], error: null },
      jobs: { data: [], error: null },
      outcomes: { data: [], error: null },
    });
    const model = await getJourneysReadModel(supabase, undefined, NOW);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;
    expect(model.journeys).toHaveLength(0);
    expect(model.kpis.total).toBe(0);
    expect(model.funnel.every((f) => f.count === 0)).toBe(true);
  });

  it("skips internal/operational engagement events (not part of the customer journey)", async () => {
    const supabase = createSupabaseQueryMock({
      contacts: { data: [{ id: "c1", full_name: "Ops Only", email: null, persona: null, created_at: "2026-03-01T00:00:00Z" }], error: null },
      engagement_events: {
        data: [
          { id: "e1", contact_id: "c1", campaign_id: null, campaign_asset_id: null, event_type: "agent_started", channel: null, direction: "internal", occurred_at: "2026-03-01T00:00:00Z", summary: "agent" },
        ],
        error: null,
      },
      leads: { data: [], error: null },
      jobs: { data: [], error: null },
      outcomes: { data: [], error: null },
    });
    const model = await getJourneysReadModel(supabase, undefined, NOW);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;
    // The only event was internal → no customer touches → no journey.
    expect(model.journeys).toHaveLength(0);
  });

  it("folds in P1 collected touchpoints — anonymous journeys + stitched-onto-contact", async () => {
    const supabase = createSupabaseQueryMock({
      contacts: { data: [{ id: "c1", full_name: "Dana Whitfield", email: null, persona: "persona_x", created_at: "2026-03-01T00:00:00Z" }], error: null },
      leads: {
        data: [
          {
            id: "l1",
            contact_id: "c1",
            attributed_campaign_id: "camp-1",
            attributed_asset_id: null,
            attribution_channel: "meta",
            source: "meta_ad",
            received_at: "2026-03-03T00:00:00Z",
            created_at: "2026-03-03T00:00:00Z",
          },
        ],
        error: null,
      },
      journey_identities: {
        data: [
          { id: "is", contact_id: "c1", resolution: "stitched", anonymous_id: "anon-s" },
          { id: "ia", contact_id: null, resolution: "anonymous", anonymous_id: "anon-a" },
        ],
        error: null,
      },
      journey_touchpoints: {
        data: [
          { id: "tp1", identity_id: "is", contact_id: "c1", occurred_at: "2026-03-01T00:00:00Z", kind: "ad_click", direction: "inbound", channel: "meta", campaign_id: "camp-1", campaign_asset_id: null, summary: "clicked", is_conversion: false, value_cents: null },
          { id: "tp2", identity_id: "ia", contact_id: null, occurred_at: "2026-03-02T00:00:00Z", kind: "site_visit", direction: "inbound", channel: "meta", campaign_id: "camp-1", campaign_asset_id: null, summary: "visited", is_conversion: false, value_cents: null },
        ],
        error: null,
      },
    });

    const model = await getJourneysReadModel(supabase, undefined, NOW);
    expect(model.status).toBe("live");
    if (model.status !== "live") return;

    const dana = model.journeys.find((j) => j.identity.label === "Dana Whitfield");
    const anon = model.journeys.find((j) => j.identity.resolution === "anonymous");

    // The stitched touch merged onto the known contact, whose identity now reads "stitched".
    expect(dana?.identity.resolution).toBe("stitched");
    expect(dana?.timeline.some((t) => t.id === "tp:tp1")).toBe(true);

    // The unstitched identity is its own pre-lead journey.
    expect(anon?.identity.label).toBe("Anonymous visitor");
    expect(anon?.currentStage).toBe("engaged");
  });
});
