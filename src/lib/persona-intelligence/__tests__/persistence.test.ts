import { describe, expect, it } from "vitest";

import { parseLeadIngestionPayload } from "../../../domain";
import { type PersistedLeadIngestion } from "../../lead-ingestion/persistence";

import { persistPersonaIntelligenceForLead } from "../persistence";

type InsertCall = {
  table: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

function createSupabaseMock() {
  const calls: InsertCall[] = [];
  const singleIds = ["snapshot-1", "action-1"];
  const eventIds = ["event-1", "event-2", "event-3"];

  return {
    calls,
    client: {
      from(table: string) {
        return {
          insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
            calls.push({ table, values });

            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: singleIds.shift() },
                      error: null,
                    });
                  },
                  returns() {
                    return Promise.resolve({
                      data: eventIds.map((id) => ({ id })),
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

const persisted: PersistedLeadIngestion = {
  companyId: "company-1",
  contactId: "contact-1",
  propertyId: "property-1",
  leadId: "lead-1",
  leadCreated: true,
};

describe("persona intelligence persistence", () => {
  it("creates a snapshot, engagement events, and a next best action for accepted leads", async () => {
    const result = parseLeadIngestionPayload(
      {
        persona: "persona_homeowner_emergency",
        source: "website",
        contact: {
          firstName: "Marlene",
          phone: "312-555-0148",
        },
        property: {
          streetLine1: "1234 W Addison St",
          city: "Chicago",
          state: "IL",
          postalCode: "60613",
        },
        lossSummary: "Basement flooding after burst pipe",
        lossSignals: ["standing water", "burst pipe"],
      },
      "2026-05-27T17:00:00.000Z",
    );

    if (!result.ok) {
      throw new Error("Expected payload to parse successfully.");
    }

    const { calls, client } = createSupabaseMock();
    const created = await persistPersonaIntelligenceForLead({
      input: result.normalizedInput,
      result,
      persisted,
      supabase: client as never,
    });

    expect(created).toEqual({
      personaSnapshotId: "snapshot-1",
      engagementEventIds: ["event-1", "event-2", "event-3"],
      nextBestActionId: "action-1",
    });
    expect(calls.map((call) => call.table)).toEqual([
      "persona_snapshots",
      "engagement_events",
      "next_best_actions",
    ]);
    expect(calls[0].values).toMatchObject({
      persona: "persona_homeowner_emergency",
      lead_id: "lead-1",
      relationship_stage: "urgent_decision",
      preferred_channel: "phone_then_sms",
    });
    expect(calls[2].values).toMatchObject({
      persona_snapshot_id: "snapshot-1",
      lead_id: "lead-1",
      action_type: "emergency_follow_up",
      approval_required: true,
    });
  });

  it("blocks campaign generation for archived out-of-scope submissions", async () => {
    const result = parseLeadIngestionPayload(
      {
        persona: "persona_homeowner_emergency",
        source: "website",
        contact: {
          email: "homeowner@example.com",
        },
        lossSummary: "Exterior-only roof hail inspection",
        lossSignals: ["hail damage", "exterior-only roof"],
      },
      "2026-05-27T17:00:00.000Z",
    );

    if (!result.ok) {
      throw new Error("Expected payload to parse successfully.");
    }

    const { calls, client } = createSupabaseMock();
    await persistPersonaIntelligenceForLead({
      input: result.normalizedInput,
      result,
      persisted,
      supabase: client as never,
    });

    expect(result.routing).toBe("archived");
    expect(calls[0].values).toMatchObject({
      relationship_stage: "scope_review",
      recommended_offer: "No campaign offer until restoration fit is verified",
      risk_flags: ["out_of_scope_loss_signal", "campaign_generation_blocked"],
    });
    expect(calls[2].values).toMatchObject({
      action_type: "scope_review",
      approval_required: false,
    });
  });
});
