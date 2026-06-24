import Link from "next/link";

import { connection } from "next/server";

import { buttonClasses, EmptyState, StatusPill } from "../_components/page-header";
import { DossierPanel, MetricBand, MetricCell, WorkbenchFrame } from "../_components/workbench";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getAgentDisplayName, isAgentConfigured } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import type { CampaignManagerView } from "./_components/library-model";

import { ConnectAgentPanel } from "../_components/connect-agent-panel";
import { CampaignLibrary } from "./_components/campaign-library";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Campaigns" };

type CampaignsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  await connection();

  const params = await searchParams;
  const { assistantName } = await getAppSettings();
  const displayName = getAgentDisplayName(assistantName);
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const list = await getCampaignWorkspaceList(undefined, displayName, orgId);

  if (list.status === "unavailable") {
    return (
      <CampaignsFrame agentName={displayName} campaigns={[]}>
        <EmptyState title="Campaign workspace unavailable" detail={list.message} />
      </CampaignsFrame>
    );
  }

  const { campaigns } = list;
  const configured = isAgentConfigured();

  return (
    <CampaignsFrame agentName={displayName} campaigns={campaigns}>
      {campaigns.length > 0 ? (
        <>
          <MetricBand>
            {buildCampaignKpis(campaigns).map((item) => (
              <MetricCell key={item.label} label={item.label} value={item.value} delta={item.hint} tone={item.tone} />
            ))}
          </MetricBand>
          <CampaignLibrary campaigns={campaigns} activeView={getViewParam(params.view)} query={getParam(params.q)} agentName={displayName} />
        </>
      ) : configured ? (
        <EmptyState
          title="No campaigns yet"
          detail={`Create one yourself or ask ${displayName} to build a campaign package. Campaigns will show their content, review status, and send/export options here.`}
        />
      ) : (
        <ConnectAgentPanel agentName={displayName} />
      )}
    </CampaignsFrame>
  );
}

function buildCampaignKpis(campaigns: CampaignWorkspaceListItem[]): Array<{
  hint: string;
  label: string;
  tone?: "neutral" | "accent" | "ok" | "risk";
  value: React.ReactNode;
}> {
  const isArchived = (campaign: CampaignWorkspaceListItem) => /archived/i.test(campaign.status);
  const active = campaigns.filter((campaign) => !isArchived(campaign));
  const live = active.filter((campaign) => campaign.lifecycle === "Live").length;
  const awaiting = active.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;
  const ready = active.filter((campaign) => campaign.lifecycle === "Ready").length;
  const pendingPieces = active.reduce((total, campaign) => total + campaign.pendingCount, 0);

  return [
    {
      label: "Live",
      value: active.length,
      hint: "Active campaigns",
      tone: "neutral",
    },
    {
      label: "Awaiting approval",
      value: awaiting,
      hint: pendingPieces > 0 ? `${pendingPieces} to review` : "Nothing waiting",
      tone: awaiting > 0 ? "accent" : "neutral",
    },
    {
      label: "Ready to send",
      value: ready,
      hint: ready > 0 ? "Awaiting launch" : "None ready",
      tone: ready > 0 ? "accent" : "neutral",
    },
    {
      label: "In market",
      value: live,
      hint: live > 0 ? "Running now" : "None live",
      tone: live > 0 ? "ok" : "neutral",
    },
  ];
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getViewParam(value: string | string[] | undefined): CampaignManagerView {
  const raw = getParam(value);
  if (raw === "all" || raw === "ready-to-send" || raw === "arc-working" || raw === "live" || raw === "archived") return raw;
  if (raw === "needs-attention") return raw;
  return "all";
}

function CampaignsFrame({
  agentName,
  campaigns,
  children,
}: {
  agentName: string;
  campaigns: CampaignWorkspaceListItem[];
  children: React.ReactNode;
}) {
  return (
    <WorkbenchFrame
      actions={
        <>
          <Link href="/campaigns/new" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            New campaign
          </Link>
          <Link href="/campaigns/new#ask-arc" className={buttonClasses({ size: "sm" })}>
            Ask {agentName}
          </Link>
        </>
      }
      aside={<CampaignOperationsDossier campaigns={campaigns} agentName={agentName} />}
      eyebrow="Campaigns"
      title="Campaigns"
      description="Campaign operations queue for audiences, drafts, media, approval locks, and launch readiness."
    >
      {children}
    </WorkbenchFrame>
  );
}

function CampaignOperationsDossier({
  agentName,
  campaigns,
}: {
  agentName: string;
  campaigns: CampaignWorkspaceListItem[];
}) {
  const selected = campaigns.find((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review") ?? campaigns[0] ?? null;
  const active = campaigns.filter((campaign) => !/archived/i.test(campaign.status));
  const pendingPieces = active.reduce((total, campaign) => total + campaign.pendingCount, 0);

  return (
    <DossierPanel title="Campaign operations">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <DossierStat label="Active" value={active.length} />
          <DossierStat label="To review" value={pendingPieces} tone={pendingPieces > 0 ? "accent" : "ok"} />
        </div>
        {selected ? (
          <div className="overflow-hidden rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
            {selected.thumbnailUrl ? (
              <div className="aspect-[16/9] bg-[var(--surface-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- campaign media preview can be external/user supplied. */}
                <img alt="" className="h-full w-full object-cover" src={selected.thumbnailUrl} />
              </div>
            ) : (
              <div className="aspect-[16/9] bg-[radial-gradient(80%_90%_at_85%_20%,rgba(211,170,75,0.16),transparent_52%),linear-gradient(135deg,var(--surface-inset),var(--surface-soft))] p-5">
                <div className="font-display text-sm font-semibold text-[var(--accent-contrast)]">Arc</div>
                <div className="mt-8 max-w-[14rem] font-display text-2xl font-semibold leading-[1.05] text-[var(--text-primary)]">
                  Selected campaign packet
                </div>
              </div>
            )}
            <div className="p-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">Selected packet</div>
              <h2 className="mt-2 text-base font-semibold leading-6 text-[var(--text-primary)]">{selected.name}</h2>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
                {selected.objective || selected.audienceSummary || "Open the packet to review audience, offer, draft pieces, and launch status."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone={selected.pendingCount > 0 ? "amber" : selected.lifecycle === "Live" ? "green" : "gray"}>
                  {selected.lifecycle}
                </StatusPill>
                <StatusPill tone="gray">{selected.contentPieces.length} pieces</StatusPill>
                <StatusPill tone="gray">{selected.mediaCount} media</StatusPill>
              </div>
              <Link className={buttonClasses({ variant: "primary", size: "sm", className: "mt-4 w-full" })} href={selected.href}>
                Open packet
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Create a campaign manually or ask {agentName} to prepare a packet for review.
          </p>
        )}
        <div className="rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
          <div className="text-[11px] font-semibold text-[var(--accent-contrast)]">Arc recommendation</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">
            Keep approvals separate from launch. Review each packet, then send only after the operator lock is clear.
          </p>
        </div>
      </div>
    </DossierPanel>
  );
}

function DossierStat({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "accent" | "ok";
  value: React.ReactNode;
}) {
  const valueClass = tone === "ok" ? "text-[var(--ok-text)]" : tone === "accent" ? "text-[var(--accent-contrast)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className={`font-display text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
