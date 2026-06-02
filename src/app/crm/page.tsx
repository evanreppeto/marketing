import Link from "next/link";
import { connection } from "next/server";

import { DataTable } from "../_components/data-table";
import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getCrmOverviewData, type CrmPipelineRow } from "@/lib/crm/read-model";

type CrmPageProps = {
  searchParams?: Promise<{
    selected?: string | string[];
    band?: string | string[];
    persona?: string | string[];
    urgency?: string | string[];
    source?: string | string[];
    lifecycle?: string | string[];
    service?: string | string[];
  }>;
};

export default async function CrmPage({ searchParams }: CrmPageProps) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const selectedId = getValue(query.selected);
  const band = normalizeBand(getValue(query.band));
  const filters = {
    persona: getValue(query.persona),
    urgency: getValue(query.urgency),
    source: getValue(query.source),
    lifecycle: getValue(query.lifecycle),
    service: getValue(query.service),
  };
  const data = await getCrmOverviewData();
  const isLive = data.status === "live";
  const allRows = isLive ? data.rows : [];
  const rows = isLive ? filterRows(allRows, band, filters) : [];
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const filterOptions = buildFilterOptions(allRows);

  return (
    <>
      <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">CRM</span>
              <StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live Supabase" : "Unavailable"}</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>
            <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
              Growth records Mark can use, humans can inspect.
            </h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
              Companies, contacts, leads, jobs, and outcomes are the memory layer for partner handoffs, campaigns, scoring, and revenue intelligence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClasses({ variant: "ghost" })} href="/partners">Partner development</Link>
            <Link className={buttonClasses({ variant: "primary" })} href="/campaigns">Campaigns</Link>
          </div>
        </div>
      </header>

      {!isLive ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">CRM unavailable: </span>
          {data.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={
          isLive
            ? data.stats.map((stat, index) => ({
                label: stat.label,
                value: stat.value,
                detail: `${stat.delta}. ${stat.forecast}`,
                tone: index === 0 ? ("amber" as const) : index === 3 ? ("green" as const) : ("blue" as const),
              }))
            : [
                { label: "Leads", value: 0, detail: "Waiting on database", tone: "gray" as const },
                { label: "Companies", value: 0, detail: "Waiting on database", tone: "gray" as const },
                { label: "Jobs", value: 0, detail: "Waiting on database", tone: "gray" as const },
                { label: "Revenue", value: "$0", detail: "Waiting on database", tone: "gray" as const },
              ]
        }
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Score and tags"
            title="Record filters"
            description="Filter by lead score bands, persona, urgency, source, lifecycle, and service tags. These tags come from existing CRM fields and metadata."
          >
            <div className="space-y-4 p-4">
              <FilterGroup
                label="Score band"
                active={band}
                options={[
                  ["all", "All records"],
                  ["high", "High score"],
                  ["medium", "Medium score"],
                  ["low", "Needs enrichment"],
                ]}
                query={query}
                param="band"
              />
              <FilterGroup label="Persona" active={filters.persona} options={filterOptions.persona} query={query} param="persona" />
              <FilterGroup label="Urgency" active={filters.urgency} options={filterOptions.urgency} query={query} param="urgency" />
              <FilterGroup label="Service" active={filters.service} options={filterOptions.service} query={query} param="service" />
              <FilterGroup label="Lifecycle" active={filters.lifecycle} options={filterOptions.lifecycle} query={query} param="lifecycle" />
              <FilterGroup label="Source" active={filters.source} options={filterOptions.source} query={query} param="source" />
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            className="p-0"
            eyebrow="Pipeline"
            title="Growth records"
            description="Records here are internal review inputs. No contact or outreach is triggered from this table."
            aside={<StatusPill tone={rows.length > 0 ? "blue" : "gray"}>{rows.length} visible</StatusPill>}
          >
            <DataTable
              rows={rows}
              rowKey={(row) => row.id}
              isSelected={(row) => selected?.id === row.id}
              minWidth="min-w-[980px]"
              columns={[
                {
                  key: "record",
                  header: "Record",
                  cell: (row) => (
                    <>
                      <Link className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={`/crm?band=${band}&selected=${row.id}`}>
                        {row.record}
                      </Link>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{row.type}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <TagBadge label={row.personaTag} />
                        {row.serviceTags.slice(0, 2).map((tag) => (
                          <TagBadge key={tag} label={tag} muted />
                        ))}
                      </div>
                    </>
                  ),
                },
                { key: "account", header: "Account", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.account },
                {
                  key: "stage",
                  header: "Lifecycle",
                  cell: (row) => (
                    <div className="space-y-2">
                      <StatusPill tone={row.tone}>{row.stage}</StatusPill>
                      <div className="text-xs font-semibold text-[var(--text-muted)]">{humanizeTag(row.urgencyTag)}</div>
                    </div>
                  ),
                },
                { key: "score", header: "Score / value", cellClassName: "font-mono font-semibold text-[var(--accent)]", cell: (row) => row.value },
                {
                  key: "source",
                  header: "Source",
                  cell: (row) => (
                    <div className="space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">{humanizeTag(row.sourceTag)}</div>
                      <div className="text-xs text-[var(--text-muted)]">{row.objectType}</div>
                    </div>
                  ),
                },
                {
                  key: "next",
                  header: "Next action",
                  cell: (row) => (
                    <>
                      <div className="font-semibold text-[var(--text-primary)]">{row.nextStep}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(row.updated)}</div>
                      {row.missingTags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.missingTags.slice(0, 2).map((tag) => (
                            <TagBadge key={tag} label={tag} tone="amber" />
                          ))}
                        </div>
                      ) : null}
                    </>
                  ),
                },
              ]}
              emptyState={<EmptyState title="No CRM records in this view" detail="Live CRM is connected, but this score band has no matching records yet." />}
            />
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: selected?.record ?? "Select a CRM record",
              persona: selected?.type ?? null,
              confidence: selected ? `${selected.score}/100` : null,
              journeyStage: selected?.stage ?? null,
              urgency: selected && selected.score >= 75 ? "High-value urgent" : selected ? "Review" : null,
              attentionReason: selected?.account ?? "Select a CRM row to see partner, lead, or revenue context.",
              nextBestAction: selected?.nextStep ?? "Mark can enrich CRM context after a real record exists.",
              cta: selected ? ctaForPersona(selected.type) : null,
              messageAngle: selected ? "Restoration, mitigation documentation, partner handoff, and revenue intelligence." : null,
              guardrailStatus: "Internal CRM review only. Outbound remains locked until an approval item authorizes the next step.",
              scores: selected ? [
                { label: "Fit", value: selected.score, detail: "CRM score band" },
                { label: "Lifecycle", value: selected.stage, detail: "Current status", tone: selected.tone },
              ] : [],
              proofPoints: selected ? [`Owner: ${selected.owner}`, `Value: ${selected.value}`, `Last update: ${formatDate(selected.updated)}`] : [],
              outboundLocked: true,
            }}
          />

          <WorkspacePanel eyebrow="Data contracts" title="Needed next fields">
            <div className="grid gap-2 p-4 text-sm leading-6 text-[var(--text-secondary)]">
              {[
                "partner_type and relationship_maturity on companies",
                "next_touch_at and last_touch_at for partner development",
                "urgency_score, revenue_score, and confidence_score on leads",
                "evidence_urls and proof_points on every Mark-created record",
                "campaign_readiness and missing_fields arrays for enrichment routing",
              ].map((item) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2" key={item}>{item}</div>
              ))}
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </>
  );
}

function filterRows(
  rows: CrmPipelineRow[],
  band: string,
  filters: { persona?: string; urgency?: string; source?: string; lifecycle?: string; service?: string },
) {
  return rows.filter((row) => {
    const matchesBand =
      band === "high" ? row.score >= 75 : band === "medium" ? row.score >= 55 && row.score < 75 : band === "low" ? row.score < 55 : true;
    const matchesPersona = !filters.persona || row.personaTag === filters.persona;
    const matchesUrgency = !filters.urgency || row.urgencyTag === filters.urgency;
    const matchesSource = !filters.source || row.sourceTag === filters.source;
    const matchesLifecycle = !filters.lifecycle || row.lifecycleTag === filters.lifecycle;
    const matchesService = !filters.service || row.serviceTags.includes(filters.service);
    return matchesBand && matchesPersona && matchesUrgency && matchesSource && matchesLifecycle && matchesService;
  });
}

function normalizeBand(value: string | undefined) {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "all";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildFilterOptions(rows: CrmPipelineRow[]) {
  return {
    persona: tagOptions(rows.map((row) => row.personaTag)),
    urgency: tagOptions(rows.map((row) => row.urgencyTag)),
    service: tagOptions(rows.flatMap((row) => row.serviceTags)),
    lifecycle: tagOptions(rows.map((row) => row.lifecycleTag)),
    source: tagOptions(rows.map((row) => row.sourceTag)),
  };
}

function tagOptions(values: string[]): Array<[string, string]> {
  return [...new Set(values.filter(Boolean))]
    .sort()
    .slice(0, 8)
    .map((value) => [value, humanizeTag(value)]);
}

function humanizeTag(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FilterGroup({
  label,
  active,
  options,
  query,
  param,
}: {
  label: string;
  active?: string;
  options: Array<[string, string]>;
  query: Record<string, string | string[] | undefined>;
  param: "band" | "persona" | "urgency" | "source" | "lifecycle" | "service";
}) {
  const optionList = param === "band" ? options : [["", "All"], ...options];

  if (optionList.length <= 1 && param !== "band") return null;

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="flex flex-wrap gap-2">
        {optionList.map(([key, optionLabel]) => {
          const isActive = param === "band" ? active === key : (active ?? "") === key;
          return (
            <Link
              key={`${param}-${key || "all"}`}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
              href={crmHref(query, param, key)}
            >
              {optionLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function crmHref(query: Record<string, string | string[] | undefined>, param: string, value: string) {
  const next = new URLSearchParams();
  for (const key of ["band", "persona", "urgency", "source", "lifecycle", "service"]) {
    const current = key === param ? value : getValue(query[key]);
    if (current && !(key === "band" && current === "all")) next.set(key, current);
  }
  const serialized = next.toString();
  return serialized ? `/crm?${serialized}` : "/crm";
}

function TagBadge({ label, muted = false, tone = "blue" }: { label: string; muted?: boolean; tone?: "blue" | "amber" }) {
  const toneClass =
    tone === "amber"
      ? "border-[oklch(0.82_0.13_85/0.38)] bg-[oklch(0.82_0.13_85/0.1)] text-[oklch(0.9_0.09_85)]"
      : muted
        ? "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]"
        : "border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] text-[var(--chicago-blue-soft)]";
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${toneClass}`}>{humanizeTag(label)}</span>;
}

function ctaForPersona(persona: string) {
  const lower = persona.toLowerCase();
  if (lower.includes("property manager")) return "Request Vendor Packet";
  if (lower.includes("insurance")) return "Refer a Client";
  if (lower.includes("plumb") || lower.includes("trade") || lower.includes("contractor")) return "Become a Partner";
  return "Call Now / Upload Photos";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
