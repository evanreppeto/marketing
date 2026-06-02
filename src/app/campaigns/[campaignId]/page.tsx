import { connection } from "next/server";

import { WorkspaceHeader } from "../../_components/workspace";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";

import { CampaignWorkspace } from "../_components/campaign-workspace";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  await connection();

  const { campaignId } = await params;
  const detail = await getCampaignWorkspaceDetail(campaignId);

  if (detail.status !== "live") {
    return (
      <WorkspaceHeader
        eyebrow="Campaign"
        title={detail.status === "not_found" ? "Campaign not found." : "Campaign unavailable."}
        description={
          detail.status === "not_found"
            ? "This campaign does not exist in the Growth Engine database, or it was removed."
            : detail.message
        }
        status={detail.status === "not_found" ? "Missing" : "Supabase unavailable"}
        statusTone={detail.status === "not_found" ? "red" : "amber"}
        primary={{ label: "Back to campaigns", href: "/campaigns" }}
      />
    );
  }

  return <CampaignWorkspace detail={detail} />;
}
