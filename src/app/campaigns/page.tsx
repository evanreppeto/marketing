import Link from "next/link";

import { connection } from "next/server";

import { buttonClasses, EmptyState, PageHeader, StatStrip, StatusPill, type StatItem } from "../_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getAgentDisplayName, isAgentConfigured } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import type { CampaignManagerView } from "./_components/library-model";

import { ConnectAgentPanel } from "../_components/connect-agent-panel";
import { CampaignLibrary } from "./_components/campaign-library";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Campaigns" };

type CampaignsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  await connection();

  const params = await searchParams;
  const { assistantName } = await getAppSettings();
  const displayName = getAgentDisplayName(assistantName);
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const list = await getCampaignWorkspaceList(undefined, displayName, orgId);

  if (list.status === "unavailable") {
    return (
      <>
        <CampaignsHeader pendingCount={0} agentName={displayName} />
        <EmptyState title="Campaign workspace unavailable" detail={list.message} />
      </>
    );
  }

  const { campaigns } = list;
  const pendingCount = campaigns.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;
  const configured = isAgentConfigured();

  return (
    <>
      <CampaignsHeader pendingCount={pendingCount} agentName={displayName} />

      {campaigns.length > 0 ? (
        <>
          <StatStrip items={buildCampaignKpis(campaigns)} columns={5} />
          <CampaignLibrary campaigns={campaigns} activeView={getViewParam(params.view)} query={getParam(params.q)} agentName={displayName} />
        </>
      ) : configured ? (
        <EmptyState
          title="No campaigns yet"
          detail={`Create one yourself or ask ${displayName} to build a campaign package. Campaigns will show their content, review status, and send/export options here.`}
        />
      ) : (
        <ConnectAgentPanel agentName={displayName} />
      )}
    </>
  );
}

function buildCampaignKpis(campaigns: CampaignWorkspaceListItem[]): StatItem[] {
  const isArchived = (campaign: CampaignWorkspaceListItem) => /archived/i.test(campaign.status);
  const active = campaigns.filter((campaign) => !isArchived(campaign));
  const live = active.filter((campaign) => campaign.lifecycle === "Live").length;
  const awaiting = active.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;
  const ready = active.filter((campaign) => campaign.lifecycle === "Ready").length;
  const archived = campaigns.filter(isArchived).length;
  const pendingPieces = active.reduce((total, campaign) => total + campaign.pendingCount, 0);

  return [
    {
      label: "Live",
      value: active.length,
      hint: "Active campaigns",
      tone: "neutral",
    },
    {
      label: "Awaiting approval",
      value: awaiting,
      hint: pendingPieces > 0 ? `${pendingPieces} to review` : "Nothing waiting",
      tone: awaiting > 0 ? "amber" : "neutral",
    },
    {
      label: "Ready to send",
      value: ready,
      hint: ready > 0 ? "Awaiting launch" : "None ready",
      tone: ready > 0 ? "accent" : "neutral",
    },
    {
      label: "In market",
      value: live,
      hint: live > 0 ? "Running now" : "None live",
      tone: live > 0 ? "ok" : "neutral",
    },
    {
      label: "Archived",
      value: archived,
      hint: "Saved for reuse",
      tone: "neutral",
    },
  ];
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getViewParam(value: string | string[] | undefined): CampaignManagerView {
  const raw = getParam(value);
  if (raw === "all" || raw === "ready-to-send" || raw === "arc-working" || raw === "live" || raw === "archived") return raw;
  if (raw === "needs-attention") return raw;
  return "all";
}

function CampaignsHeader({ pendingCount, agentName }: { pendingCount: number; agentName: string }) {
  return (
    <PageHeader
      eyebrow="Library"
      title="Campaigns"
      description="See each campaign's audience, goal, drafts, messages, and media in one readable place."
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <StatusPill tone="amber" className="bg-transparent">
              {pendingCount} need attention
            </StatusPill>
          ) : (
            <StatusPill tone="green" className="bg-transparent">
              Nothing waiting
            </StatusPill>
          )}
          <Link href="/campaigns/new" className={buttonClasses({ variant: "ghost", size: "sm", className: "rounded-[4px]" })}>
            New campaign
          </Link>
          <Link href="/campaigns/new#ask-arc" className={buttonClasses({ size: "sm", className: "rounded-[4px]" })}>
            Ask {agentName}
          </Link>
        </div>
      }
    />
  );
}
