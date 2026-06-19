import { connection } from "next/server";

import { EmptyState, PageHeader } from "../../_components/page-header";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getConnections } from "@/lib/connections/read-model";
import { getCampaignDispatches } from "@/lib/dispatch/read-model";
import { getCampaignPerformance } from "@/lib/performance/campaign-performance";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { CampaignSimpleDetail } from "../_components/campaign-simple-detail";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  await connection();

  const { campaignId } = await params;
  const { assistantName } = await getAppSettings();
  const agentName = getAgentDisplayName(assistantName);
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const [detail, connections, dispatches, performance] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId, undefined, agentName, orgId),
    getConnections(),
    getCampaignDispatches(campaignId),
    getCampaignPerformance(campaignId),
  ]);

  if (detail.status !== "live") {
    const notFound = detail.status === "not_found";
    return (
      <>
        <PageHeader
          eyebrow="Campaign"
          title={notFound ? "Campaign not found" : "Campaign unavailable"}
          backHref="/campaigns"
          backLabel="campaigns"
        />
        <EmptyState
          title={notFound ? "We couldn't find that campaign" : "Campaign workspace unavailable"}
          detail={
            notFound
              ? "This campaign does not exist in the Arc database, or it was removed."
              : detail.message
          }
        />
      </>
    );
  }

  return (
    <CampaignSimpleDetail
      detail={detail}
      agentName={agentName}
      connections={connections}
      dispatches={dispatches}
      performance={performance}
    />
  );
}
