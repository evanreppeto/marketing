import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

import { DecisionControls } from "./decision-controls";
import { statusTone } from "./status-tone";

function isDecided(status: string) {
  return /approved|declined|archived|rejected/i.test(status);
}

export function ApprovalsTab({ approvals, campaignId }: { approvals: CampaignWorkspaceApproval[]; campaignId: string }) {
  if (approvals.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No approval items are attached to this campaign yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Approve, decline, or archive each item. Decisions are recorded as backend state transitions; outbound stays locked. To
        request changes with an instruction, use the Mark rail.
      </p>
      <ul className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        {approvals.map((approval) => (
          <li key={approval.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate font-semibold text-[var(--text-primary)]">{approval.title}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {approval.type} / risk {approval.riskLevel} / by {approval.requestedBy} / {approval.submittedAt}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isDecided(approval.status) ? (
                <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
              ) : (
                <DecisionControls approvalItemId={approval.id} campaignId={campaignId} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
