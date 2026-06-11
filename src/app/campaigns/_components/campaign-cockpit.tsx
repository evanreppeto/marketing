"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { buttonClasses } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type DispatchView } from "@/lib/dispatch/status";
import type { CampaignEconomicsReadModel } from "@/lib/performance/attribution-read-model";

import { ApprovalsTab } from "./approvals-tab";
import { AudienceLeadsTab } from "./audience-leads-tab";
import { AuditLog } from "./audit-log";
import { CampaignEconomicsPanel } from "./campaign-economics-panel";
import { CampaignHeader } from "./campaign-header";
import { CampaignMediaBoard } from "./campaign-media-board";
import { FullBrief, LaunchTracker } from "./campaign-package-panel";
import { CockpitRail } from "./cockpit-rail";
import { DRAWER_KEYS, type DrawerKey, drawerForUrl } from "./cockpit-drawers";
import { CreativeTab } from "./creative-tab";
import { DispatchPanel } from "./dispatch-panel";
import { MarkConversation } from "./mark-conversation";
import { PerformanceTab } from "./performance-tab";
import { WorkspaceDrawer } from "./workspace-drawer";

/**
 * The Decision Cockpit. One screen — header, launch tracker, a row of drawer
 * triggers, then the creative beside a context rail — with every secondary
 * surface (reasoning, decision log, measurement, audit, dispatch, media,
 * economics, full brief) living in a single right-anchored drawer. Replaces the
 * old 7-tab workspace; it rearranges the same component call sites, preserving
 * per-piece approval, launch, deep-linkable `?item=`, and filter state.
 */
export function CampaignCockpit({
  detail,
  dispatches,
  economics,
  agentName,
}: {
  detail: LiveCampaignWorkspace;
  dispatches: DispatchView[];
  economics: CampaignEconomicsReadModel;
  agentName: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Drawer + focused item are derived from the URL so the cockpit is
  // deep-linkable, refresh-safe, and back/forward navigable. A bare ?item=…
  // (shared link) opens the read-only Decision log scrolled to that record.
  const filterParam = searchParams.get("filter");
  const focusItem = searchParams.get("item");
  const focus = focusItem ? { id: focusItem, nonce: 0 } : null;
  const drawer = drawerForUrl({ drawer: searchParams.get("drawer"), item: focusItem });

  function buildHref(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // pushState for navigation (opening/closing a drawer) so the back button
  // steps through it; replaceState for refinements (filters) so they stay
  // shareable without flooding history. Both keep useSearchParams in sync with
  // no server refetch.
  function writeParams(updates: Record<string, string | null>) {
    window.history.pushState(null, "", buildHref(updates));
  }

  function replaceParams(updates: Record<string, string | null>) {
    window.history.replaceState(null, "", buildHref(updates));
  }

  function openDrawer(key: DrawerKey) {
    writeParams({ drawer: key, item: null });
  }

  function closeDrawer() {
    writeParams({ drawer: null, item: null });
  }

  const DRAWER_TITLES: Record<DrawerKey, string> = {
    reasoning: `Talk to ${agentName}`,
    approvals: "Decision log",
    performance: "Measurement",
    audit: "Audit",
    dispatch: "Dispatch",
    media: "Media",
    economics: "Economics",
    brief: "Full brief",
  };

  const triggers: Array<{ key: DrawerKey; label: string; count?: number }> = [
    { key: "reasoning", label: `Talk to ${agentName}`, count: detail.markConversation.length },
    { key: "approvals", label: "Decision log", count: detail.approvals.length },
    { key: "performance", label: "Measurement" },
    { key: "audit", label: "Audit", count: detail.auditLog.length },
    { key: "dispatch", label: "Dispatch", count: dispatches.length },
    { key: "media", label: "Media", count: detail.media.length },
    { key: "economics", label: "Economics" },
    { key: "brief", label: "Full brief" },
  ];
  // Render in canonical drawer order.
  const orderedTriggers = DRAWER_KEYS.map((key) => triggers.find((t) => t.key === key)!);

  return (
    <>
      <CampaignHeader campaign={detail.campaign} launchState={detail.launchState} />

      <LaunchTracker campaignId={detail.campaign.id} launchState={detail.launchState} onReviewPieces={() => {}} />

      <nav aria-label="Campaign details" className="module-rise mb-5 mt-5 flex flex-wrap gap-2">
        {orderedTriggers.map((trigger) => (
          <button
            key={trigger.key}
            type="button"
            onClick={() => openDrawer(trigger.key)}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            {trigger.label}
            {typeof trigger.count === "number" ? (
              <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-muted)]">{trigger.count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CreativeTab
          groups={detail.groupedAssets}
          campaignId={detail.campaign.id}
          filter={filterParam}
          onFilterChange={(value) => replaceParams({ filter: value })}
        />
        <CockpitRail detail={detail} />
      </div>

      <WorkspaceDrawer open={drawer != null} title={DRAWER_TITLES[drawer ?? "approvals"]} onClose={closeDrawer}>
        {drawer === "reasoning" ? (
          <MarkConversation campaignId={detail.campaign.id} conversation={detail.markConversation} reasoning={detail.reasoning} />
        ) : null}
        {drawer === "approvals" ? (
          <ApprovalsTab approvals={detail.approvals} history={detail.approvalHistory} focus={focus} />
        ) : null}
        {drawer === "performance" ? <PerformanceTab detail={detail} /> : null}
        {drawer === "audit" ? <AuditLog entries={detail.auditLog} /> : null}
        {drawer === "dispatch" ? <DispatchPanel dispatches={dispatches} /> : null}
        {drawer === "media" ? (
          <CampaignMediaBoard media={detail.media} filter={filterParam} onFilterChange={(value) => replaceParams({ filter: value })} />
        ) : null}
        {drawer === "economics" ? <CampaignEconomicsPanel economics={economics} campaignId={detail.campaign.id} /> : null}
        {drawer === "brief" ? (
          <>
            <FullBrief campaign={detail.campaign} sourceCount={detail.sources.length} />
            <div className="mt-5">
              <AudienceLeadsTab campaign={detail.campaign} sources={detail.sources} />
            </div>
          </>
        ) : null}
      </WorkspaceDrawer>
    </>
  );
}
