"use client";

import { useState } from "react";

import { MetricStrip } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { ApprovalsTab } from "./approvals-tab";
import { AudienceLeadsTab } from "./audience-leads-tab";
import { CampaignHeader } from "./campaign-header";
import { CampaignMediaBoard } from "./campaign-media-board";
import { CampaignPackagePanel } from "./campaign-package-panel";
import { CreativeTab } from "./creative-tab";
import { MarkRail } from "./mark-rail";
import { OverviewTab } from "./overview-tab";
import { PerformanceTab } from "./performance-tab";
import { ReasoningTab } from "./reasoning-tab";

type TabKey = "creative" | "media" | "overview" | "audience" | "reasoning" | "approvals" | "performance";

function isDecided(status: string) {
  return /approved|declined|archived|rejected/i.test(status);
}

export function CampaignWorkspace({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, groupedAssets, assets, media, sources, reasoning, approvals, metrics, activity, events } = detail;
  const [activeTab, setActiveTab] = useState<TabKey>("creative");
  const [targetAssetId, setTargetAssetId] = useState<string | null>(assets[0]?.id ?? null);

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "creative", label: "Deliverables", count: assets.length },
    { key: "media", label: "Media", count: media.length },
    { key: "overview", label: "Brief" },
    { key: "audience", label: "Targets & sources", count: metrics.sources },
    { key: "reasoning", label: "Mark notes", count: activity.length + events.length },
    { key: "approvals", label: "Approval gate", count: approvals.length },
    { key: "performance", label: "Performance" },
  ];

  const pendingApproval = approvals.find((approval) => !isDecided(approval.status)) ?? null;

  function pickAsset(assetId: string) {
    setTargetAssetId(assetId);
    setActiveTab("creative");
  }

  return (
    <>
      <CampaignHeader campaign={campaign} />

      <CampaignPackagePanel detail={detail} pendingApproval={pendingApproval} onOpenTab={setActiveTab} onPickAsset={pickAsset} />

      <MetricStrip
        metrics={[
          { label: "Assets", value: metrics.assets, detail: "Creative + copy", tone: metrics.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: metrics.approvals, detail: "Human-gate records", tone: metrics.approvals > 0 ? "amber" : "green" },
          { label: "Media", value: metrics.media, detail: "Images, video, files", tone: metrics.media > 0 ? "blue" : "gray" },
          { label: "Sources", value: metrics.sources, detail: "Leads & evidence", tone: metrics.sources > 0 ? "blue" : "gray" },
        ]}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b border-[var(--border-hairline)] pb-3">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)]"
                  }`}
                >
                  {tab.label}
                  {typeof tab.count === "number" ? (
                    <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-xs tabular-nums text-[var(--text-muted)]">{tab.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div role="tabpanel">
            {activeTab === "creative" ? <CreativeTab groups={groupedAssets} targetAssetId={targetAssetId} onPickAsset={pickAsset} /> : null}
            {activeTab === "media" ? <CampaignMediaBoard media={media} /> : null}
            {activeTab === "overview" ? <OverviewTab campaign={campaign} metrics={metrics} /> : null}
            {activeTab === "audience" ? <AudienceLeadsTab sources={sources} /> : null}
            {activeTab === "reasoning" ? <ReasoningTab reasoning={reasoning} activity={activity} events={events} /> : null}
            {activeTab === "approvals" ? <ApprovalsTab approvals={approvals} campaignId={campaign.id} /> : null}
            {activeTab === "performance" ? <PerformanceTab detail={detail} /> : null}
          </div>
        </div>

        <MarkRail
          campaignId={campaign.id}
          assets={assets.map((asset) => ({ id: asset.id, title: asset.title, channel: asset.channel }))}
          targetAssetId={targetAssetId}
          onSelectAsset={setTargetAssetId}
          context={{
            persona: campaign.persona,
            leadsCount: sources.filter((source) => source.kind === "lead").length,
            tools: reasoning.toolsUsed,
            whyBuilt: reasoning.whyBuilt,
          }}
        />
      </div>
    </>
  );
}
