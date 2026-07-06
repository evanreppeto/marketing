import { getCrmMentionSamples, getCrmNavCounts, type CrmObjectKey, type CrmObjectRow } from "@/lib/crm/read-model";

import { CrmBoard, type CrmObjectVM, type CrmRowVM } from "./_components/crm-board";

export const metadata = { title: "CRM — Arc" };

const OBJECT_META: { key: CrmObjectKey; label: string; noun: string; nameHeader: string; singular: string }[] = [
  { key: "companies", label: "Companies", noun: "companies", nameHeader: "Company", singular: "company" },
  { key: "contacts", label: "Contacts", noun: "contacts", nameHeader: "Contact", singular: "contact" },
  { key: "properties", label: "Properties", noun: "properties", nameHeader: "Property", singular: "property" },
  { key: "leads", label: "Leads", noun: "leads", nameHeader: "Lead", singular: "lead" },
  { key: "jobs", label: "Jobs", noun: "jobs", nameHeader: "Job", singular: "job" },
  { key: "outcomes", label: "Outcomes", noun: "outcomes", nameHeader: "Outcome", singular: "outcome" },
];

function initials(name: string): string {
  return (
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "•"
  );
}

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  if (!s || /^unassigned/i.test(s)) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function personaDot(persona: string): string {
  const p = (persona || "").toLowerCase();
  if (/storm|hail|weather|damage/.test(p)) return "#7fb89a";
  if (/property|manager|realtor|hoa|commercial/.test(p)) return "#c8a24a";
  if (/insurance|adjuster/.test(p)) return "#88b6d8";
  if (/past|repeat|existing|customer|reactivation/.test(p)) return "#9678c8";
  return "#c8a24a";
}

function statusTone(status: string): string {
  const t = (status || "").toLowerCase();
  if (/do not contact|dnc|blocked|suppress/.test(t)) return "dnc";
  if (/lost|dead|cancel|churn/.test(t)) return "lost";
  if (/won|complete|closed.?won|paid/.test(t)) return "won";
  if (/qualified/.test(t)) return "qualified";
  if (/schedul|booked|dispatch/.test(t)) return "sched";
  if (/review|pending|needs|hold/.test(t)) return "review";
  if (/new|open|fresh|inbound/.test(t)) return "new";
  if (/active|live|engaged|in progress/.test(t)) return "active";
  return "inactive";
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--ok)";
  if (score >= 40) return "var(--accent)";
  return "var(--muted)";
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return value && !/^now$/i.test(value) ? value : "now";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toRow(row: CrmObjectRow): CrmRowVM {
  const persona = humanizePersona(row.personaTag);
  return {
    id: row.id,
    name: row.name,
    detail: row.detail || row.sourceLabel || "",
    initials: initials(row.name),
    isCompany: row.objectKey === "companies",
    statusLabel: row.status || "—",
    statusTone: statusTone(row.status),
    persona,
    dot: personaDot(row.personaTag),
    score: typeof row.score === "number" ? Math.round(row.score) : null,
    scoreColor: typeof row.score === "number" ? scoreColor(row.score) : "var(--muted)",
    owner: row.owner || "—",
    updatedRel: relativeTime(row.updated),
    href: row.href,
  };
}

export default async function CrmPage() {
  const [samples, navCounts] = await Promise.all([
    getCrmMentionSamples().catch(() => ({}) as Partial<Record<CrmObjectKey, CrmObjectRow[]>>),
    getCrmNavCounts().catch(() => ({ status: "unavailable" }) as const),
  ]);

  const counts = navCounts.status === "live" ? navCounts.counts : null;

  const rowsByKey: Record<string, CrmRowVM[]> = {};
  const objects: CrmObjectVM[] = OBJECT_META.map((meta) => {
    const rows = (samples[meta.key] ?? []).map(toRow);
    rowsByKey[meta.key] = rows;
    return {
      key: meta.key,
      label: meta.label,
      noun: meta.noun,
      nameHeader: meta.nameHeader,
      addLabel: `Add ${meta.singular}`,
      filterPlaceholder: `Filter ${meta.noun}…`,
      count: counts ? counts[meta.key] : rows.length,
    };
  });

  return <CrmBoard objects={objects} rowsByKey={rowsByKey} defaultKey="contacts" />;
}
