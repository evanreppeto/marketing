import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";

import { CampaignGallery } from "./_components/campaign-gallery";
import { CampaignTriageStrip } from "./_components/campaign-triage-strip";

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
        <>
          <CampaignTriageStrip campaigns={campaigns} />
          <CampaignGallery
            campaigns={campaigns}
            page={parsePositiveInt(getParam(params.page), 1)}
            pageSize={parsePageSize(getParam(params.pageSize))}
            persona={getParam(params.persona) || "All"}
            query={getParam(params.q)}
            status={getParam(params.status) || "All"}
            sort={getParam(params.sort) || "recent"}
            view={getParam(params.view) || "cards"}
          />
        </>
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

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string) {
  const parsed = parsePositiveInt(value, 12);
  return [12, 24, 48].includes(parsed) ? parsed : 12;
}

function CampaignsHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <PageHeader
      eyebrow="Campaign command"
      title="Campaigns"
      description="Every package Mark drafts. Inspect the reasoning and source records, then approve - outbound stays locked until you do."
      aside={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <StatusPill tone="amber">{pendingCount} awaiting approval</StatusPill>
          ) : (
            <StatusPill tone="green">All decided</StatusPill>
          )}
          <StatusPill tone="amber">Outbound locked</StatusPill>
        </div>
      }
    />
  );
}
