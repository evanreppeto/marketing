import { buildCampaignSeedFromOpportunity } from "@/domain";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { crmRecordHref, listOpenOpportunities, type OpportunityRecord } from "@/lib/opportunities/read-model";
import { getOrgPersonaOptions } from "@/lib/personas/read-model";

import { OpportunityInbox, type OpportunityVM } from "./_components/opportunity-inbox";

export const metadata = { title: "Opportunities — Arc" };

function humanize(value: string): string {
  const s = (value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  if (!s || /^unassigned/i.test(s)) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function classify(text: string, subjectType: string): { icon: OpportunityVM["icon"]; typeLabel: string } {
  // External-signal kinds carry a synthetic subject_type — key off it directly so
  // classification never depends on a keyword happening to appear in the title
  // (e.g. "Severe Thunderstorm Warning" has no bare "storm"/"wind" token).
  const stExact = (subjectType || "").toLowerCase();
  if (stExact === "weather_event") return { icon: "weather", typeLabel: "Weather event" };
  if (stExact === "competitor_signal") return { icon: "comp", typeLabel: "Competitor move" };

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

function shortName(title: string): string {
  const first = title.split(/\s+[—–-]\s+/)[0].trim() || title.trim();
  return first.length > 46 ? `${first.slice(0, 44).trim()}…` : first;
}

function urgencyTone(urgency: OpportunityRecord["urgency"]): OpportunityVM["urgencyTone"] {
  return urgency === "high" ? "red" : urgency === "medium" ? "amber" : "info";
}

function campaignTypes(urgency: OpportunityRecord["urgency"]): string[] {
  if (urgency === "high") return ["Rapid response", "Geo-targeted"];
  if (urgency === "medium") return ["Targeted outreach"];
  return ["Nurture sequence"];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Short chip label for opportunities Arc has already begun/finished drafting. */
function statusLabel(status: string): string | null {
  if (status === "drafting") return "Drafting…";
  if (status === "drafted") return "Drafted";
  return null;
}

/**
 * Approval-routing timeline. Once a draft exists the first step reads as
 * complete ("Draft created") and the pending gate becomes the human approval —
 * keeping the card honest with the campaign's launch-locked state.
 */
function buildRouting(status: string): OpportunityVM["routing"] {
  if (status === "drafting") {
    return [
      { step: "You", note: "Requested a draft", done: true },
      { step: "Arc", note: "Preparing the campaign draft", done: false },
      { step: "Workspace approval", note: "Required before anything sends", done: false },
    ];
  }
  if (status === "drafted") {
    return [
      { step: "You", note: "Draft created", done: true },
      { step: "Workspace approval", note: "Awaiting approval — nothing sends yet", done: false },
    ];
  }
  return [
    { step: "You", note: "Reviewing now", done: true },
    { step: "Workspace approval", note: "Required before anything sends", done: false },
  ];
}

function toVM(rec: OpportunityRecord): OpportunityVM {
  const ev = rec.evidence ?? {};
  const persona = humanizePersona(ev.persona ?? "");
  const { icon, typeLabel } = classify(`${rec.title} ${rec.summary}`, rec.subject_type);
  const urgencyLabel = humanize(rec.urgency) || "Medium";
  const sourceLabel = humanize(rec.subject_type) || "Arc";
  const confidence = Math.round(rec.confidence);

  const recordHref = crmRecordHref(rec.subject_type, rec.subject_id);
  const recordNoun =
    rec.subject_type === "lead" ? "lead" : rec.subject_type === "contact" ? "contact" : "company";

  const evidence: OpportunityVM["evidence"] = [];
  // Weather-event signals (kind='weather_event').
  if (ev.eventType) evidence.push({ label: "Alert", value: humanize(ev.severity ?? "") ? `${ev.eventType} (${humanize(ev.severity ?? "")})` : ev.eventType });
  if (ev.area) evidence.push({ label: "Coverage area", value: ev.area });
  if (Array.isArray(ev.zipCodes) && ev.zipCodes.length) evidence.push({ label: "ZIPs", value: ev.zipCodes.slice(0, 6).join(", ") });
  // Competitor signals (kind='competitor_signal').
  if (ev.competitor) evidence.push({ label: "Competitor", value: ev.competitor });
  if (ev.channel) evidence.push({ label: "Channel", value: humanize(ev.channel) });
  if (typeof ev.creativeCount === "number" && ev.creativeCount > 0) {
    evidence.push({ label: "Active creatives", value: `${ev.creativeCount}${ev.activityLevel ? ` (${humanize(ev.activityLevel)} activity)` : ""}` });
  }
  if (Array.isArray(ev.keywords) && ev.keywords.length) evidence.push({ label: "Keywords", value: ev.keywords.slice(0, 4).join(", ") });
  // Cold-lead / lifecycle signals.
  if (typeof ev.leadScore === "number") evidence.push({ label: "Lead score", value: `${Math.round(ev.leadScore)} / 100` });
  if (typeof ev.daysCold === "number") evidence.push({ label: "Inactivity", value: `${ev.daysCold} days since last touch` });
  if (ev.lastActivityAt) evidence.push({ label: "Last activity", value: formatDate(ev.lastActivityAt) });
  if (persona) evidence.push({ label: "Persona match", value: persona });
  if (Array.isArray(ev.evidence_urls) && ev.evidence_urls.length) {
    evidence.push({ label: "Sources", value: `${ev.evidence_urls.length} reference link${ev.evidence_urls.length === 1 ? "" : "s"}` });
  }

  const impact: OpportunityVM["impact"] = [
    { label: "Urgency", value: urgencyLabel },
    { label: "Confidence", value: `${confidence}%` },
  ];
  if (ev.severity) impact.push({ label: "Severity", value: humanize(ev.severity) });
  if (ev.activityLevel) impact.push({ label: "Activity", value: humanize(ev.activityLevel) });
  if (typeof ev.leadScore === "number") impact.push({ label: "Lead score", value: `${Math.round(ev.leadScore)}` });
  if (typeof ev.daysCold === "number") impact.push({ label: "Days cold", value: `${ev.daysCold}` });

  // Deterministic seed for the "Create campaign" confirm modal (persona enum,
  // inferred focus, name). Computed server-side so the modal can pre-fill it.
  const seed = buildCampaignSeedFromOpportunity({
    title: rec.title,
    summary: rec.summary,
    recommendedAction: rec.recommended_action,
    urgency: rec.urgency,
    persona: ev.persona,
    recommendedCampaignType: null,
  });

  return {
    id: rec.id,
    name: shortName(rec.title),
    title: rec.title,
    confidence,
    urgencyTone: urgencyTone(rec.urgency),
    urgencyLabel,
    typeLabel,
    icon,
    sourceLabel,
    summary: rec.summary,
    recommendedAction: rec.recommended_action,
    persona,
    personaHref: persona ? "/personas" : null,
    recordHref,
    recordLabel: recordHref ? `Open the ${recordNoun} record` : null,
    audienceNote: persona ? "Primary persona Arc matched to this signal" : `Source: ${sourceLabel}`,
    campaignTypes: campaignTypes(rec.urgency),
    evidence,
    impact,
    routing: buildRouting(rec.status),
    status: rec.status,
    statusLabel: statusLabel(rec.status),
    campaignHref: rec.campaign_id ? `/campaigns/${rec.campaign_id}` : null,
    seed: { name: seed.name, persona: seed.persona, restorationFocus: seed.restorationFocus },
  };
}

export default async function OpportunitiesPage() {
  const ctx = await getCurrentWorkspaceContext();
  const [records, personaOptions] = await Promise.all([
    listOpenOpportunities(undefined, ctx.orgId).catch(() => [] as OpportunityRecord[]),
    getOrgPersonaOptions(ctx.orgId).catch(() => []),
  ]);
  const opps = records.map(toVM);

  return <OpportunityInbox opps={opps} personaOptions={personaOptions} />;
}
