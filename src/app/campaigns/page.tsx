import { connection } from "next/server";

import { EmptyState } from "../_components/page-header";
import { MetricStrip, WorkspaceHeader } from "../_components/workspace";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";

import { CampaignGallery } from "./_components/campaign-gallery";

export default async function CampaignsPage() {
  await connection();

  const list = await getCampaignWorkspaceList();

  if (list.status === "unavailable") {
    return (
      <>
        <WorkspaceHeader
          eyebrow="Campaigns"
          title="Every campaign Mark builds lives here."
          description="Preview the creative, trace the leads and reasoning behind each one, and ask Mark to revise — outbound stays locked."
          status="Supabase unavailable"
          statusTone="amber"
        />
        <EmptyState
          title="Campaign workspace unavailable"
          detail={list.message}
        />
      </>
    );
  }

  const { campaigns, totals } = list;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Campaigns"
        title="Every campaign Mark builds lives here."
        description="Preview the creative, trace the leads and reasoning behind each one, and ask Mark to revise — outbound stays locked."
        status={totals.campaigns > 0 ? `${totals.campaigns} campaigns` : "No campaigns yet"}
        statusTone={totals.campaigns > 0 ? "green" : "gray"}
      />

      <MetricStrip
        metrics={[
          { label: "Campaigns", value: totals.campaigns, detail: "Drafted or active", tone: totals.campaigns > 0 ? "blue" : "gray" },
          { label: "Assets", value: totals.assets, detail: "Email, SMS, ads, print, media", tone: totals.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: totals.approvals, detail: "Human-gate records", tone: totals.approvals > 0 ? "amber" : "green" },
          { label: "Media", value: totals.media, detail: "Images, video, files, links", tone: totals.media > 0 ? "blue" : "gray" },
        ]}
      />

      {campaigns.length > 0 ? (
        <CampaignGallery campaigns={campaigns} />
      ) : (
        <EmptyState
          title="No campaigns yet"
          detail="When Mark drafts a campaign it appears here with its creative, the leads and reasoning behind it, and a human-gate approval record. Outbound stays locked until you approve."
        />
      )}
    </>
  );
}
