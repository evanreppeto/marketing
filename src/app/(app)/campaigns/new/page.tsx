import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { BuilderView } from "./_components/builder-view";
import "./builder.css";

export const metadata = { title: "New campaign — Arc" };

export default async function CampaignBuilderPage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const brandName = ctx?.orgName?.trim() || "Big Shoulders Restoration";
  return <BuilderView brandName={brandName} />;
}
