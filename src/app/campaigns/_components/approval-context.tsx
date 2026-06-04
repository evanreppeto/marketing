import type { CampaignMediaAsset, CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

/**
 * Presentational decision context for one approval: the draft Mark produced,
 * the prompt inputs behind it, and compliance notes. Shared by the overview
 * stepper and the Approvals tab so "why am I approving this" reads the same
 * everywhere. Pure — no state, no actions.
 */
export function ApprovalContext({
  approval,
  compact = false,
}: {
  approval: CampaignWorkspaceApproval;
  compact?: boolean;
}) {
  const hasInputs = approval.promptInputs.length > 0;
  const hasMedia = approval.media.length > 0;

  return (
    <div className="space-y-2.5">
      <div className={`grid gap-2.5 ${hasMedia ? "lg:grid-cols-[minmax(230px,0.78fr)_minmax(0,1fr)]" : ""}`}>
        {hasMedia ? (
          <div>
            <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Produced preview</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {approval.media.slice(0, 4).map((media) => (
                <ApprovalMediaTile key={media.id} media={media} />
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Draft Mark produced</div>
          <div className={`overflow-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-2.5 ${compact ? "max-h-28" : "max-h-40"}`}>
            <p className="whitespace-pre-wrap text-sm leading-5 text-[var(--text-secondary)]">{approval.preview}</p>
          </div>
        </div>
      </div>

      {hasInputs ? (
        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Prompt inputs</div>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {approval.promptInputs.map((input) => (
              <div key={input.label} className="min-w-0">
                <dt className="text-[11px] font-bold text-[var(--text-muted)]">{input.label}</dt>
                <dd className="truncate text-sm font-semibold text-[var(--text-primary)]" title={input.value}>
                  {input.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Compliance</div>
        <p className="text-sm leading-5 text-[var(--text-secondary)]">{approval.complianceNotes}</p>
      </div>
    </div>
  );
}

function ApprovalMediaTile({ media }: { media: CampaignMediaAsset }) {
  const label = media.type === "embed" ? "Video" : media.type === "file" ? "File" : media.type === "link" ? "Link" : media.type;

  if (media.type === "image") {
    return (
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]"
        title={media.description ?? media.title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
        <img src={media.thumbnailUrl ?? media.url} alt={media.title} className="h-24 w-full object-cover transition group-hover:scale-[1.02]" />
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        controls
        className="h-24 w-full rounded-lg border border-[var(--border-hairline)] bg-black object-cover"
      />
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-24 flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
      title={media.description ?? media.title}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <span className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{media.title}</span>
      <span className="truncate text-xs font-semibold text-[var(--accent)]">Open original</span>
    </a>
  );
}
