import { requireOperator } from "@/lib/auth/operator";

import { PageHeader } from "../../_components/page-header";
import { CampaignCreateForm } from "../_components/campaign-create-form";

export default async function NewCampaignPage() {
  await requireOperator();

  return (
    <>
      <PageHeader
        eyebrow="Campaign command"
        title="New campaign"
        description="Author a campaign by hand: a title, who it's for, the audience and offer, and any reference photos. Save it as a draft, deploy it yourself, or point Mark at it later."
        backHref="/campaigns"
        backLabel="campaigns"
      />
      <CampaignCreateForm />
    </>
  );
}
