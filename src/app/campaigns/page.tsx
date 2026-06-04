import { connection } from "next/server";

import { EmptyState, StatusPill } from "../_components/page-header";
import { MetricStrip } from "../_components/workspace";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";

import { CampaignGallery } from "./_components/campaign-gallery";
import { SlimHeader } from "./_components/slim-header";

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
        <SlimHeader title="Campaigns" subtitle="Everything Mark builds; outbound stays locked." />
        <EmptyState title="Campaign workspace unavailable" detail={list.message} />
      </>
    );
  }

  const { campaigns, totals } = list;
  const pendingCount = campaigns.filter((campaign) => campaign.lifecycle === "In review").length;

  return (
    <>
      <CampaignCommandHeader pendingCount={pendingCount} />

      <MetricStrip
        metrics={[
          { label: "Campaigns", value: totals.campaigns, detail: "Drafted or active", tone: totals.campaigns > 0 ? "blue" : "gray" },
          { label: "Assets", value: totals.assets, detail: "Email, SMS, ads, print, media", tone: totals.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: totals.approvals, detail: "Human-gate records", tone: totals.approvals > 0 ? "amber" : "green" },
          { label: "Media", value: totals.media, detail: "Images, video, files, links", tone: totals.media > 0 ? "blue" : "gray" },
        ]}
      />

      {campaigns.length > 0 ? (
        <CampaignGallery
          campaigns={campaigns}
          page={parsePositiveInt(getParam(params.page), 1)}
          pageSize={parsePageSize(getParam(params.pageSize))}
          persona={getParam(params.persona) || "All"}
          query={getParam(params.q)}
          status={getParam(params.status) || "All"}
        />
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

function CampaignCommandHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <header className="module-rise mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <span className="signal-eyebrow">Campaign command</span>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">Campaigns</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
          Every package Mark drafts. Inspect the reasoning and source records, then approve — outbound stays locked until you do.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {pendingCount > 0 ? (
          <StatusPill tone="amber">{pendingCount} awaiting approval</StatusPill>
        ) : (
          <StatusPill tone="green">All decided</StatusPill>
        )}
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>
    </header>
  );
}
