import type { CampaignWorkspaceSource } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";

type Tone = "blue" | "red" | "amber" | "green" | "gray";

const KIND_LABELS: Record<CampaignWorkspaceSource["kind"], string> = {
  company: "Company",
  contact: "Contact",
  lead: "Lead",
  web: "Evidence",
  evidence: "Evidence",
};

// Ordered groups: record kinds first (as cards), evidence/web last (as link cards).
const GROUPS: Array<{ key: "company" | "contact" | "lead" | "evidence"; eyebrow: string; detail: string; tone: Tone }> = [
  { key: "company", eyebrow: "Companies", detail: "Partner and prospect organizations Mark linked.", tone: "blue" },
  { key: "contact", eyebrow: "Contacts", detail: "People associated with this campaign.", tone: "green" },
  { key: "lead", eyebrow: "Leads", detail: "Qualified records driving the outreach.", tone: "amber" },
  { key: "evidence", eyebrow: "Evidence & sources", detail: "External references captured by Mark.", tone: "gray" },
];

function groupOf(source: CampaignWorkspaceSource): "company" | "contact" | "lead" | "evidence" {
  if (source.kind === "company") return "company";
  if (source.kind === "contact") return "contact";
  if (source.kind === "lead") return "lead";
  return "evidence"; // web + evidence
}

export function AudienceLeadsTab({ sources }: { sources: CampaignWorkspaceSource[] }) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No leads, contacts, or source records are linked to this campaign yet.
      </p>
    );
  }

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: sources.filter((source) => groupOf(source) === group.key),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">The records and evidence Mark used to build this campaign.</p>

      {grouped.map((group) => (
        <section key={group.key}>
          <SectionHeader tone={group.tone} eyebrow={group.eyebrow} detail={group.detail} count={group.items.length} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {group.items.map((source) =>
              group.key === "evidence" ? (
                <EvidenceCard key={source.id} source={source} />
              ) : (
                <RecordCard key={source.id} source={source} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function RecordCard({ source }: { source: CampaignWorkspaceSource }) {
  return (
    <article className="flex flex-col rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
      <span className="mb-2 inline-flex w-fit items-center rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {KIND_LABELS[source.kind]}
      </span>
      <h4 className="font-bold text-[var(--text-primary)]">{source.label}</h4>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{source.detail}</p>
      <span className="mt-3 text-xs font-semibold text-[var(--text-muted)]">Record hidden</span>
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

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}
