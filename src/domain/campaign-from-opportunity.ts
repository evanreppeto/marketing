import { type RestorationFocus } from "./campaign-drafts";
import { isOfficialPersonaMapping } from "./personas";

/**
 * Pure mapping from a surfaced opportunity to the seed fields for an
 * approval-gated campaign draft. Deterministic and I/O-free so it's identical
 * whether it runs in the page (to pre-fill the confirm modal) or the server
 * action (to author the authoritative draft). Nothing here sends anything —
 * this only shapes a draft the operator still has to approve.
 */

export type OpportunitySeedInput = {
  title: string;
  summary: string;
  recommendedAction: string;
  urgency: "low" | "medium" | "high";
  /** Opportunity evidence persona (an enum key like `persona_property_manager`), if any. */
  persona?: string | null;
  /** DB `recommended_campaign_type`, if the detector set one. */
  recommendedCampaignType?: string | null;
};

export type CampaignSeed = {
  /** Editable draft name, pre-filled from the opportunity title. */
  name: string;
  /** Official persona mapping, or "" when the opportunity has none (operator picks). */
  persona: string;
  /** Inferred `restoration_focus`, or "" when nothing matched (operator picks). */
  restorationFocus: RestorationFocus | "";
  /** The message angle — carries the opportunity's recommended action verbatim. */
  angle: string;
  /** Human-readable audience note for the campaign's `audience_summary`. */
  audienceSummary: string;
  /** Suggested campaign type label for display + provenance. */
  campaignType: string;
};

// Specific → generic. First match wins, so "storm surge" beats bare "storm",
// and "water backup" beats the generic "water" fallback.
const FOCUS_KEYWORDS: Array<[RegExp, RestorationFocus]> = [
  [/\b(?:burst|frozen|broken)\s+pipe|pipe\s+burst\b/, "burst_pipe"],
  [/\bsewage|sewer\b/, "sewage"],
  [/\bstorm\s+surge\b/, "storm_surge"],
  [/\bflash[-\s]?flood|flood(?:ing|ed|water|s)?\b/, "flood"],
  [/\bstorm|hail|hailstorm|wind[-\s]?driven\b/, "storm_surge"],
  [/\bmold|mildew\b/, "mold"],
  [/\bfire|smoke\s+damage\b/, "fire"],
  [/\bstanding\s+water\b/, "standing_water"],
  [/\bwater\s*[-\s]?backup|back[-\s]?up\b/, "water_backup"],
  [/\bwater\b/, "water_backup"],
];

/** Infer a `restoration_focus` from opportunity copy, or "" when nothing matches. */
export function inferRestorationFocus(text: string): RestorationFocus | "" {
  const t = (text || "").toLowerCase();
  for (const [re, focus] of FOCUS_KEYWORDS) {
    if (re.test(t)) return focus;
  }
  return "";
}

/** Turn a persona enum key into a readable label (e.g. `persona_hoa_board` → "Hoa board"). */
function personaLabel(persona: string): string {
  const s = persona
    .replace(/^persona[\s_-]+/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function humanize(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Concise, editable campaign name derived from the opportunity title. */
function suggestCampaignName(title: string): string {
  const clean = (title || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 96) return clean;
  return `${clean.slice(0, 94).trim()}…`;
}

/** A single suggested campaign-type label — the detector's value if present, else by urgency. */
function suggestCampaignType(
  urgency: OpportunitySeedInput["urgency"],
  recommendedCampaignType?: string | null,
): string {
  const explicit = (recommendedCampaignType ?? "").trim();
  if (explicit) return humanize(explicit);
  if (urgency === "high") return "Rapid response";
  if (urgency === "medium") return "Targeted outreach";
  return "Nurture sequence";
}

/**
 * Build the seed for a campaign draft from an opportunity. `persona` and
 * `restorationFocus` come back as "" when the opportunity gives no confident
 * value, so the confirm modal can require the operator to choose.
 */
export function buildCampaignSeedFromOpportunity(input: OpportunitySeedInput): CampaignSeed {
  const persona = isOfficialPersonaMapping(input.persona) ? input.persona : "";
  const restorationFocus = inferRestorationFocus(
    `${input.title} ${input.summary} ${input.recommendedAction}`,
  );
  const label = persona ? personaLabel(persona) : "";
  const audienceSummary = label
    ? `${label} — matched by Arc from this opportunity signal.`
    : "Audience sourced from an Arc opportunity signal.";

  return {
    name: suggestCampaignName(input.title),
    persona,
    restorationFocus,
    angle: (input.recommendedAction || "").trim(),
    audienceSummary,
    campaignType: suggestCampaignType(input.urgency, input.recommendedCampaignType),
  };
}
