"use client";

import { useState } from "react";

import { WorkspaceHeader } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { ApprovalsTab } from "./approvals-tab";
import { AudienceLeadsTab } from "./audience-leads-tab";
import { CreativeTab } from "./creative-tab";
import { MarkRail } from "./mark-rail";
import { OverviewTab } from "./overview-tab";
import { ReasoningTab } from "./reasoning-tab";
import { statusTone } from "./status-tone";

type TabKey = "creative" | "overview" | "audience" | "reasoning" | "approvals";

export function CampaignWorkspace({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, groupedAssets, assets, sources, reasoning, approvals, metrics } = detail;
  const [activeTab, setActiveTab] = useState<TabKey>("creative");
  const [targetAssetId, setTargetAssetId] = useState<string | null>(assets[0]?.id ?? null);

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "creative", label: "Creative", count: assets.length },
    { key: "overview", label: "Overview" },
    { key: "audience", label: "Audience & Leads", count: metrics.sources },
    { key: "reasoning", label: "Reasoning" },
    { key: "approvals", label: "Approvals", count: approvals.length },
  ];

  function pickAsset(assetId: string) {
    setTargetAssetId(assetId);
    setActiveTab("creative");
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Campaign"
        title={campaign.name}
        description={campaign.objective}
        status={campaign.status}
        statusTone={statusTone(campaign.status)}
        secondary={{ label: "All campaigns", href: "/campaigns" }}
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
            {activeTab === "overview" ? <OverviewTab campaign={campaign} metrics={metrics} /> : null}
            {activeTab === "audience" ? <AudienceLeadsTab sources={sources} /> : null}
            {activeTab === "reasoning" ? <ReasoningTab reasoning={reasoning} /> : null}
            {activeTab === "approvals" ? <ApprovalsTab approvals={approvals} /> : null}
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
