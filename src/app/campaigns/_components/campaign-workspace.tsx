"use client";

import { useState } from "react";

import { MetricStrip } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { ApprovalsTab } from "./approvals-tab";
import { AudienceLeadsTab } from "./audience-leads-tab";
import { CampaignHeader } from "./campaign-header";
import { CreativeTab } from "./creative-tab";
import { DecisionControls } from "./decision-controls";
import { MarkRail } from "./mark-rail";
import { OverviewTab } from "./overview-tab";
import { ReasoningTab } from "./reasoning-tab";

type TabKey = "creative" | "overview" | "audience" | "reasoning" | "approvals";

function isDecided(status: string) {
  return /approved|declined|archived|rejected/i.test(status);
}

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

  const pendingApproval = approvals.find((approval) => !isDecided(approval.status)) ?? null;

  function pickAsset(assetId: string) {
    setTargetAssetId(assetId);
    setActiveTab("creative");
  }

  return (
    <>
      <CampaignHeader campaign={campaign} />

      <MetricStrip
        metrics={[
          { label: "Assets", value: metrics.assets, detail: "Creative + copy", tone: metrics.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: metrics.approvals, detail: "Human-gate records", tone: metrics.approvals > 0 ? "amber" : "green" },
          { label: "Media", value: metrics.media, detail: "Images, video, files", tone: metrics.media > 0 ? "blue" : "gray" },
          { label: "Sources", value: metrics.sources, detail: "Leads & evidence", tone: metrics.sources > 0 ? "blue" : "gray" },
        ]}
      />

      {pendingApproval ? (
        <div className="module-rise mb-5 flex flex-col gap-3 rounded-xl border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.1)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)]">This campaign is awaiting your decision</div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {pendingApproval.title} · risk {pendingApproval.riskLevel}. Approving marks it ready — outbound stays locked.
            </p>
          </div>
          <DecisionControls approvalItemId={pendingApproval.id} campaignId={campaign.id} size="md" />
        </div>
      ) : null}

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
            {activeTab === "approvals" ? <ApprovalsTab approvals={approvals} campaignId={campaign.id} /> : null}
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
