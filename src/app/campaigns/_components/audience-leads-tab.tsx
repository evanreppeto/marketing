import Link from "next/link";

import { cx, theme, type ThemeTone } from "@/app/_components/theme";
import type { CampaignWorkspaceMeta, CampaignWorkspaceSource } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";

type SourceGroupKey = "company" | "contact" | "lead" | "evidence";

const KIND_LABELS: Record<CampaignWorkspaceSource["kind"], string> = {
  company: "Company",
  contact: "Contact",
  lead: "Lead",
  web: "Evidence",
  evidence: "Evidence",
};

const GROUPS: Array<{ key: SourceGroupKey; eyebrow: string; detail: string; tone: ThemeTone }> = [
  { key: "company", eyebrow: "Companies", detail: "Organizations tied to the campaign target.", tone: "blue" },
  { key: "contact", eyebrow: "Contacts", detail: "People Mark can reference when reviewing the package.", tone: "green" },
  { key: "lead", eyebrow: "Leads", detail: "Qualified demand signals behind the outreach.", tone: "amber" },
  { key: "evidence", eyebrow: "Evidence links", detail: "URLs and references captured from prompts, outputs, or source data.", tone: "gray" },
];

function groupOf(source: CampaignWorkspaceSource): SourceGroupKey {
  if (source.kind === "company") return "company";
  if (source.kind === "contact") return "contact";
  if (source.kind === "lead") return "lead";
  return "evidence"; // web + evidence
}

export function AudienceLeadsTab({ campaign, sources }: { campaign: CampaignWorkspaceMeta; sources: CampaignWorkspaceSource[] }) {
  if (sources.length === 0) {
    return <EmptyAudience campaign={campaign} />;
  }

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: sources.filter((source) => groupOf(source) === group.key),
  })).filter((group) => group.items.length > 0);
  const counts = countByGroup(sources);
  const primaryGroups = grouped.filter((group) => group.key !== "evidence");
  const evidenceGroup = grouped.find((group) => group.key === "evidence");

  return (
    <div className="space-y-6">
      <AudienceBrief campaign={campaign} sourceCount={sources.length} counts={counts} />

      {primaryGroups.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {primaryGroups.map((group) => (
            <section key={group.key} className="grid min-w-0 grid-rows-[auto_1fr]">
              <div className="min-h-16">
                <SectionHeader tone={group.tone} eyebrow={group.eyebrow} detail={group.detail} count={group.items.length} />
              </div>
              <div className="grid gap-3">
                {group.items.map((source) => (
                  <RecordCard key={source.id} source={source} tone={group.tone} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {evidenceGroup ? (
        <section>
          <SectionHeader tone={evidenceGroup.tone} eyebrow={evidenceGroup.eyebrow} detail={evidenceGroup.detail} count={evidenceGroup.items.length} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {evidenceGroup.items.map((source) => (
              <EvidenceCard key={source.id} source={source} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EmptyAudience({ campaign }: { campaign: CampaignWorkspaceMeta }) {
  return (
    <div className="space-y-5">
      <AudienceBrief campaign={campaign} sourceCount={0} counts={{ company: 0, contact: 0, lead: 0, evidence: 0 }} />
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No leads, contacts, companies, or evidence links are attached to this campaign yet.
      </p>
    </div>
  );
}

function AudienceBrief({
  campaign,
  sourceCount,
  counts,
}: {
  campaign: CampaignWorkspaceMeta;
  sourceCount: number;
  counts: Record<SourceGroupKey, number>;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Audience brief</div>
          <h3 className="mt-2 text-lg font-bold text-[var(--text-primary)]">{cleanAudienceLabel(campaign.persona)}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{campaign.audienceSummary}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{campaign.offerSummary}</p>
        </div>
        <div className="grid min-w-52 grid-cols-2 gap-2">
          <SummaryStat label="Sources" value={sourceCount} tone="blue" />
          <SummaryStat label="Companies" value={counts.company} tone="blue" />
          <SummaryStat label="Contacts" value={counts.contact} tone="green" />
          <SummaryStat label="Leads" value={counts.lead} tone="amber" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ContextPill label="Focus" value={campaign.restorationFocus} />
        <ContextPill label="Evidence links" value={String(counts.evidence)} />
        <ContextPill label="Access" value="Private CRM records stay locked" />
      </div>
    </section>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: ThemeTone }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tonePanel(tone)}`}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

function RecordCard({ source, tone }: { source: CampaignWorkspaceSource; tone: ThemeTone }) {
  const detailRows = sourceDetails(source);

  return (
    <article className="flex min-h-44 min-w-0 flex-col rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 transition">
      <div className="flex items-start justify-between gap-3">
        <span className={cx("inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", theme.pill[tone])}>
          {KIND_LABELS[source.kind]}
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {source.url ? hostOf(source.url) : "Private"}
        </span>
      </div>
      <h4 className="mt-3 break-words text-base font-bold leading-6 text-[var(--text-primary)]">{source.label}</h4>
      <dl className="mt-3 space-y-1.5">
        {detailRows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="min-w-0">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{row.label}</dt>
            <dd className="truncate text-sm leading-5 text-[var(--text-secondary)]" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-xs font-semibold">
        {source.recordHref ? (
          <Link href={source.recordHref} className="text-[var(--accent)] transition hover:underline">
            View in CRM
          </Link>
        ) : null}
        {source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] transition hover:text-[var(--accent)]">
            Website
          </a>
        ) : null}
        {!source.recordHref && !source.url ? (
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <LockIcon />
            Private CRM record
          </span>
        ) : null}
      </div>
    </article>
  );
}

function EvidenceCard({ source }: { source: CampaignWorkspaceSource }) {
  const body = (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
          {source.url ? hostOf(source.url) : "Evidence"}
        </span>
      </div>
      <h4 className="mt-2 line-clamp-2 font-bold text-[var(--text-primary)]">{source.label}</h4>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{source.detail}</p>
      {source.url ? <span className="mt-auto pt-3 font-mono text-xs font-bold text-[var(--accent)]">Open original</span> : null}
    </div>
  );

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="flex rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {body}
      </a>
    );
  }
  return <article className="flex rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">{body}</article>;
}

function countByGroup(sources: CampaignWorkspaceSource[]): Record<SourceGroupKey, number> {
  return sources.reduce<Record<SourceGroupKey, number>>(
    (counts, source) => {
      counts[groupOf(source)] += 1;
      return counts;
    },
    { company: 0, contact: 0, lead: 0, evidence: 0 },
  );
}

function sourceDetails(source: CampaignWorkspaceSource): Array<{ label: string; value: string }> {
  const parts = source.detail.split(" / ").filter(Boolean);
  if (source.kind === "company") {
    return parts.map((part, index) => ({
      label: index === 0 ? "Tier" : part.includes("@") ? "Email" : "Phone",
      value: index === 0 && part.length <= 2 ? `Partner tier ${part}` : part,
    }));
  }
  if (source.kind === "contact") {
    return parts.map((part, index) => ({
      label: index === 0 ? "Role" : part.includes("@") ? "Email" : "Phone",
      value: part,
    }));
  }
  if (source.kind === "lead") {
    return parts.map((part, index) => ({
      label: index === 0 ? "Status" : part.toLowerCase().includes("score") ? "Score" : "Signal",
      value: part,
    }));
  }
  return parts.map((part) => ({ label: "Detail", value: part }));
}

function cleanAudienceLabel(value: string) {
  return value.replace(/^Persona\s+/i, "");
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function tonePanel(tone: ThemeTone) {
  return theme.pill[tone];
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
