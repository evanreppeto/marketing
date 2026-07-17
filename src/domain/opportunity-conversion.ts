/**
 * Pure aggregation of the opportunity → campaign → approval → outcome funnel.
 *
 * Answers "which opportunity kinds actually convert?" — the learning half of the
 * detect → draft → approve → measure loop. Deterministic and I/O-free so it's
 * unit-testable; the read model (src/lib/performance/opportunity-conversion.ts)
 * gathers the facts and calls in here. Measurement only — nothing here acts.
 */

/** One opportunity's position in the funnel, already resolved from the DB joins. */
export type OpportunityConversionFact = {
  kind: string;
  /** Persona enum key from the opportunity evidence, or "" when unknown. */
  persona: string;
  urgency: "low" | "medium" | "high";
  /** A campaign was drafted from this opportunity. */
  drafted: boolean;
  /** That campaign reached approved. Implies drafted. */
  approved: boolean;
  /** That campaign produced a booked outcome (job / won revenue). Implies approved. */
  booked: boolean;
};

export type ConversionStage = { surfaced: number; drafted: number; approved: number; booked: number };

/** Stage-to-stage rates + the headline booked-of-surfaced. `null` when the
 *  denominator is 0 (honest "—" instead of a fabricated 0%). */
export type ConversionRates = {
  draftRate: number | null; // drafted / surfaced
  approveRate: number | null; // approved / drafted
  bookRate: number | null; // booked / approved
  bookedOfSurfaced: number | null; // booked / surfaced
};

export type ConversionFunnel = ConversionStage & { rates: ConversionRates };

export type ConversionBreakdownRow = {
  key: string;
  label: string;
  funnel: ConversionFunnel;
  /** One-line "what converts" hint, or null when there's not enough data. */
  hint: string | null;
};

export type OpportunityConversion = {
  overall: ConversionFunnel;
  byKind: ConversionBreakdownRow[];
  byPersona: ConversionBreakdownRow[];
  byUrgency: ConversionBreakdownRow[];
};

const KIND_LABELS: Record<string, string> = {
  cold_lead: "Cold lead",
  weather_event: "Weather event",
  competitor_signal: "Competitor signal",
  persona_gap: "Persona gap",
  media_approved: "New media",
  performance_anomaly: "Performance anomaly",
  news_signal: "News mention",
};

function titleize(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? (titleize(kind) || "Other");
}

function personaLabel(persona: string): string {
  const s = persona.replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unspecified persona";
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function funnelOf(facts: OpportunityConversionFact[]): ConversionFunnel {
  const surfaced = facts.length;
  const drafted = facts.filter((f) => f.drafted).length;
  const approved = facts.filter((f) => f.approved).length;
  const booked = facts.filter((f) => f.booked).length;
  return {
    surfaced,
    drafted,
    approved,
    booked,
    rates: {
      draftRate: rate(drafted, surfaced),
      approveRate: rate(approved, drafted),
      bookRate: rate(booked, approved),
      bookedOfSurfaced: rate(booked, surfaced),
    },
  };
}

/** Format a rate as a whole-percent string, or "—" when null. */
export function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * A short, honest "what converts" hint for a breakdown row. Needs enough
 * surfaced volume AND a resolved booked-rate; otherwise null so the UI shows an
 * honest "not enough data yet" rather than a noisy 1-of-1 = 100%.
 */
function buildHint(label: string, funnel: ConversionFunnel): string | null {
  if (funnel.surfaced < 3) return null;
  if (funnel.rates.bookedOfSurfaced !== null && funnel.booked > 0) {
    return `${label} → ${formatRate(funnel.rates.bookedOfSurfaced)} booked (${funnel.booked}/${funnel.surfaced})`;
  }
  if (funnel.rates.draftRate !== null) {
    return `${label} → ${formatRate(funnel.rates.draftRate)} drafted, none booked yet (${funnel.surfaced} surfaced)`;
  }
  return null;
}

function breakdown(
  facts: OpportunityConversionFact[],
  keyOf: (fact: OpportunityConversionFact) => string,
  labelOf: (key: string) => string,
): ConversionBreakdownRow[] {
  const groups = new Map<string, OpportunityConversionFact[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    const bucket = groups.get(key);
    if (bucket) bucket.push(fact);
    else groups.set(key, [fact]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const label = labelOf(key);
      const funnel = funnelOf(group);
      return { key, label, funnel, hint: buildHint(label, funnel) };
    })
    // Most surfaced first; break ties by booked so the "best" kind leads.
    .sort((a, b) => b.funnel.surfaced - a.funnel.surfaced || b.funnel.booked - a.funnel.booked);
}

/** Roll opportunity facts into overall + per-kind / per-persona / per-urgency funnels. */
export function buildOpportunityConversion(facts: OpportunityConversionFact[]): OpportunityConversion {
  return {
    overall: funnelOf(facts),
    byKind: breakdown(facts, (f) => f.kind || "other", kindLabel),
    byPersona: breakdown(facts, (f) => f.persona || "unknown", (k) => (k === "unknown" ? "Unspecified persona" : personaLabel(k))),
    byUrgency: breakdown(facts, (f) => f.urgency, titleize),
  };
}
