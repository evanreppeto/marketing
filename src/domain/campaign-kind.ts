export type CampaignKind = "outbound" | "internal";

/** Substrings that mark a real, partner/customer-facing outbound deliverable. */
const OUTBOUND_HINTS = ["email", "social", "landing", "sms", "letter", "newsletter"];

/** Substrings that mark internal CRM / list-building / enrichment work. */
const INTERNAL_HINTS = ["population", "crm lead list", "partner lead list", "lead list", "enrich", "discovery"];

/**
 * Classify a campaign as operator-facing OUTBOUND work or INTERNAL CRM/enrichment
 * batch work, from its (humanized) asset types and objective text. Any outbound
 * delivery channel wins. Unknown shapes default to "outbound" so a real campaign
 * is never hidden inside the collapsed internal fold.
 */
export function classifyCampaignKind(input: { assetTypes: string[]; objective: string }): CampaignKind {
  const haystacks = [...input.assetTypes, input.objective].map((value) => value.toLowerCase());
  const hasOutbound = haystacks.some((hay) => OUTBOUND_HINTS.some((hint) => hay.includes(hint)));
  if (hasOutbound) return "outbound";
  const hasInternal = haystacks.some((hay) => INTERNAL_HINTS.some((hint) => hay.includes(hint)));
  return hasInternal ? "internal" : "outbound";
}
