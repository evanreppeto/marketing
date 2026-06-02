import Link from "next/link";

import type { CampaignWorkspaceSource } from "@/lib/campaigns/read-model";

const KIND_LABELS: Record<CampaignWorkspaceSource["kind"], string> = {
  company: "Company",
  contact: "Contact",
  lead: "Lead",
  web: "Evidence",
  evidence: "Evidence",
};

export function AudienceLeadsTab({ sources }: { sources: CampaignWorkspaceSource[] }) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No leads, contacts, or source records are linked to this campaign yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">The records and evidence Mark used to build this campaign.</p>
      <ul className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        {sources.map((source) => (
          <li key={source.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {KIND_LABELS[source.kind]}
                </span>
                <span className="truncate font-semibold text-[var(--text-primary)]">{source.label}</span>
              </div>
              <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">{source.detail}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <RecordLink source={source} />
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--accent)]">
                  Source
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordLink({ source }: { source: CampaignWorkspaceSource }) {
  const recordId = source.id.replace(/^(company|contact|lead)-/, "");
  const href =
    source.kind === "company"
      ? `/crm/companies/${recordId}`
      : source.kind === "contact"
        ? `/crm/contacts/${recordId}`
        : source.kind === "lead"
          ? `/crm/leads/${recordId}`
          : null;

  return href ? (
    <Link href={href} className="text-sm font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]">
      Record
    </Link>
  ) : null;
}
