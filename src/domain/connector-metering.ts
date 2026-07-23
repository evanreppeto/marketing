/**
 * Connector cost governance — pure, deterministic, no I/O (BSR-372).
 *
 * The HYBRID cost model (BSR-363) tags every connector with a `costTier`:
 *   • `free`    — costs nothing (e.g. NWS weather).       → bypasses metering
 *   • `byo_key` — the workspace pays its own provider.     → bypasses metering
 *   • `metered` — a third-party data vendor we bill for.   → GOVERNED HERE
 *
 * This module owns the *math*: what a metered call costs, whether it would breach
 * the workspace spend cap, and how to roll usage up for the Usage screen. The
 * cap is the human gate — a call that would exceed it is refused (no spend) until
 * an operator raises the cap (their explicit "approve $X more" decision). All the
 * side-effecting parts — writing usage rows, reading the cap/spend — live in
 * `src/lib/connectors/metering.ts`. Prices are ESTIMATES, versioned so historical
 * rows stay correct after a price change. All figures are integer cents.
 */

import { bypassesMetering, type ConnectorCostTier } from "./connectors";

/** Stamped onto each usage row so a later price change can't rewrite history. */
export const METERING_PRICING_VERSION = "2026-07-10";

/**
 * Default per-workspace monthly spend cap for metered connectors: $50. Deliberately
 * conservative — metered data lookups add up fast, and overspend needs a human, so
 * a low default fails safe. Operators raise it in Settings → Usage.
 */
export const DEFAULT_SPEND_CAP_CENTS = 5000;

/** Pricing for one metered connector. `centsPerUnit` is the billable rate. */
export type ConnectorCostRate = {
  /** Estimated cost of a single billable unit, in cents. */
  centsPerUnit: number;
  /** What one unit is, singular (e.g. "lookup", "enrichment", "record"). */
  unitLabel: string;
  /** The batch size the disclosure string quotes a price for (e.g. 100). */
  disclosureUnits: number;
};

/**
 * Per-connector pricing for the metered tier — the single source of truth, kept
 * here beside the cost math (mirrors ai-usage.ts MODEL_PRICING). A connector only
 * needs an entry when its `costTier` is `metered`; free/byo_key connectors never
 * reach this table. Keyed by CONNECTOR_REGISTRY `key`.
 */
export const CONNECTOR_COST_RATES: Record<string, ConnectorCostRate> = {
  // Paid building-permit / property data vendor (stub today; real vendor swaps in
  // via BSR-368 enrichment). One paid lookup per watched municipality per scan.
  "permit-data": { centsPerUnit: 8, unitLabel: "lookup", disclosureUnits: 100 },
  // Firmographic enrichment vendor (BSR-368). One paid lookup per company enriched
  // during a CRM import; each call is guarded by the spend cap before it fires.
  "lead-enrichment": { centsPerUnit: 2, unitLabel: "enrichment", disclosureUnits: 100 },
  // Platform-credits media generation (dual-mode entry: metered ONLY when the
  // call runs on the platform key; a workspace's own key bypasses). Unit = one
  // image; video passes ~10 units per clip (see the generation call sites).
  "gemini-media": { centsPerUnit: 6, unitLabel: "image", disclosureUnits: 10 },
};

/** The pricing for a connector, or null when it is not a priced/metered connector. */
export function getConnectorCostRate(connectorKey: string): ConnectorCostRate | null {
  return CONNECTOR_COST_RATES[connectorKey] ?? null;
}

/**
 * Estimated cost (cents) of `units` billable calls on a metered connector. Unknown
 * or unpriced connector → 0 (nothing to bill). Units are clamped to >= 0.
 */
export function estimateConnectorCostCents(connectorKey: string, units: number): number {
  const rate = getConnectorCostRate(connectorKey);
  if (!rate) return 0;
  const safeUnits = Math.max(0, Math.floor(units));
  return rate.centsPerUnit * safeUnits;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format integer cents as "$1.23". */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/**
 * Up-front cost disclosure for a metered connector, e.g. "~$8.00 per 100 lookups".
 * Returns null for connectors that aren't metered/priced (nothing to disclose).
 * Shown on the enable dialog and before any spending run — no surprise charges.
 */
export function describeConnectorCost(connectorKey: string): string | null {
  const rate = getConnectorCostRate(connectorKey);
  if (!rate) return null;
  const batchCost = rate.centsPerUnit * rate.disclosureUnits;
  const unit = rate.disclosureUnits === 1 ? rate.unitLabel : `${rate.disclosureUnits} ${rate.unitLabel}s`;
  return `~${formatCents(batchCost)} per ${unit}`;
}

/** The outcome of the pure "would this call fit under the cap?" check. */
export type SpendDecision = {
  /** True when the projected total stays at or under the cap. */
  allow: boolean;
  /** Cents already spent this period. */
  spentCents: number;
  /** The cap in cents. */
  capCents: number;
  /** Estimated cost of the call being weighed. */
  estimatedCostCents: number;
  /** spent + estimated — what the total would become if the call ran. */
  projectedCents: number;
  /** Cap minus current spend, floored at 0 — budget available right now. */
  remainingCents: number;
  /** How far projected exceeds the cap (0 when it fits). */
  overByCents: number;
};

/**
 * The core guard: given what's been spent, the cap, and the next call's estimated
 * cost, decide whether it may run. Allowed only when the projected total is at or
 * under the cap — a call that would tip over is refused (caller writes no usage).
 * A cap of 0 (or negative) means "no metered spend allowed": any priced call is
 * refused. Pure — the caller supplies spent/cap from I/O.
 */
export function computeSpendDecision(input: {
  spentCents: number;
  capCents: number;
  estimatedCostCents: number;
}): SpendDecision {
  const spentCents = Math.max(0, Math.round(input.spentCents));
  const capCents = Math.max(0, Math.round(input.capCents));
  const estimatedCostCents = Math.max(0, Math.round(input.estimatedCostCents));
  const projectedCents = spentCents + estimatedCostCents;
  const remainingCents = Math.max(0, capCents - spentCents);
  const overByCents = Math.max(0, projectedCents - capCents);
  return {
    allow: projectedCents <= capCents,
    spentCents,
    capCents,
    estimatedCostCents,
    projectedCents,
    remainingCents,
    overByCents,
  };
}

/** Cap minus spend, floored at 0. */
export function remainingBudgetCents(spentCents: number, capCents: number): number {
  return Math.max(0, Math.round(capCents) - Math.round(spentCents));
}

/** A recorded (or candidate) metered usage event, in the pure rollup shape. */
export type ConnectorUsageEvent = {
  connectorKey: string;
  units: number;
  costCents: number;
  occurredAt: string; // ISO
};

/** Per-connector spend rollup for the Usage screen. */
export type ConnectorSpendRow = {
  connectorKey: string;
  costCents: number;
  units: number;
  count: number;
};

export type ConnectorSpendSummary = {
  totalCostCents: number;
  totalUnits: number;
  eventCount: number;
  capCents: number;
  remainingCents: number;
  /** Percent of cap, rounded; 0 when no cap is set. */
  pctOfCap: number;
  /** True at or above 80% of the cap. */
  isNearCap: boolean;
  /** True once spend has reached/exceeded the cap — further calls are refused. */
  isOverCap: boolean;
  byConnector: ConnectorSpendRow[];
};

/**
 * Roll metered usage events up into the per-connector + headline numbers the
 * Settings → Usage "Connectors" panel renders. Pure — no I/O; the caller loads
 * the events for the period and passes the cap.
 */
export function summarizeConnectorSpend(events: ConnectorUsageEvent[], capCents: number): ConnectorSpendSummary {
  const cap = Math.max(0, Math.round(capCents));
  const byKey = new Map<string, ConnectorSpendRow>();
  let totalCostCents = 0;
  let totalUnits = 0;

  for (const e of events) {
    totalCostCents += e.costCents;
    totalUnits += e.units;
    const row = byKey.get(e.connectorKey) ?? { connectorKey: e.connectorKey, costCents: 0, units: 0, count: 0 };
    row.costCents += e.costCents;
    row.units += e.units;
    row.count += 1;
    byKey.set(e.connectorKey, row);
  }

  const pctOfCap = cap > 0 ? Math.round((totalCostCents / cap) * 100) : 0;
  return {
    totalCostCents,
    totalUnits,
    eventCount: events.length,
    capCents: cap,
    remainingCents: Math.max(0, cap - totalCostCents),
    pctOfCap,
    isNearCap: cap > 0 && pctOfCap >= 80,
    isOverCap: cap > 0 && totalCostCents >= cap,
    byConnector: [...byKey.values()].sort((a, b) => b.costCents - a.costCents),
  };
}

/**
 * Guard mirror of the lib layer for callers that only have the tier: metered
 * connectors are governed; everything else bypasses. Re-exported for symmetry so
 * a caller can branch without importing two modules.
 */
export function isMeteredTier(costTier: ConnectorCostTier): boolean {
  return !bypassesMetering(costTier);
}
