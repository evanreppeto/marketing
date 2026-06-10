import Link from "next/link";

import { connection } from "next/server";

import { buttonClasses, EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";

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
  const pendingCount = campaigns.filter((campaign) => campaign.lifecycle === "In review").length;

  return (
    <>
      <CampaignsHeader pendingCount={pendingCount} />

      {campaigns.length > 0 ? (
        <CampaignLibrary campaigns={campaigns} activeStatus={getParam(params.status)} />
      ) : (
        <EmptyState
          title="No campaigns yet"
          detail="When Mark drafts a campaign it appears here with its creative, the leads and reasoning behind it, and a human-gate approval record. Outbound stays locked until you approve."
        />
      )}
    </>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function CampaignsHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <PageHeader
      eyebrow="Library"
      title="Campaigns"
      description="Everything Mark has drafted, live, or archived. Open one to review its work and approve — outbound stays locked until you do."
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <StatusPill tone="amber">{pendingCount} awaiting you</StatusPill>
          ) : (
            <StatusPill tone="green">All decided</StatusPill>
          )}
          <Link href="/campaigns/new" className={buttonClasses({ size: "sm" })}>
            ＋ Ask Mark to build one
          </Link>
        </div>
      }
    />
  );
}
