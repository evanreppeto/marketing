import { StatusPill } from "@/app/_components/page-header";
import type { CampaignDecisionEvent, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type DispatchView } from "@/lib/dispatch/status";

import { AuditLog } from "./audit-log";
import { CampaignActionHub } from "./campaign-action-hub";
import { CampaignChecklist } from "./campaign-checklist";
import { CampaignContentTable } from "./campaign-content-table";
import { buildCampaignActionHub, buildCampaignChecklist } from "./campaign-detail-model";
import { CampaignHeader } from "./campaign-header";
import { CampaignRightRail } from "./campaign-right-rail";
import { MarkConversation } from "./mark-conversation";

export function CampaignWorkspace({ detail, dispatches = [] }: { detail: LiveCampaignWorkspace; dispatches?: DispatchView[] }) {
  const steps = buildCampaignChecklist(detail);
  const actionHub = buildCampaignActionHub(detail, dispatches.length);

  return (
    <div className="space-y-5">
      <CampaignHeader campaign={detail.campaign} launchState={detail.launchState} />

      <CampaignActionHub hub={actionHub} />

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
              <DecisionHistoryPanel history={detail.approvalHistory} />
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

function DecisionHistoryPanel({ history }: { history: CampaignDecisionEvent[] }) {
  const shown = history.slice(0, 8);

  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <span className="signal-eyebrow">Past decisions</span>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">What your team decided</h2>
          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">{history.length}</span>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          No decisions yet. Approve a piece or ask Mark for changes and it will appear here.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border-hairline)]">
          {shown.map((event) => (
            <li key={event.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={event.tone}>{event.action}</StatusPill>
                  <span className="min-w-0 font-semibold text-[var(--text-primary)]">{event.itemTitle}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                  {event.decidedBy} | {event.at}
                </p>
                {event.notes ? <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{event.notes}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {history.length > shown.length ? (
        <p className="border-t border-[var(--border-hairline)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)]">
          Showing latest {shown.length} of {history.length} decisions.
        </p>
      ) : null}
    </section>
  );
}
