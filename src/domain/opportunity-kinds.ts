/**
 * The canonical vocabulary for opportunity `kind` and `subject_type`. Pure.
 *
 * These are not cosmetic labels — `kind` is part of the dedup key:
 *
 *   unique (org_id, kind, subject_type, subject_id) where status in
 *     ('pending','drafting','drafted')          -- opportunities_open_unique
 *
 * so a kind that drifts silently defeats the dedup and the same finding lands in
 * the inbox again under a new name. It really happened: the field was free text
 * and the propose_opportunity tool only *suggested* values in a description, so
 * Arc coined a fresh synonym on most days and the inbox accumulated pairs —
 * `dormant_account` + `account_expansion` for one company, `segment_gap` +
 * `persona_gap` for one persona, each pair the same insight, both left pending.
 *
 * The list below is the seven sources named in CLAUDE.md's Opportunity
 * Intelligence Inbox, plus three concepts Arc reached for repeatedly in
 * production that none of the seven covered. Adding a kind is fine — that is a
 * product decision. Accepting an unlisted one is not: it costs the dedup.
 */

/**
 * The seven from CLAUDE.md, the three earned in production, and the ones the
 * app's own deterministic detectors emit.
 *
 * That last group is not optional. This vocabulary is what Arc is *allowed to
 * say*, so anything the detectors can produce, Arc must be able to propose too —
 * otherwise the agent is barred from a category its own product already renders.
 * `next_iteration` is exactly that: detectNextIterationOpportunities emits it, the
 * inbox renders it as "Repeat a winner", and the first cut of this list left it
 * out — so Arc could no longer suggest repeating a winning campaign.
 */
export const OPPORTUNITY_KINDS = [
  "crm_inactivity",
  "new_lead_discovery",
  "weather_event",
  "competitor_signal",
  "approved_media",
  "performance_anomaly",
  "persona_segment_gap",
  // Observed repeatedly in prod scans with no home among the seven:
  "account_expansion", // grow an existing customer (expansion / lifecycle upsell)
  "partner_network", // referral-partner lane (plumbing/HVAC/insurance flywheel)
  "attribution_gap", // revenue that can't be learned from (unassigned persona, data holes)
  // Emitted by a detector in src/domain/opportunity-detection.ts:
  "next_iteration", // a campaign worth repeating — the inbox calls it "Repeat a winner"
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

/**
 * What an opportunity can be *about*. The last three are not CRM records: the
 * detectors use them as synthetic subjects (a weather alert, a competitor signal,
 * the campaign a next-iteration learned from), and the inbox keys its icon and
 * type label straight off them — `classify()` branches on "campaign",
 * "weather_event" and "competitor_signal" by name. Omitting them here made Arc
 * unable to name subjects the app already knows how to render.
 */
export const OPPORTUNITY_SUBJECT_TYPES = [
  "company",
  "contact",
  "lead",
  "persona",
  "competitor",
  "segment",
  "campaign", // the source campaign a next_iteration opportunity learned from
  "weather_event", // a weather alert row, not a CRM record
  "competitor_signal", // a competitor activity signal, not a CRM record
] as const;

export type OpportunitySubjectType = (typeof OPPORTUNITY_SUBJECT_TYPES)[number];

/**
 * Synonyms → canonical. Every entry is a value a real prod scan actually wrote
 * (or a stale hint the tool used to suggest), so this doubles as the bridge that
 * keeps a not-yet-redeployed runner's proposals landing on the right kind — the
 * app and the runner deploy separately, and they are briefly skewed on merge.
 */
const KIND_ALIASES: Readonly<Record<string, OpportunityKind>> = {
  // quiet / lapsed records
  dormant_account: "crm_inactivity",
  reactivation: "crm_inactivity",
  reengagement: "crm_inactivity",
  dormant: "crm_inactivity",
  // discovery
  new_lead: "new_lead_discovery",
  new_company_discovery: "new_lead_discovery",
  // weather
  storm_response: "weather_event",
  storm: "weather_event",
  hail_event: "weather_event",
  // competitors
  competitor_activity: "competitor_signal",
  competitor_ads: "competitor_signal",
  // persona / segment gaps
  persona_gap: "persona_segment_gap",
  segment_gap: "persona_segment_gap",
  // growing an existing account
  expansion: "account_expansion",
  lifecycle_upsell: "account_expansion",
  upsell: "account_expansion",
  // referral lane
  referral: "partner_network",
  partner_referral: "partner_network",
  // unattributed revenue
  data_quality_gap: "attribution_gap",
};

const KINDS = new Set<string>(OPPORTUNITY_KINDS);
const SUBJECT_TYPES = new Set<string>(OPPORTUNITY_SUBJECT_TYPES);

function slug(raw: string): string {
  // Tolerate "Persona Gap", "persona-gap", " PERSONA_GAP " — the shape varies more
  // than the meaning, and a casing difference must not fork the dedup key.
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Canonical kind, or null if it isn't one and isn't a known synonym. */
export function normalizeOpportunityKind(raw: string): OpportunityKind | null {
  const key = slug(raw);
  if (KINDS.has(key)) return key as OpportunityKind;
  return KIND_ALIASES[key] ?? null;
}

/** Canonical subject type, or null. */
export function normalizeOpportunitySubjectType(raw: string): OpportunitySubjectType | null {
  const key = slug(raw);
  return SUBJECT_TYPES.has(key) ? (key as OpportunitySubjectType) : null;
}
