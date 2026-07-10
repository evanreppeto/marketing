import { describe, expect, it, vi, beforeEach } from "vitest";

// Supabase is "configured" so the ledger write path runs; we pass a fake client
// into the functions directly, so getSupabaseAdminClient is only a fallback.
const supa = vi.hoisted(() => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => supa);

import {
  authorizeMeteredCall,
  meterConnectorCall,
  recordConnectorUsage,
} from "../metering";

/**
 * Minimal chainable Supabase fake. Serves a spend-budget row (cap), a set of
 * period usage rows (spend), and captures inserts so tests can assert whether a
 * ledger row was written.
 */
function makeClient(opts: { capCents?: number | null; spentRows?: Array<{ cost_estimate_cents: number }> }) {
  const capCents = opts.capCents;
  const spentRows = opts.spentRows ?? [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = { _table: table, _insert: false };
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.insert = (row: Record<string, unknown>) => {
        builder._insert = true;
        inserts.push({ table, row });
        return builder;
      };
      // Terminal for the period-spend query: from().select().eq().gte()
      builder.gte = () => Promise.resolve({ data: spentRows, error: null });
      // Terminal for the cap query: from().select().eq().maybeSingle()
      builder.maybeSingle = () =>
        Promise.resolve({ data: capCents == null ? null : { cap_cents: capCents }, error: null });
      // Terminal for the insert: from().insert().select().single()
      builder.single = () => Promise.resolve({ data: { id: `usage-${inserts.length}` }, error: null });
      return builder;
    },
  };
  return { client: client as never, inserts };
}

beforeEach(() => {
  supa.isSupabaseAdminConfigured.mockReturnValue(true);
});

describe("recordConnectorUsage — metering guardrail", () => {
  it("THROWS for a free connector (free/byo_key must never write a usage row)", async () => {
    const { client } = makeClient({});
    await expect(
      recordConnectorUsage(client, { orgId: "o", workspaceId: "w", connectorKey: "weather-signals", units: 5 }),
    ).rejects.toThrow(/non-metered/i);
  });

  it("THROWS for a byo_key connector", async () => {
    const { client } = makeClient({});
    await expect(
      recordConnectorUsage(client, { orgId: "o", workspaceId: "w", connectorKey: "gemini-research", units: 5 }),
    ).rejects.toThrow(/bypass metering/i);
  });

  it("writes a ledger row for a metered connector, pricing the units", async () => {
    const { client, inserts } = makeClient({});
    const res = await recordConnectorUsage(client, {
      orgId: "o",
      workspaceId: "w",
      connectorKey: "permit-data",
      units: 10,
    });
    expect(res.recorded).toBe(true);
    if (res.recorded) expect(res.costCents).toBe(80); // 8c * 10
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("connector_usage_events");
    expect(inserts[0].row).toMatchObject({ connector_key: "permit-data", units: 10, cost_estimate_cents: 80 });
  });
});

describe("authorizeMeteredCall", () => {
  it("authorizes + bypasses a free connector without reading cap/spend", async () => {
    const { client } = makeClient({ capCents: 0, spentRows: [{ cost_estimate_cents: 999999 }] });
    const auth = await authorizeMeteredCall(client, { workspaceId: "w", connectorKey: "weather-signals", estimatedUnits: 3 });
    expect(auth.authorized).toBe(true);
    if (auth.authorized) expect(auth.bypassed).toBe(true);
  });

  it("authorizes a metered call under the cap", async () => {
    const { client } = makeClient({ capCents: 5000, spentRows: [{ cost_estimate_cents: 1000 }] });
    const auth = await authorizeMeteredCall(client, { workspaceId: "w", connectorKey: "permit-data", estimatedUnits: 10 });
    expect(auth.authorized).toBe(true);
    if (auth.authorized) {
      expect(auth.bypassed).toBe(false);
      expect(auth.estimatedCostCents).toBe(80);
      expect(auth.spentCents).toBe(1000);
    }
  });

  it("refuses a metered call that would breach the cap, with an approve-more message", async () => {
    const { client } = makeClient({ capCents: 50, spentRows: [] });
    const auth = await authorizeMeteredCall(client, { workspaceId: "w", connectorKey: "permit-data", estimatedUnits: 10 });
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.reason).toBe("cap_exceeded");
      expect(auth.needsApproval).toBe(true);
      expect(auth.overByCents).toBe(30); // 80 - 50
      expect(auth.message).toMatch(/exceed your \$0\.50 spend cap/i);
      expect(auth.message).toMatch(/Settings → Usage/);
    }
  });
});

describe("meterConnectorCall — central guard", () => {
  it("runs a FREE connector directly and records NOTHING", async () => {
    const { client, inserts } = makeClient({ capCents: 0 });
    const run = vi.fn(async () => "did-work");
    const out = await meterConnectorCall(
      client,
      { orgId: "o", workspaceId: "w", connectorKey: "weather-signals", estimatedUnits: 3 },
      run,
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.metered).toBe(false);
      expect(out.result).toBe("did-work");
    }
    expect(run).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(0); // guardrail: no ledger row for free connectors
  });

  it("runs a metered connector under cap, then records actual usage", async () => {
    const { client, inserts } = makeClient({ capCents: 5000, spentRows: [] });
    const run = vi.fn(async () => ["a", "b"]);
    const out = await meterConnectorCall(
      client,
      { orgId: "o", workspaceId: "w", connectorKey: "permit-data", estimatedUnits: 10 },
      run,
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.metered).toBe(true);
      expect(out.costCents).toBe(80);
    }
    expect(run).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(1);
  });

  it("REFUSES a metered connector over cap: run() never fires, nothing spent", async () => {
    const { client, inserts } = makeClient({ capCents: 50, spentRows: [] });
    const run = vi.fn(async () => "should-not-run");
    const out = await meterConnectorCall(
      client,
      { orgId: "o", workspaceId: "w", connectorKey: "permit-data", estimatedUnits: 10 },
      run,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.refusal.reason).toBe("cap_exceeded");
    expect(run).not.toHaveBeenCalled(); // never overspend silently
    expect(inserts).toHaveLength(0);
  });

  it("records actual units from the result when they differ from the estimate", async () => {
    const { client, inserts } = makeClient({ capCents: 5000, spentRows: [] });
    const run = vi.fn(async () => ["only-one"]);
    const out = await meterConnectorCall(
      client,
      { orgId: "o", workspaceId: "w", connectorKey: "permit-data", estimatedUnits: 10 },
      run,
      (result) => result.length, // actual = 1 lookup returned
    );
    expect(out.ok).toBe(true);
    expect(inserts[0].row).toMatchObject({ units: 1, cost_estimate_cents: 8 });
  });
});
