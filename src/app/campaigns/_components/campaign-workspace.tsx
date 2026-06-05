"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";

import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type DispatchView } from "@/lib/dispatch/status";

import { ApprovalsTab } from "./approvals-tab";
import { AudienceLeadsTab } from "./audience-leads-tab";
import { CampaignHeader } from "./campaign-header";
import { CampaignMediaBoard } from "./campaign-media-board";
import { CampaignOverview } from "./campaign-package-panel";
import { AuditLog } from "./audit-log";
import { CreativeTab } from "./creative-tab";
import { DispatchPanel } from "./dispatch-panel";
import { MarkConversation } from "./mark-conversation";
import { PerformanceTab } from "./performance-tab";
import { StickyDecisionBar } from "./sticky-decision-bar";

type TabKey = "creative" | "media" | "audience" | "reasoning" | "approvals" | "performance" | "audit";

const TAB_KEYS: TabKey[] = ["creative", "media", "approvals", "audience", "reasoning", "performance", "audit"];
const DEFAULT_TAB: TabKey = "creative";

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TAB_KEYS as string[]).includes(value);
}

export function CampaignWorkspace({ detail, dispatches = [] }: { detail: LiveCampaignWorkspace; dispatches?: DispatchView[] }) {
  const { campaign, groupedAssets, media, sources, reasoning, approvals, metrics, markConversation } = detail;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Tab + focused item are derived from the URL so the page is deep-linkable,
  // refresh-safe, and back/forward navigable. A bare ?item=… (shared link)
  // opens the read-only Decision log scrolled to that record.
  const tabParam = searchParams.get("tab");
  const focusItem = searchParams.get("item");
  const filterParam = searchParams.get("filter");
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : focusItem ? "approvals" : DEFAULT_TAB;

  function buildHref(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // pushState for navigation (tab/item) so the back button steps through it;
  // replaceState for refinements (filters) so they stay shareable without
  // flooding history. Both keep useSearchParams in sync with no server refetch.
  function writeParams(updates: Record<string, string | null>) {
    window.history.pushState(null, "", buildHref(updates));
  }

  function replaceParams(updates: Record<string, string | null>) {
    window.history.replaceState(null, "", buildHref(updates));
  }

  function goToTab(tab: TabKey) {
    writeParams({ tab: tab === DEFAULT_TAB ? null : tab, item: null, filter: null });
  }

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "creative", label: "Deliverables", count: metrics.assets },
    { key: "media", label: "Media", count: media.length },
    { key: "approvals", label: "Decision log", count: approvals.length },
    { key: "audience", label: "Audience & sources", count: metrics.sources },
    { key: "reasoning", label: "Talk to Mark", count: markConversation.length },
    { key: "performance", label: "Measurement" },
    { key: "audit", label: "Audit", count: detail.auditLog.length },
  ];

  const focus = focusItem ? { id: focusItem, nonce: 0 } : null;

  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    goToTab(tabs[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <StickyDecisionBar
        campaignId={campaign.id}
        launchState={detail.launchState}
        sentinelRef={sentinelRef}
        onReviewPieces={() => goToTab("creative")}
      />

      <CampaignHeader campaign={campaign} launchState={detail.launchState} />

      <CampaignOverview detail={detail} onOpenTab={goToTab} />

      <DispatchPanel dispatches={dispatches} />

      <div ref={sentinelRef} aria-hidden className="h-px" />

      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="Campaign detail sections"
          className="module-rise mb-5 flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-1.5 shadow-[var(--elev-panel)]"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                type="button"
                onClick={() => goToTab(tab.key)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" ? (
                  <span className="rounded-full bg-[var(--surface-raised)] px-1.5 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div key={activeTab} role="tabpanel" className="module-rise">
          {activeTab === "creative" ? (
            <CreativeTab
              groups={groupedAssets}
              campaignId={campaign.id}
              filter={filterParam}
              onFilterChange={(value) => replaceParams({ filter: value })}
            />
          ) : null}
          {activeTab === "media" ? (
            <CampaignMediaBoard media={media} filter={filterParam} onFilterChange={(value) => replaceParams({ filter: value })} />
          ) : null}
          {activeTab === "approvals" ? <ApprovalsTab approvals={approvals} history={detail.approvalHistory} focus={focus} /> : null}
          {activeTab === "audience" ? <AudienceLeadsTab campaign={campaign} sources={sources} /> : null}
          {activeTab === "reasoning" ? <MarkConversation campaignId={campaign.id} conversation={markConversation} reasoning={reasoning} /> : null}
          {activeTab === "performance" ? <PerformanceTab detail={detail} /> : null}
          {activeTab === "audit" ? <AuditLog entries={detail.auditLog} /> : null}
        </div>
      </div>
    </>
  );
}
