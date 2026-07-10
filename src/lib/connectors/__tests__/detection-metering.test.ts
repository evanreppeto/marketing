import { describe, expect, it, vi, beforeEach } from "vitest";

// Verify cost governance is wired CENTRALLY into the detection run path: every
// signal source is routed through meterConnectorCall, and a refusal skips the
// scan (no opportunities upserted) while an allowed run proceeds.

const readModel = vi.hoisted(() => ({ listWorkspaceConnectors: vi.fn() }));
vi.mock("../read-model", () => readModel);

const config = vi.hoisted(() => ({ getConnectorConfig: vi.fn(async () => ({ municipalities: ["Chicago", "Naperville"] })) }));
vi.mock("../config", () => config);

const opps = vi.hoisted(() => ({ upsertOpportunities: vi.fn(async () => ({ ok: true, count: 2 })) }));
vi.mock("@/lib/opportunities/persistence", () => opps);

const supa = vi.hoisted(() => ({ isSupabaseAdminConfigured: vi.fn(() => true), getSupabaseAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => supa);

const metering = vi.hoisted(() => ({ meterConnectorCall: vi.fn() }));
vi.mock("../metering", () => metering);

import { runSignalSourceDetection } from "../detection";

beforeEach(() => {
  vi.clearAllMocks();
  supa.isSupabaseAdminConfigured.mockReturnValue(true);
});

describe("runSignalSourceDetection — central cost governance", () => {
  it("routes a metered source through meterConnectorCall and upserts when allowed", async () => {
    readModel.listWorkspaceConnectors.mockResolvedValue([
      { key: "permit-data", kind: "signal_source", status: "connected" },
    ]);
    metering.meterConnectorCall.mockResolvedValue({ ok: true, metered: true, result: [{}, {}], costCents: 16 });

    const res = await runSignalSourceDetection({ workspaceId: "w", orgId: "o" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bySource["permit-data"]).toBe(2);
      expect(res.total).toBe(2);
      expect(res.refused).toEqual({});
    }
    // priced up front by the source's estimateUnits (2 municipalities → 2 units)
    expect(metering.meterConnectorCall).toHaveBeenCalledOnce();
    const args = metering.meterConnectorCall.mock.calls[0][1];
    expect(args).toMatchObject({ connectorKey: "permit-data", estimatedUnits: 2 });
    expect(opps.upsertOpportunities).toHaveBeenCalledOnce();
  });

  it("skips the scan (no upsert) and reports the refusal when the cap is breached", async () => {
    readModel.listWorkspaceConnectors.mockResolvedValue([
      { key: "permit-data", kind: "signal_source", status: "connected" },
    ]);
    metering.meterConnectorCall.mockResolvedValue({
      ok: false,
      metered: true,
      refusal: { reason: "cap_exceeded", message: "would exceed your $0.50 spend cap" },
    });

    const res = await runSignalSourceDetection({ workspaceId: "w", orgId: "o" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.total).toBe(0);
      expect(res.bySource["permit-data"]).toBe(0);
      expect(res.refused["permit-data"]).toMatchObject({ reason: "cap_exceeded" });
    }
    expect(opps.upsertOpportunities).not.toHaveBeenCalled(); // no scan on refusal
  });
});
