/**
 * Pure detection of "opportunities" from CRM signals. No I/O. v1 source:
 * cold leads — open, unworked leads that have gone quiet — surfaced for human
 * review (never auto-contacted). Deterministic so it stays unit-testable.
 */

export type ColdLeadInput = {
  id: string;
  /** Human label (contact/company name or lead id) for the card. */
  label: string;
  persona: string;
  leadScore: number; // 0–100
  status: string; // lead_status value
  /** ISO timestamp of the lead's most recent activity (latest event, else received_at). */
  lastActivityAt: string;
  hasActiveCampaign: boolean;
};

export type DetectionConfig = { now: string; coldDays?: number };

export type OpportunityCandidate = {
  kind: string;            // was "crm_inactivity"
  subjectType: string;     // was "lead"
  subjectId: string;
  title: string;
  summary: string;
  confidence: number; // 0–100
  urgency: "low" | "medium" | "high";
  evidence: Record<string, unknown>;  // was the cold-lead-specific object
  recommendedAction: string;
  recommendedCampaignType: string;
};

const DEFAULT_COLD_DAYS = 30;
const TERMINAL_STATUSES = new Set(["converted", "lost", "archived"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Cold-lead opportunities: open leads with no live campaign, quiet >= coldDays. */
export function detectColdLeadOpportunities(leads: ColdLeadInput[], config: DetectionConfig): OpportunityCandidate[] {
  const coldDays = config.coldDays ?? DEFAULT_COLD_DAYS;
  const out: OpportunityCandidate[] = [];
  for (const lead of leads) {
    if (TERMINAL_STATUSES.has(lead.status)) continue;
    if (lead.hasActiveCampaign) continue;
    const daysCold = daysBetween(lead.lastActivityAt, config.now);
    if (daysCold < coldDays) continue;

    // Confidence: lead quality plus a cold bonus (longer quiet = more worth re-engaging).
    const confidence = clamp(Math.round(lead.leadScore + Math.min(20, daysCold / 7)), 0, 100);
    const urgency: OpportunityCandidate["urgency"] =
      lead.leadScore >= 75 && daysCold >= 45 ? "high" : lead.leadScore >= 50 || daysCold >= 60 ? "medium" : "low";

    out.push({
      kind: "crm_inactivity",
      subjectType: "lead",
      subjectId: lead.id,
      title: `${lead.label} — quiet ${daysCold} days`,
      summary: `Open lead (score ${lead.leadScore}) with no live campaign and no activity in ${daysCold} days.`,
      confidence,
      urgency,
      evidence: { daysCold, leadScore: lead.leadScore, persona: lead.persona, lastActivityAt: lead.lastActivityAt },
      recommendedAction: "Re-engage with a persona-tailored campaign",
      recommendedCampaignType: "re_engagement",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weather-event opportunities
// ---------------------------------------------------------------------------
// Storm/flood/hail alerts in a workspace's coverage area drive same-week
// emergency-restoration demand. Surfaced (never auto-contacted) as a geo-targeted
// storm-response recommendation. Deterministic so it stays unit-testable. The
// live alert feed is injected at the I/O layer (see WeatherEventSource in
// src/lib/opportunities/detector.ts) — this module only scores normalized input.

/** Normalized alert severity, ordered advisory < watch < warning < emergency. */
export type WeatherSeverity = "advisory" | "watch" | "warning" | "emergency";

export type WeatherEventInput = {
  id: string;
  /** Alert/event type label, e.g. "Flash Flood Warning", "Severe Thunderstorm". */
  eventType: string;
  /** Human coverage-area label for the card, e.g. "Riverside / Brookfield". */
  area: string;
  severity: WeatherSeverity;
  /** ISO effective window; an event whose endsAt is already past is skipped. */
  startsAt?: string;
  endsAt?: string;
  /** Coverage ZIPs, surfaced on the card and used for the geo-target note. */
  zipCodes?: string[];
  /** Evidence links (NWS alert page, radar, water.noaa.gov, …). */
  sourceUrls?: string[];
};

export type WeatherDetectionConfig = { now: string };

/** BSR's emergency-response persona — the audience a storm-response flight targets. */
export const WEATHER_EVENT_PERSONA = "persona_homeowner_emergency";

const WEATHER_SEVERITY_RANK: Record<WeatherSeverity, number> = {
  advisory: 1,
  watch: 2,
  warning: 3,
  emergency: 4,
};
const WEATHER_SEVERITY_CONFIDENCE: Record<WeatherSeverity, number> = {
  advisory: 55,
  watch: 72,
  warning: 88,
  emergency: 95,
};

function weatherUrgency(severity: WeatherSeverity): OpportunityCandidate["urgency"] {
  const rank = WEATHER_SEVERITY_RANK[severity];
  return rank >= 3 ? "high" : rank >= 2 ? "medium" : "low";
}

function cleanUrls(urls: string[] | undefined): string[] {
  return (urls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
}

/**
 * Weather-event opportunities: active storm/flood/hail alerts in the coverage
 * area. Severity drives both urgency (warning+ = high) and confidence. Expired
 * alerts (endsAt in the past) are skipped so the inbox only shows live weather.
 */
export function detectWeatherEventOpportunities(
  events: WeatherEventInput[],
  config: WeatherDetectionConfig,
): OpportunityCandidate[] {
  const now = Date.parse(config.now);
  const out: OpportunityCandidate[] = [];
  for (const ev of events) {
    if (!ev.id) continue;
    if (ev.endsAt) {
      const ends = Date.parse(ev.endsAt);
      if (!Number.isNaN(ends) && !Number.isNaN(now) && ends < now) continue; // expired alert
    }
    const severity: WeatherSeverity = WEATHER_SEVERITY_RANK[ev.severity] ? ev.severity : "advisory";
    const eventType = ev.eventType?.trim() || "Weather alert";
    const area = ev.area?.trim() || "the coverage area";
    const zips = (ev.zipCodes ?? []).filter((z) => typeof z === "string" && z.trim().length > 0);

    out.push({
      kind: "weather_event",
      subjectType: "weather_event",
      subjectId: ev.id,
      title: `${eventType} — ${area}`,
      summary:
        `${eventType} in effect for ${area}. Storm-response demand typically spikes in the affected area within days; ` +
        `a geo-targeted campaign puts BSR's emergency response in front of homeowners before competitors reach them.`,
      confidence: WEATHER_SEVERITY_CONFIDENCE[severity],
      urgency: weatherUrgency(severity),
      evidence: {
        persona: WEATHER_EVENT_PERSONA,
        eventType,
        area,
        severity,
        ...(zips.length ? { zipCodes: zips } : {}),
        ...(ev.startsAt ? { startsAt: ev.startsAt } : {}),
        ...(ev.endsAt ? { endsAt: ev.endsAt } : {}),
        evidence_urls: cleanUrls(ev.sourceUrls),
      },
      recommendedAction: `Launch a geo-targeted storm-response campaign to ${area} homeowners`,
      recommendedCampaignType: "storm_response",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Competitor-activity opportunities
// ---------------------------------------------------------------------------
// An active competitor flight in shared territory is a defend-your-share signal.
// Read from captured competitor_campaigns intel (see src/domain/competitor-intel.ts)
// and surfaced as a defensive-flight recommendation. Deterministic + unit-tested.

export type CompetitorSignalInput = {
  id: string;
  competitorName: string;
  /** Channel/source the flight was seen on (meta_ad_library, google_ads_transparency, …). */
  channel: string;
  /** Review status of the captured intel: needs_review | confirmed | archived. */
  status: string;
  /** Keywords/terms the competitor is bidding on or emphasizing. */
  keywords?: string[];
  /** How many distinct ad creatives were captured — a proxy for flight size. */
  creativeCount?: number;
  /** Persona the competitor is targeting, when captured. */
  persona?: string;
  /** ISO capture time; intel older than freshDays is treated as stale. */
  capturedAt?: string;
  /** Source link (ad-library entry, landing page) for the evidence panel. */
  url?: string;
};

export type CompetitorDetectionConfig = { now: string; freshDays?: number };

const DEFAULT_COMPETITOR_FRESH_DAYS = 45;

const COMPETITOR_CHANNEL_LABELS: Record<string, string> = {
  meta_ad_library: "Meta",
  google_ads_transparency: "paid-search",
  similarweb: "paid",
  landing_page: "landing-page",
};

function competitorChannelLabel(channel: string): string {
  return COMPETITOR_CHANNEL_LABELS[channel] ?? (channel || "paid").replace(/[_-]+/g, " ").trim();
}

/**
 * Competitor-activity opportunities: a live competitor flight in contested
 * territory. Archived intel is ignored; captures older than freshDays are treated
 * as stale (not an active flight). Confirmed intel and a bigger creative count
 * raise both confidence and urgency.
 */
export function detectCompetitorOpportunities(
  signals: CompetitorSignalInput[],
  config: CompetitorDetectionConfig,
): OpportunityCandidate[] {
  const freshDays = config.freshDays ?? DEFAULT_COMPETITOR_FRESH_DAYS;
  const out: OpportunityCandidate[] = [];
  for (const s of signals) {
    if (!s.id) continue;
    if (s.status === "archived") continue;
    if (s.capturedAt) {
      const age = daysBetween(s.capturedAt, config.now);
      if (age > freshDays) continue; // stale intel — no longer a live flight
    }

    const creativeCount = Math.max(0, Math.floor(s.creativeCount ?? 0));
    const activityLevel: "low" | "medium" | "high" =
      creativeCount >= 5 ? "high" : creativeCount >= 2 ? "medium" : "low";
    const confirmed = s.status === "confirmed";

    const urgency: OpportunityCandidate["urgency"] =
      confirmed && activityLevel === "high" ? "high" : activityLevel !== "low" || confirmed ? "medium" : "low";
    // Confirmed intel is more trustworthy; more creatives = a bigger flight.
    const confidence = clamp((confirmed ? 70 : 55) + Math.min(20, creativeCount * 4), 0, 100);

    const keywords = (s.keywords ?? []).filter((k) => typeof k === "string" && k.trim().length > 0);
    const name = s.competitorName?.trim() || "A competitor";
    const channel = competitorChannelLabel(s.channel);
    const keywordNote = keywords.length ? ` on ${keywords.slice(0, 3).join(", ")}` : "";

    out.push({
      kind: "competitor_signal",
      subjectType: "competitor_signal",
      subjectId: s.id,
      title: `${name} is running ${channel} ads — contested territory`,
      summary:
        `${name} has an active ${channel} flight${keywordNote}. Holding share of voice in contested territory needs a ` +
        `defensive flight before they capture in-market demand.`,
      confidence,
      urgency,
      evidence: {
        ...(s.persona ? { persona: s.persona } : {}),
        competitor: name,
        channel,
        activityLevel,
        creativeCount,
        ...(keywords.length ? { keywords } : {}),
        ...(s.capturedAt ? { capturedAt: s.capturedAt } : {}),
        evidence_urls: s.url && s.url.trim() ? [s.url.trim()] : [],
      },
      recommendedAction: `Prepare a defensive ${channel} flight to hold share of voice against ${name}`,
      recommendedCampaignType: "competitive_defense",
    });
  }
  return out;
}
