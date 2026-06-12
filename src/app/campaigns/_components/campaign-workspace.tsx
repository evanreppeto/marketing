import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type DispatchView } from "@/lib/dispatch/status";

import { AuditLog } from "./audit-log";
import { CampaignChecklist } from "./campaign-checklist";
import { CampaignContentTable } from "./campaign-content-table";
import { buildCampaignChecklist } from "./campaign-detail-model";
import { CampaignHeader } from "./campaign-header";
import { CampaignRightRail } from "./campaign-right-rail";
import { MarkConversation } from "./mark-conversation";

export function CampaignWorkspace({ detail, dispatches = [] }: { detail: LiveCampaignWorkspace; dispatches?: DispatchView[] }) {
  const steps = buildCampaignChecklist(detail);

  return (
    <div className="space-y-5">
      <CampaignHeader campaign={detail.campaign} launchState={detail.launchState} />

      <CampaignChecklist steps={steps} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <CampaignContentTable detail={detail} />

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3.5 transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]">
              <div>
                <span className="signal-eyebrow">History</span>
                <h2 className="mt-1 text-sm font-bold text-[var(--text-primary)]">What happened so far</h2>
              </div>
              <span className="font-mono text-xs font-bold text-[var(--text-muted)] transition group-open:text-[var(--accent)]">
                <span className="group-open:hidden">Open</span>
                <span className="hidden group-open:inline">Close</span>
              </span>
            </summary>
            <div className="mt-4 space-y-5">
              <MarkConversation campaignId={detail.campaign.id} conversation={detail.markConversation} reasoning={detail.reasoning} />
              <AuditLog entries={detail.auditLog} />
            </div>
          </details>
        </div>

        <CampaignRightRail detail={detail} dispatches={dispatches} />
      </div>
    </div>
  );
}
