import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspaceDetail } from "@/lib/campaigns/read-model";

import { CampaignDetailView } from "./_components/campaign-detail-view";
import "./campaign.css";

export const metadata = { title: "Campaign — Arc" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const orgId = (await getCurrentWorkspaceContext()).orgId;
  const detail = await getCampaignWorkspaceDetail(decodeURIComponent(campaignId), undefined, "Arc", orgId);

  if (detail.status === "not_found") notFound();
  if (detail.status !== "live") {
    return (
      <div className="arc-campaign">
        <div className="cband">
          <Link className="back" href="/campaigns">
            <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: '<path d="M15 5l-7 7 7 7"/>' }} />
            Back to Campaigns
          </Link>
          <p style={{ padding: "24px 4px", color: "var(--muted)" }}>{detail.message}</p>
        </div>
      </div>
    );
  }

  return <CampaignDetailView detail={detail} />;
}
