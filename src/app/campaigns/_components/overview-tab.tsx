import { DetailStack } from "@/app/_components/workspace";
import type { CampaignWorkspaceMeta, CampaignWorkspaceMetrics } from "@/lib/campaigns/read-model";

export function OverviewTab({ campaign, metrics }: { campaign: CampaignWorkspaceMeta; metrics: CampaignWorkspaceMetrics }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Assets", metrics.assets],
          ["Approvals", metrics.approvals],
          ["Media", metrics.media],
          ["Sources", metrics.sources],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-inset)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-2 font-display text-2xl font-black tabular-nums text-[var(--text-primary)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
        <DetailStack
          items={[
            { label: "Objective", value: campaign.objective },
            { label: "Audience", value: campaign.audienceSummary },
            { label: "Offer", value: campaign.offerSummary },
            { label: "Persona", value: campaign.persona },
            { label: "Restoration focus", value: campaign.restorationFocus },
            { label: "Owner", value: campaign.owner },
            { label: "Compliance", value: campaign.complianceNotes },
            { label: "Updated", value: campaign.updatedAt },
          ]}
        />
      </div>
    </div>
  );
}
