import Link from "next/link";

import { useAgentName } from "@/app/_components/agent-name-context";
import { buttonClasses, PageHeader, StatusPill } from "@/app/_components/page-header";
import type { CampaignLaunchState, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

export function CampaignHeader({ campaign, launchState }: { campaign: CampaignWorkspaceMeta; launchState: CampaignLaunchState }) {
  const agentName = useAgentName();
  return (
    <PageHeader
      eyebrow="Campaign"
      title={campaign.name}
      description={campaign.objective}
      backHref="/campaigns"
      backLabel="all campaigns"
      aside={
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LIFECYCLE_TONE[launchState.lifecycle]}>{plainLifecycleLabel(launchState.lifecycle, agentName)}</StatusPill>
            {launchState.live ? (
              <StatusPill tone="green">Outbound active</StatusPill>
            ) : launchState.ready ? (
              <StatusPill tone="green">Ready</StatusPill>
            ) : (
              <StatusPill tone="amber">{launchState.pendingCount} to review</StatusPill>
            )}
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Link href="#content" className={buttonClasses({ variant: "primary", size: "sm" })}>
              Review pieces
            </Link>
            <Link href="#send-export" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Send or export
            </Link>
            <Link href="#mark" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Ask {agentName}
            </Link>
          </div>
          <p className="max-w-sm text-xs leading-5 text-[var(--text-muted)] xl:text-right">
            For {cleanPersonaLabel(campaign.persona)} | Updated {campaign.updatedAt}
          </p>
        </div>
      }
    />
  );
}

function cleanPersonaLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}

function plainLifecycleLabel(lifecycle: CampaignLaunchState["lifecycle"], agentName: string) {
  if (lifecycle === "Drafting") return `${agentName} building`;
  if (lifecycle === "In review") return "Needs review";
  if (lifecycle === "Ready") return "Ready to send";
  return "Live";
}
