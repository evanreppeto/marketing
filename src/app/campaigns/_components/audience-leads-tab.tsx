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
      <p className="text-sm text-[var(--text-secondary)]">
        The records and evidence Mark used to build this campaign.
      </p>
      <ul className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {KIND_LABELS[source.kind]}
                </span>
                <span className="truncate font-semibold text-[var(--text-primary)]">{source.label}</span>
              </div>
              <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">{source.detail}</div>
            </div>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-[var(--accent)]">
                Open ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
