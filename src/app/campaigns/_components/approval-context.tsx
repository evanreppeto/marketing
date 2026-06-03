import type { CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

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

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Draft Mark produced</div>
        <div className={`overflow-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 ${compact ? "max-h-32" : "max-h-64"}`}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{approval.preview}</p>
        </div>
      </div>

      {hasInputs ? (
        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Prompt inputs</div>
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {approval.promptInputs.map((input) => (
              <div key={input.label} className="min-w-0">
                <dt className="text-xs font-bold text-[var(--text-muted)]">{input.label}</dt>
                <dd className="truncate text-sm text-[var(--text-primary)]" title={input.value}>
                  {input.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Compliance</div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{approval.complianceNotes}</p>
      </div>
    </div>
  );
}
