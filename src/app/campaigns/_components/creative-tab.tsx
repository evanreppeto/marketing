"use client";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceAsset, CampaignWorkspaceAssetCategory } from "@/lib/campaigns/read-model";

import { AssetPreview } from "./asset-preview";
import { statusTone } from "./status-tone";

const SECTIONS: Array<{ key: CampaignWorkspaceAssetCategory; title: string; detail: string }> = [
  { key: "physical", title: "Physical campaign pieces", detail: "Postcards, mailers, leave-behinds, and call scripts." },
  { key: "virtual", title: "Digital outreach", detail: "Email, SMS, landing pages, social, and sequences." },
  { key: "ads", title: "Paid ads", detail: "Meta, Google, display, search, and platform-ready drafts." },
  { key: "media", title: "Images and video", detail: "Generated visuals, videos, mockups, and creative references." },
  { key: "other", title: "Supporting items", detail: "Research notes and supporting pieces." },
];

export function CreativeTab({
  groups,
  targetAssetId,
  onPickAsset,
}: {
  groups: Record<CampaignWorkspaceAssetCategory, CampaignWorkspaceAsset[]>;
  targetAssetId: string | null;
  onPickAsset: (assetId: string) => void;
}) {
  const populated = SECTIONS.filter((section) => groups[section.key]?.length > 0);

  if (populated.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        Mark has not attached any campaign deliverables yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {populated.map((section) => (
        <section key={section.key}>
          <div className="mb-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{section.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{section.detail}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {groups[section.key].length} item{groups[section.key].length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {groups[section.key].map((asset) => (
              <AssetCard key={asset.id} asset={asset} isTarget={targetAssetId === asset.id} onPick={() => onPickAsset(asset.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssetCard({ asset, isTarget, onPick }: { asset: CampaignWorkspaceAsset; isTarget: boolean; onPick: () => void }) {
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border bg-[var(--surface-panel)] ${
        isTarget ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--border-panel)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-[var(--text-primary)]">{asset.title}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {asset.channel} / {asset.assetType}
          </div>
        </div>
        <StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill>
      </div>

      <div className="flex-1 p-4">
        <AssetPreview asset={asset} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] px-4 py-3">
        <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {asset.toolSource ? <span>Built with {asset.toolSource}</span> : null}
          <StatusPill tone="amber">Outbound locked</StatusPill>
          {!asset.dispatchLocked ? <StatusPill tone="blue">Approved draft</StatusPill> : null}
        </span>
        <button type="button" onClick={onPick} className={buttonClasses({ variant: isTarget ? "primary" : "ghost", size: "sm" })}>
          {isTarget ? "Selected" : "Ask Mark to revise"}
        </button>
      </div>
    </article>
  );
}
