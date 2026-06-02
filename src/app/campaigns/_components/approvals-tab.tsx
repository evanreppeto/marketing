import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

import { statusTone } from "./status-tone";

export function ApprovalsTab({ approvals }: { approvals: CampaignWorkspaceApproval[] }) {
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
        Human-gate records for this campaign. Decisions are made in the approval queue.
      </p>
      <ul className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        {approvals.map((approval) => (
          <li key={approval.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-[var(--text-primary)]">{approval.title}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {approval.type} · risk {approval.riskLevel} · by {approval.requestedBy} · {approval.submittedAt}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
              <Link href={approval.href} className="text-sm font-semibold text-[var(--accent)]">
                Review ↗
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
