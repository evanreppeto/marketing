import type { OpportunityVM } from "./_components/opportunity-inbox";

/**
 * Map an opportunity's text + subject type to an inbox icon + type label. Pure, so it
 * can be unit-tested apart from the page.
 *
 * External-signal kinds carry a synthetic subject_type and are keyed off it FIRST, so
 * classification never depends on a keyword happening to appear in the title — a news
 * item headlined "…storm damage…" is a news mention, not a weather event, and a
 * "Severe Thunderstorm Warning" alert (no bare "storm" token) is still weather.
 */
export function classify(text: string, subjectType: string): { icon: OpportunityVM["icon"]; typeLabel: string } {
  const stExact = (subjectType || "").toLowerCase();
  if (stExact === "weather_event") return { icon: "weather", typeLabel: "Weather event" };
  if (stExact === "competitor_signal") return { icon: "comp", typeLabel: "Competitor move" };
  if (stExact === "campaign") return { icon: "repeat", typeLabel: "Repeat a winner" };
  if (stExact === "feed_item") return { icon: "news", typeLabel: "News mention" };

  const t = text.toLowerCase();
  // Word-boundaried so company names like "Windy City" don't match "wind".
  if (/\b(partner|referral|co-?marketing)\b/.test(t)) return { icon: "comp", typeLabel: "Partner referral" };
  if (/\b(storm|hail|hailstorm|weather|wind|snow|flood|rain|freeze)\b/.test(t)) return { icon: "weather", typeLabel: "Weather event" };
  if (/\b(competitor|servpro|rival|ad library|running ads|contested)\b/.test(t)) return { icon: "comp", typeLabel: "Competitor move" };
  if (/\b(quiet|cold|lapsed|re-?engage|dormant|inactive|past customer|reactivat)\b/.test(t)) return { icon: "clock", typeLabel: "Lifecycle" };
  if (/\b(intent|comparing|estimate|visit|brows|inquir|quote request|warm)\b/.test(t)) return { icon: "user", typeLabel: "Buyer intent" };
  const st = (subjectType || "").toLowerCase();
  if (/lead/.test(st)) return { icon: "user", typeLabel: "Lead signal" };
  if (/compan|partner/.test(st)) return { icon: "comp", typeLabel: "Company signal" };
  return { icon: "user", typeLabel: "Opportunity" };
}
