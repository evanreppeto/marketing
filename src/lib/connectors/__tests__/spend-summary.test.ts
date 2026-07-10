import { describe, expect, it } from "vitest";

import { type ConnectorUsageEvent } from "@/domain";

import { toConnectorSpendView } from "../spend-summary";

describe("toConnectorSpendView", () => {
  it("shapes cap / spent / remaining labels and percentages", () => {
    const events: ConnectorUsageEvent[] = [
      { connectorKey: "permit-data", units: 100, costCents: 800, occurredAt: "2026-07-01T00:00:00Z" },
      { connectorKey: "permit-data", units: 50, costCents: 400, occurredAt: "2026-07-02T00:00:00Z" },
    ];
    const view = toConnectorSpendView(events, 5000, false, true);
    expect(view.spentLabel).toBe("$12.00");
    expect(view.remainingLabel).toBe("$38.00");
    expect(view.capLabel).toBe("$50.00");
    expect(view.capDollars).toBe(50);
    expect(view.pctOfCap).toBe(24);
    expect(view.isOverCap).toBe(false);
    expect(view.configured).toBe(true);
  });

  it("always lists every metered catalog connector, even at $0 spend, with its disclosure", () => {
    const view = toConnectorSpendView([], 5000, false, true);
    const permit = view.rows.find((r) => r.key === "permit-data");
    expect(permit).toBeTruthy();
    expect(permit?.costCents).toBe(0);
    expect(permit?.disclosure).toBe("~$8.00 per 100 lookups");
    // free / byo_key connectors never appear here
    expect(view.rows.some((r) => r.key === "weather-signals")).toBe(false);
    expect(view.rows.some((r) => r.key === "gemini-research")).toBe(false);
  });

  it("flags over-cap so the UI can warn that metered runs are refused", () => {
    const events: ConnectorUsageEvent[] = [{ connectorKey: "permit-data", units: 1, costCents: 5200, occurredAt: "t" }];
    const view = toConnectorSpendView(events, 5000, false, true);
    expect(view.isOverCap).toBe(true);
    expect(view.remainingLabel).toBe("$0.00");
  });
});
