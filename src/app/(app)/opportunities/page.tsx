import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listOpenOpportunities, type OpportunityRecord } from "@/lib/opportunities/read-model";

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
  const t = text.toLowerCase();
  if (/storm|hail|weather|wind|snow|flood|rain|freeze/.test(t)) return { icon: "weather", typeLabel: "Weather event" };
  if (/competitor|servpro|rival|ad library|running ads|contested/.test(t)) return { icon: "comp", typeLabel: "Competitor move" };
  if (/quiet|cold|lapsed|re-?engage|dormant|inactive|past customer|reactivat|referral/.test(t)) return { icon: "clock", typeLabel: "Lifecycle" };
  if (/intent|comparing|estimate|visit|brows|inquir|quote request|warm/.test(t)) return { icon: "user", typeLabel: "Buyer intent" };
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

function toVM(rec: OpportunityRecord): OpportunityVM {
  const ev = rec.evidence ?? {};
  const persona = humanizePersona(ev.persona ?? "");
  const { icon, typeLabel } = classify(`${rec.title} ${rec.summary}`, rec.subject_type);
  const urgencyLabel = humanize(rec.urgency) || "Medium";
  const sourceLabel = humanize(rec.subject_type) || "Arc";
  const confidence = Math.round(rec.confidence);

  const evidence: OpportunityVM["evidence"] = [];
  if (typeof ev.leadScore === "number") evidence.push({ label: "Lead score", value: `${Math.round(ev.leadScore)} / 100` });
  if (typeof ev.daysCold === "number") evidence.push({ label: "Inactivity", value: `${ev.daysCold} days since last touch` });
  if (ev.lastActivityAt) evidence.push({ label: "Last activity", value: formatDate(ev.lastActivityAt) });
  if (persona) evidence.push({ label: "Persona match", value: persona });

  const impact: OpportunityVM["impact"] = [
    { label: "Urgency", value: urgencyLabel },
    { label: "Confidence", value: `${confidence}%` },
  ];
  if (typeof ev.leadScore === "number") impact.push({ label: "Lead score", value: `${Math.round(ev.leadScore)}` });
  if (typeof ev.daysCold === "number") impact.push({ label: "Days cold", value: `${ev.daysCold}` });

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
    audienceNote: persona ? "Primary persona Arc matched to this signal" : `Source: ${sourceLabel}`,
    campaignTypes: campaignTypes(rec.urgency),
    evidence,
    impact,
    routing: [
      { step: "You", note: "Reviewing now", done: true },
      { step: "Workspace approval", note: "Required before anything sends", done: false },
    ],
  };
}

export default async function OpportunitiesPage() {
  const ctx = await getCurrentWorkspaceContext();
  const records = await listOpenOpportunities(undefined, ctx.orgId).catch(() => [] as OpportunityRecord[]);
  const opps = records.map(toVM);

  return <OpportunityInbox opps={opps} />;
}
