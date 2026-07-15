/**
 * Customer journey model — pure, deterministic, total (never throws).
 *
 * This is the company-agnostic spine underneath campaign attribution. Where
 * `attribution.ts` collapses a lead to a single winning campaign (last-touch),
 * the journey model keeps the *ordered* sequence of touches per identity and
 * infers where that identity sits on a generic six-stage ladder that any
 * business maps onto:
 *
 *   Reached → Engaged → Identified → Nurtured → Converted → Retained
 *
 *   restoration:  sees ad → clicks CTA → lead form → quote/booked → job paid → referral
 *   SaaS:         sees ad → visits site → signs up → activates → subscribes → expands
 *   e-commerce:   sees ad → views item → gives email → cart → purchase → buys again
 *
 * Nothing here does I/O or knows about Supabase. The read-model
 * (`src/lib/journey/read-model.ts`) normalizes real rows (engagement_events,
 * leads, outcomes, jobs, contacts) into `JourneyTouch`es and hands them here.
 * All time is passed in explicitly (`nowMs`) so the logic stays deterministic
 * and unit-testable, exactly like `pickLastTouchAttribution`.
 */

// ---------------------------------------------------------------------------
// Stage ladder
// ---------------------------------------------------------------------------

export const JOURNEY_STAGE_KEYS = [
  "reached",
  "engaged",
  "identified",
  "nurtured",
  "converted",
  "retained",
] as const;

export type JourneyStageKey = (typeof JOURNEY_STAGE_KEYS)[number];

export type JourneyStageMeta = {
  key: JourneyStageKey;
  /** 0-based rung; higher = further along. */
  order: number;
  label: string;
  /** One-line, company-agnostic meaning of the stage. */
  meaning: string;
  /** True for the two anonymous / pre-identification stages (the net-new P1 capture surface). */
  anonymous: boolean;
};

export const JOURNEY_STAGES: readonly JourneyStageMeta[] = [
  { key: "reached", order: 0, label: "Reached", meaning: "We put creative in front of them (impression / send).", anonymous: true },
  { key: "engaged", order: 1, label: "Engaged", meaning: "They interacted — clicked, opened, visited, replied.", anonymous: true },
  { key: "identified", order: 2, label: "Identified", meaning: "They became a known contact (form, signup, lead).", anonymous: false },
  { key: "nurtured", order: 3, label: "Nurtured", meaning: "Active consideration — worked, quoted, booked.", anonymous: false },
  { key: "converted", order: 4, label: "Converted", meaning: "The goal event — paid, purchased, subscribed, downloaded.", anonymous: false },
  { key: "retained", order: 5, label: "Retained", meaning: "Repeat, expansion, or referral after the first conversion.", anonymous: false },
];

const STAGE_ORDER: Record<JourneyStageKey, number> = {
  reached: 0,
  engaged: 1,
  identified: 2,
  nurtured: 3,
  converted: 4,
  retained: 5,
};

export function stageOrder(key: JourneyStageKey): number {
  return STAGE_ORDER[key];
}

// ---------------------------------------------------------------------------
// Touch vocabulary
// ---------------------------------------------------------------------------

/** Direction of a touch relative to the business. */
export type TouchDirection = "outbound" | "inbound" | "system";

/**
 * Open touch-kind vocabulary. Read-models may pass kinds outside this list —
 * `classifyTouchStage` falls back on `direction` + `isConversion`, so an
 * unknown kind never breaks assembly. These constants exist so call sites and
 * tests reference names instead of magic strings.
 */
export const TOUCH_KINDS = {
  AdImpression: "ad_impression",
  EmailSent: "email_sent",
  SmsSent: "sms_sent",
  AdClick: "ad_click",
  EmailOpen: "email_open",
  EmailClick: "email_click",
  SiteVisit: "site_visit",
  ReplyReceived: "reply_received",
  InboundCall: "inbound_call",
  FormSubmit: "form_submit",
  LeadCreated: "lead_created",
  Signup: "signup",
  LeadRouted: "lead_routed",
  LeadContacted: "lead_contacted",
  QuoteSent: "quote_sent",
  Booking: "booking",
  JobOpened: "job_opened",
  JobCompleted: "job_completed",
  Purchase: "purchase",
  Payment: "payment",
  Subscribe: "subscribe",
  Download: "download",
  OutcomeWon: "outcome_won",
  Referral: "referral",
} as const;

/** A single normalized touch on one identity's timeline. */
export type JourneyTouch = {
  id: string;
  /** ISO-8601 with offset. Touches with an unparseable time sort last and are ignored for windows. */
  occurredAt: string;
  kind: string;
  direction: TouchDirection;
  channel?: string | null;
  campaignId?: string | null;
  assetId?: string | null;
  summary?: string | null;
  /**
   * True when this touch *is* a conversion (a paid outcome, purchase, signup-to-paid…).
   * The read-model sets this; it's what gates the `converted`/`retained` stages so a
   * business without a "purchase" kind can still mark conversions explicitly.
   */
  isConversion?: boolean;
  /** Realized value of a conversion touch, in cents. Only meaningful when isConversion. */
  valueCents?: number | null;
};

// Kinds that, on their own, imply a given stage. Anything not listed falls back
// to direction-based inference in `classifyTouchStage`.
const KIND_STAGE: Record<string, JourneyStageKey> = {
  ad_impression: "reached",
  email_sent: "reached",
  sms_sent: "reached",
  ad_click: "engaged",
  email_open: "engaged",
  email_click: "engaged",
  site_visit: "engaged",
  reply_received: "engaged",
  inbound_call: "engaged",
  form_submit: "identified",
  lead_created: "identified",
  signup: "identified",
  lead_routed: "nurtured",
  lead_contacted: "nurtured",
  quote_sent: "nurtured",
  booking: "nurtured",
  job_opened: "nurtured",
  purchase: "converted",
  payment: "converted",
  subscribe: "converted",
  download: "converted",
  outcome_won: "converted",
  job_completed: "converted",
  referral: "retained",
};

/**
 * The stage a single touch represents. A conversion touch is always at least
 * `converted`. Known kinds map directly; unknown kinds infer from direction
 * (outbound → reached, inbound → engaged, system → identified). Total.
 */
export function classifyTouchStage(touch: Pick<JourneyTouch, "kind" | "direction" | "isConversion">): JourneyStageKey {
  if (touch.isConversion) return "converted";
  const mapped = KIND_STAGE[touch.kind];
  if (mapped) return mapped;
  if (touch.direction === "outbound") return "reached";
  if (touch.direction === "inbound") return "engaged";
  return "identified";
}

// ---------------------------------------------------------------------------
// Journey assembly
// ---------------------------------------------------------------------------

export type JourneyAttributionRef = {
  campaignId: string | null;
  channel: string | null;
  assetId: string | null;
  occurredAt: string | null;
};

export type JourneyIdentity = {
  id: string;
  label: string;
  /**
   * How the anonymous → known link was made. `known` = arrived already
   * identified (a CRM contact); `stitched` = pre-identification touches were
   * merged onto the contact; `anonymous` = no known contact yet.
   */
  resolution: "known" | "stitched" | "anonymous";
};

export type Journey = {
  identity: JourneyIdentity;
  /** Ordered oldest → newest. Touches with an unparseable time are appended last, stable. */
  timeline: JourneyTouch[];
  currentStage: JourneyStageKey;
  /** Distinct stages actually reached, in ladder order. */
  stagesReached: JourneyStageKey[];
  firstTouchAt: string | null;
  lastTouchAt: string | null;
  touchCount: number;
  /** First campaign/channel touch (first-touch attribution). */
  firstTouch: JourneyAttributionRef | null;
  /** Most recent campaign/channel touch (last-touch attribution — matches attribution.ts). */
  lastTouch: JourneyAttributionRef | null;
  converted: boolean;
  conversionAt: string | null;
  conversionValueCents: number;
  /** Whole days from first touch to conversion; null if not converted or no first touch. */
  daysToConvert: number | null;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function sortTouches(touches: JourneyTouch[]): JourneyTouch[] {
  // Stable sort by time; untimed touches sort to the end preserving input order.
  return touches
    .map((t, i) => ({ t, i, ms: parseMs(t.occurredAt) }))
    .sort((a, b) => {
      if (a.ms === null && b.ms === null) return a.i - b.i;
      if (a.ms === null) return 1;
      if (b.ms === null) return -1;
      if (a.ms !== b.ms) return a.ms - b.ms;
      return a.i - b.i;
    })
    .map((x) => x.t);
}

function toRef(touch: JourneyTouch): JourneyAttributionRef {
  return { campaignId: touch.campaignId ?? null, channel: touch.channel ?? null, assetId: touch.assetId ?? null, occurredAt: touch.occurredAt ?? null };
}

/** A touch carries attribution when it names a campaign or a channel. */
function isAttributable(touch: JourneyTouch): boolean {
  return Boolean(touch.campaignId) || Boolean(touch.channel);
}

/**
 * Assemble one identity's touches into an ordered journey with an inferred
 * current stage, first/last-touch attribution, and conversion summary. Pure +
 * total: an empty timeline yields a `reached`-floor journey with nulls, never
 * an exception.
 */
export function assembleJourney(identity: JourneyIdentity, touches: JourneyTouch[]): Journey {
  const timeline = sortTouches(touches);

  const stageSeen = new Set<JourneyStageKey>();
  let maxOrder = -1;
  let converted = false;
  let conversionAt: string | null = null;
  let conversionValueCents = 0;
  let convertedOnce = false;

  for (const touch of timeline) {
    const stage = classifyTouchStage(touch);
    stageSeen.add(stage);
    if (STAGE_ORDER[stage] > maxOrder) maxOrder = STAGE_ORDER[stage];
    if (touch.isConversion) {
      // A conversion after an earlier conversion is retention/expansion.
      if (convertedOnce) stageSeen.add("retained");
      convertedOnce = true;
      converted = true;
      conversionAt = touch.occurredAt ?? conversionAt;
      conversionValueCents += Math.max(0, touch.valueCents ?? 0);
    }
    if (touch.kind === TOUCH_KINDS.Referral) stageSeen.add("retained");
  }

  // Retention only counts once a conversion has actually happened.
  if (stageSeen.has("retained") && !converted) stageSeen.delete("retained");

  const stagesReached = JOURNEY_STAGE_KEYS.filter((k) => stageSeen.has(k));
  const highest = stagesReached.length ? stagesReached[stagesReached.length - 1] : "reached";
  const currentStage: JourneyStageKey = stagesReached.length ? highest : "reached";

  const timedFirst = timeline.find((t) => parseMs(t.occurredAt) !== null) ?? null;
  const timedLast = [...timeline].reverse().find((t) => parseMs(t.occurredAt) !== null) ?? null;

  const attributable = timeline.filter(isAttributable);
  const firstAttr = attributable.find((t) => parseMs(t.occurredAt) !== null) ?? attributable[0] ?? null;
  const lastAttr = [...attributable].reverse().find((t) => parseMs(t.occurredAt) !== null) ?? attributable[attributable.length - 1] ?? null;

  const firstMs = parseMs(timedFirst?.occurredAt);
  const convMs = parseMs(conversionAt);
  const daysToConvert =
    converted && firstMs !== null && convMs !== null && convMs >= firstMs ? Math.floor((convMs - firstMs) / 86_400_000) : null;

  return {
    identity,
    timeline,
    currentStage,
    stagesReached,
    firstTouchAt: timedFirst?.occurredAt ?? null,
    lastTouchAt: timedLast?.occurredAt ?? null,
    touchCount: timeline.length,
    firstTouch: firstAttr ? toRef(firstAttr) : null,
    lastTouch: lastAttr ? toRef(lastAttr) : null,
    converted,
    conversionAt,
    conversionValueCents,
    daysToConvert,
  };
}

// ---------------------------------------------------------------------------
// Multi-touch attribution lenses
// ---------------------------------------------------------------------------

export type AttributionModel = "first_touch" | "last_touch" | "linear" | "time_decay" | "position_based";

export const ATTRIBUTION_MODELS: { key: AttributionModel; label: string; blurb: string }[] = [
  { key: "last_touch", label: "Last touch", blurb: "All credit to the final campaign before conversion." },
  { key: "first_touch", label: "First touch", blurb: "All credit to the campaign that first reached them." },
  { key: "linear", label: "Linear", blurb: "Credit split evenly across every touch." },
  { key: "time_decay", label: "Time decay", blurb: "More credit to touches closer to conversion." },
  { key: "position_based", label: "Position 40/20/40", blurb: "40% first, 40% last, 20% to the middle." },
];

export type CreditRow = {
  /** Grouping key — a campaignId when present, else `channel:<name>`, else `unattributed`. */
  key: string;
  campaignId: string | null;
  channel: string | null;
  /** Share of the conversion in [0,1]. Across a journey, credits sum to 1 (when any attributable touch exists). */
  weight: number;
  /** Weighted value in cents when a conversion value is supplied. */
  valueCents: number;
};

const TIME_DECAY_HALF_LIFE_MS = 7 * 86_400_000; // credit halves every 7 days back from conversion

function creditKey(touch: JourneyAttributionRef | JourneyTouch): string {
  if (touch.campaignId) return touch.campaignId;
  if (touch.channel) return `channel:${touch.channel}`;
  return "unattributed";
}

/**
 * Distribute conversion credit across a journey's attributable touches under a
 * chosen model. Pure + total. Returns [] when the journey has no attributable
 * touch. Weights sum to 1 (± float error); `valueCents` distributes the
 * journey's realized conversion value the same way.
 *
 * `nowMs` anchors `time_decay` when the journey has no conversion timestamp
 * (falls back to the last touch, then to nowMs).
 */
export function computeAttribution(journey: Journey, model: AttributionModel, nowMs: number): CreditRow[] {
  const touches = journey.timeline.filter(isAttributable);
  if (touches.length === 0) return [];

  const anchorMs = parseMs(journey.conversionAt) ?? parseMs(journey.lastTouchAt) ?? nowMs;
  const totalValue = journey.conversionValueCents;

  const rawWeights: number[] = touches.map((touch, i) => {
    switch (model) {
      case "first_touch":
        return i === 0 ? 1 : 0;
      case "last_touch":
        return i === touches.length - 1 ? 1 : 0;
      case "linear":
        return 1;
      case "position_based": {
        if (touches.length === 1) return 1;
        if (touches.length === 2) return 0.5;
        if (i === 0 || i === touches.length - 1) return 0.4;
        return 0.2 / (touches.length - 2);
      }
      case "time_decay": {
        const ms = parseMs(touch.occurredAt);
        if (ms === null) return 0.0001; // untimed touch still gets a sliver
        const age = Math.max(0, anchorMs - ms);
        return Math.pow(0.5, age / TIME_DECAY_HALF_LIFE_MS);
      }
      default:
        return 1;
    }
  });

  const sum = rawWeights.reduce((a, b) => a + b, 0);
  const norm = sum > 0 ? sum : touches.length; // degenerate (e.g. all-zero) → linear fallback
  const divisor = sum > 0 ? sum : norm;

  const byKey = new Map<string, CreditRow>();
  touches.forEach((touch, i) => {
    const weight = (sum > 0 ? rawWeights[i] : 1) / divisor;
    const key = creditKey(touch);
    const existing = byKey.get(key);
    if (existing) {
      existing.weight += weight;
      existing.valueCents += weight * totalValue;
    } else {
      byKey.set(key, {
        key,
        campaignId: touch.campaignId ?? null,
        channel: touch.channel ?? null,
        weight,
        valueCents: weight * totalValue,
      });
    }
  });

  return [...byKey.values()]
    // Drop touches that earned no credit under this model (e.g. every touch but
    // the last under last_touch) so the result reads as "who actually got credit".
    .filter((row) => row.weight > 1e-9)
    .map((row) => ({ ...row, valueCents: Math.round(row.valueCents) }))
    .sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------
// Cross-journey aggregation (funnel)
// ---------------------------------------------------------------------------

export type FunnelStage = {
  key: JourneyStageKey;
  label: string;
  /** Journeys that reached at least this stage. Monotonically non-increasing down the ladder. */
  count: number;
  /** Conversion from the top of the funnel, 0..1. */
  rateFromTop: number;
  /** Conversion from the previous stage, 0..1. */
  rateFromPrev: number;
};

/**
 * Build a cumulative funnel across many journeys: how many reached ≥ each
 * stage. Pure + total. `rateFromTop`/`rateFromPrev` are 0 when the reference
 * count is 0.
 */
export function summarizeFunnel(journeys: Journey[]): FunnelStage[] {
  const reachedAtLeast: Record<JourneyStageKey, number> = {
    reached: 0,
    engaged: 0,
    identified: 0,
    nurtured: 0,
    converted: 0,
    retained: 0,
  };

  for (const journey of journeys) {
    const top = Math.max(0, stageOrder(journey.currentStage));
    for (const key of JOURNEY_STAGE_KEYS) {
      if (stageOrder(key) <= top) reachedAtLeast[key] += 1;
    }
  }

  const topCount = reachedAtLeast.reached;
  let prev = topCount;
  return JOURNEY_STAGES.map((meta) => {
    const count = reachedAtLeast[meta.key];
    const row: FunnelStage = {
      key: meta.key,
      label: meta.label,
      count,
      rateFromTop: topCount > 0 ? count / topCount : 0,
      rateFromPrev: prev > 0 ? count / prev : 0,
    };
    prev = count;
    return row;
  });
}
