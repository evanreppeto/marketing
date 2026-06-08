import { PageHeader, StatusPill } from "@/app/_components/page-header";
import type { CampaignLaunchState, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

export function CampaignHeader({ campaign, launchState }: { campaign: CampaignWorkspaceMeta; launchState: CampaignLaunchState }) {
  // Identity-at-a-glance only; the full brief below carries focus, owner, and the rest.
  const meta: Array<[string, string]> = [
    ["Persona", cleanPersonaLabel(campaign.persona)],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <PageHeader
      eyebrow="Campaign"
      title={campaign.name}
      backHref="/campaigns"
      backLabel="campaigns"
      aside={
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LIFECYCLE_TONE[launchState.lifecycle]}>{launchState.lifecycle}</StatusPill>
            {launchState.live ? (
              <StatusPill tone="green">Outbound unlocked</StatusPill>
            ) : (
              <StatusPill tone="amber">Outbound locked</StatusPill>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {meta.map(([label, value]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs"
              >
                <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold text-[var(--text-primary)]">{value}</span>
              </span>
            ))}
          </div>
        </div>
      }
    />
  );
}

function cleanPersonaLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
