import Link from "next/link";

import { connection } from "next/server";

import { buttonClasses, EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getAgentDisplayName, isAgentConfigured } from "@/lib/mark-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import type { CampaignManagerView } from "./_components/library-model";

import { ConnectAgentPanel } from "../_components/connect-agent-panel";
import { CampaignLibrary } from "./_components/campaign-library";

type CampaignsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  await connection();

  const params = await searchParams;
  const { assistantName } = await getAppSettings();
  const displayName = getAgentDisplayName(assistantName);
  const list = await getCampaignWorkspaceList(undefined, displayName);

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
        <CampaignLibrary campaigns={campaigns} activeView={getViewParam(params.view)} query={getParam(params.q)} agentName={displayName} />
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

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getViewParam(value: string | string[] | undefined): CampaignManagerView {
  const raw = getParam(value);
  if (raw === "all" || raw === "ready-to-send" || raw === "mark-working" || raw === "live" || raw === "archived") return raw;
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
          {pendingCount > 0 ? <StatusPill tone="amber">{pendingCount} need attention</StatusPill> : <StatusPill tone="green">Nothing waiting</StatusPill>}
          <Link href="/campaigns/new" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            New campaign
          </Link>
          <Link href="/campaigns/new#ask-mark" className={buttonClasses({ size: "sm" })}>
            Ask {agentName}
          </Link>
        </div>
      }
    />
  );
}
