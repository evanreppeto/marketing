import { requireOperator } from "@/lib/auth/operator";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";

import { PageHeader } from "../../_components/page-header";
import { CampaignCreateForm } from "../_components/campaign-create-form";

export default async function NewCampaignPage() {
  await requireOperator();
  const { assistantName: assistantNameSetting, workspaceName } = await getAppSettings();
  const assistantName = getAgentDisplayName(assistantNameSetting);

  return (
    <>
      <PageHeader
        eyebrow="New campaign"
        title="Create a campaign"
        description={`Set up marketing for ${workspaceName || "your business"} manually, or ask ${assistantName} to help draft the campaign if you are not sure where to start.`}
        backHref="/campaigns"
        backLabel="all campaigns"
      />
      <CampaignCreateForm assistantName={assistantName} businessName={workspaceName || "your business"} />
    </>
  );
}
