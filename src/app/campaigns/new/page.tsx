import { requireOperator } from "@/lib/auth/operator";
import { getMarkDisplayName } from "@/lib/mark-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";

import { PageHeader } from "../../_components/page-header";
import { CampaignCreateForm } from "../_components/campaign-create-form";

export default async function NewCampaignPage() {
  await requireOperator();
  const { workspaceName } = await getAppSettings();
  const assistantName = getMarkDisplayName();

  return (
    <>
      <PageHeader
        eyebrow="Start marketing"
        title="What should we make?"
        description={`Tell ${assistantName} what ${workspaceName || "your business"} needs. It can become a campaign, email, ad, flyer, partner outreach, lead list, CRM follow-up, or whatever marketing work makes sense.`}
        backHref="/campaigns"
        backLabel="all campaigns"
      />
      <CampaignCreateForm assistantName={assistantName} businessName={workspaceName || "your business"} />
    </>
  );
}
