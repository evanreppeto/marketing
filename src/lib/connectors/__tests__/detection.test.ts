import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpportunityCandidate } from "@/domain";
import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => {
    throw new Error("tests must pass an explicit client");
  },
}));

import { runSignalSourceDetection } from "../detection";
import { registerSignalSource } from "../registry";
import { weatherSignalConnector } from "../builtin";

const NOW = "2026-06-17T18:00:00.000Z";

const WEATHER_CANDIDATE: OpportunityCandidate = {
  kind: "weather_event",
  subjectType: "weather_event",
  subjectId: "urn:oid:warn-1",
  title: "Flash Flood Warning — Cook, IL",
  summary: "Active flash-flood warning in the coverage area.",
  confidence: 88,
  urgency: "high",
  evidence: { persona: "persona_homeowner_emergency" },
  recommendedAction: "Launch a geo-targeted storm-response campaign",
  recommendedCampaignType: "storm_response",
};

function insertedRows(mock: MockSupabase): Array<Record<string, unknown>> {
  const call = mock.calls.find((c) => c[0] === "insert");
  return (call?.[1] as Array<Record<string, unknown>>) ?? [];
}

// Restore the real (network-backed) connector after each case so we never leak a
// stubbed detect() into another test — and never hit the live NWS feed here.
afterEach(() => {
  registerSignalSource(weatherSignalConnector);
  vi.clearAllMocks();
});

describe("runSignalSourceDetection", () => {
  it("runs each ENABLED signal_source connector and upserts its candidates (org-scoped)", async () => {
    // Stub the weather source's detect() with fixed candidates — no network.
    registerSignalSource({ key: "weather-signals", detect: () => [WEATHER_CANDIDATE] });

    const mock = createSupabaseQueryMock({
      workspace_connectors: [
        {
          data: [
            {
              connector_key: "weather-signals",
              enabled: true,
              credential_ref: null,
              config: { states: ["IL"] },
              last_tested_at: null,
              last_test_ok: null,
              last_test_error: null,
            },
          ],
          error: null,
        },
        { data: { config: { states: ["IL"] } }, error: null },
      ],
      opportunities: [
        { data: [], error: null }, // open-status dedup read (nothing open yet)
        { data: null, error: null }, // insert
      ],
    });

    const res = await runSignalSourceDetection({ workspaceId: "ws-1", orgId: "org-1", client: mock, now: NOW });

    // free connectors bypass cost metering, so `refused` stays empty (BSR-372).
    expect(res).toEqual({ ok: true, bySource: { "weather-signals": 1 }, total: 1, refused: {} });
    expect(insertedRows(mock)[0]).toMatchObject({
      kind: "weather_event",
      subject_id: "urn:oid:warn-1",
      org_id: "org-1",
    });
  });

  it("skips connectors that are not enabled — nothing runs, nothing inserted", async () => {
    const mock = createSupabaseQueryMock({
      workspace_connectors: [
        {
          data: [
            {
              connector_key: "weather-signals",
              enabled: false,
              credential_ref: null,
              config: {},
              last_tested_at: null,
              last_test_ok: null,
              last_test_error: null,
            },
          ],
          error: null,
        },
      ],
    });

    const res = await runSignalSourceDetection({ workspaceId: "ws-1", orgId: "org-1", client: mock, now: NOW });

    expect(res).toEqual({ ok: true, bySource: {}, total: 0, refused: {} });
    expect(mock.calls.find((c) => c[0] === "insert")).toBeUndefined();
  });
});
