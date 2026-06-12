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
  const list = await getCampaignWorkspaceList();

  if (list.status === "unavailable") {
    return (
      <>
        <CampaignsHeader pendingCount={0} />
        <EmptyState title="Campaign workspace unavailable" detail={list.message} />
      </>
    );
  }

  const { campaigns } = list;
  const pendingCount = campaigns.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;
  const configured = isAgentConfigured();
  const { agentName } = await getAppSettings();
  const displayName = getAgentDisplayName(agentName);

  return (
    <>
      <CampaignsHeader pendingCount={pendingCount} />

      {campaigns.length > 0 ? (
        <CampaignLibrary campaigns={campaigns} activeView={getViewParam(params.view)} query={getParam(params.q)} />
      ) : configured ? (
        <EmptyState
          title="No campaigns yet"
          detail="Create one yourself or ask Mark to build a campaign package. Campaigns will show their content, review status, and send/export options here."
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
  return "needs-attention";
}

function CampaignsHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <PageHeader
      eyebrow="Campaign manager"
      title="Campaigns"
      description="Manage all campaigns, content, approvals, and send/export steps from one place."
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? <StatusPill tone="amber">{pendingCount} need attention</StatusPill> : <StatusPill tone="green">Nothing waiting</StatusPill>}
          <Link href="/campaigns/new" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Create campaign
          </Link>
          <Link href="/campaigns/new?mode=mark" className={buttonClasses({ size: "sm" })}>
            Ask Mark
          </Link>
        </div>
      }
    />
  );
}
