"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import type { ConnectionView } from "@/lib/connections/read-model";

import { AssetPreview } from "./asset-preview";
import { assembleCopyText, isChannelDeployable } from "./campaign-deploy-model";
import { contentStatusForLaunch, contentWhere, type CampaignPackageSummary, type PlainTone } from "./campaign-detail-model";
import { CopyTextButton } from "./copy-text-button";
import { DecisionControls } from "./decision-controls";
import { deployAssetAction } from "../actions";

type PackageView = "Email" | "SMS" | "Media" | "Drafts" | "Other";

export function CampaignPackageWorkspace({
  agentName,
  assets,
  campaignId,
  connections,
  launchState,
  summary,
}: {
  agentName: string;
  assets: CampaignWorkspaceAsset[];
  campaignId: string;
  connections: ConnectionView[];
  launchState: LiveCampaignWorkspace["launchState"];
  summary: CampaignPackageSummary;
}) {
  const tabs = useMemo(() => buildPackageTabs(assets, launchState), [assets, launchState]);
  const initialHashAsset = initialAssetFromHash(assets);
  const [activeView, setActiveView] = useState<PackageView>(() => (initialHashAsset ? viewForAsset(initialHashAsset, launchState) : tabs.find((tab) => tab.count > 0)?.key ?? "Email"));
  const visibleAssets = useMemo(() => filterAssetsForView(assets, activeView, launchState), [activeView, assets, launchState]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(() => initialHashAsset?.id ?? visibleAssets[0]?.id ?? null);
  const selectedAsset = visibleAssets.find((asset) => asset.id === selectedAssetId) ?? visibleAssets[0] ?? null;

  function activateView(view: PackageView) {
    setActiveView(view);
    setSelectedAssetId(filterAssetsForView(assets, view, launchState)[0]?.id ?? null);
  }

  function selectAsset(asset: CampaignWorkspaceAsset) {
    setSelectedAssetId(asset.id);
    window.history.replaceState(null, "", `#piece-${asset.id}`);
  }

  return (
    <section id="package" className="scroll-mt-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] xl:self-start">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-semibold tracking-[-0.015em] text-[var(--text-primary)]">Campaign package</h2>
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">Review one draft, message, media item, or handoff piece at a time.</p>
          </div>
          <PackageSnapshot summary={summary} />
        </div>

        <nav aria-label="Campaign package views" className="mt-4 grid gap-2 sm:grid-cols-5">
          {tabs.map((tab) => {
            const active = activeView === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => activateView(tab.key)}
                disabled={tab.count === 0}
                className={`min-h-11 rounded-md border px-3 text-left text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${
                  active
                    ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="block">{tab.label}</span>
                <span className="mt-1 block font-mono text-[11px] opacity-80">{tab.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {selectedAsset ? (
        <div className="grid min-h-[28rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
          <PieceSelector assets={visibleAssets} launchState={launchState} selectedAssetId={selectedAsset.id} onSelect={selectAsset} />
          <CampaignPiece asset={selectedAsset} campaignId={campaignId} connections={connections} launchState={launchState} agentName={agentName} />
        </div>
      ) : (
        <div className="p-5">
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm leading-6 text-[var(--text-muted)]">
            No pieces in this view yet.
          </div>
        </div>
      )}
    </section>
  );
}

function PieceSelector({
  assets,
  launchState,
  onSelect,
  selectedAssetId,
}: {
  assets: CampaignWorkspaceAsset[];
  launchState: LiveCampaignWorkspace["launchState"];
  onSelect: (asset: CampaignWorkspaceAsset) => void;
  selectedAssetId: string;
}) {
  return (
    <aside className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 lg:border-b-0 lg:border-r">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Pieces</h3>
        <span className="font-mono text-[11px] font-bold text-[var(--text-muted)]">{assets.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {assets.map((asset) => {
          const active = asset.id === selectedAssetId;
          const status = contentStatusForLaunch(asset, launchState);
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset)}
              className={`rounded-lg border p-3 text-left transition ${
                active
                  ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-sm font-bold leading-5 text-[var(--text-primary)]">{asset.title}</span>
                {asset.media.length > 0 ? <span className="shrink-0 rounded-md bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">media</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">{contentWhere(asset)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CampaignPiece({
  asset,
  campaignId,
  connections,
  launchState,
  agentName,
}: {
  asset: CampaignWorkspaceAsset;
  campaignId: string;
  connections: ConnectionView[];
  launchState: LiveCampaignWorkspace["launchState"];
  agentName: string;
}) {
  const status = contentStatusForLaunch(asset, launchState);
  const showDecisionControls = status.label === "Review" || status.label === "Draft" || status.label === "Blocked";
  const hasMedia = asset.media.length > 0;

  return (
    <article id={`piece-${asset.id}`} className="min-w-0 bg-[var(--surface-panel)]">
      <div className="grid gap-3 bg-[var(--surface-inset)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              {contentWhere(asset)}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{asset.channel}</span>
          </div>
          <h3 className="mt-2 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{asset.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{pieceDescription(asset, agentName)}</p>
        </div>
        <div className="font-mono text-xs text-[var(--text-muted)]">{asset.updatedAt}</div>
      </div>

      <div className="space-y-3 p-4">
        <PieceQuickFacts asset={asset} statusLabel={status.label} />
        {hasMedia ? <MediaReview asset={asset} /> : <MessageReviewPane asset={asset} />}
        {showDecisionControls ? (
          <div className="sticky bottom-3 z-20 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 shadow-[0_-14px_30px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Decision</div>
              <p className="max-w-[62ch] text-xs leading-5 text-[var(--text-muted)]">Approve if it can be used as-is; request rework if the wording or audience is off.</p>
            </div>
            <DecisionControls campaignId={campaignId} assetId={asset.id} labels={decisionLabelsForTarget()} />
          </div>
        ) : (
          <InlineDeployShortcut asset={asset} campaignId={campaignId} status={status} connections={connections} />
        )}
      </div>
    </article>
  );
}

function MediaReview({ asset }: { asset: CampaignWorkspaceAsset }) {
  const primary = asset.media[0];

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <div className="overflow-hidden rounded-xl border border-[var(--accent-border-strong)] bg-[var(--media-void)]">
        {primary?.type === "image" ? (
          <a href={primary.url} target="_blank" rel="noreferrer" className="group block">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview media can be arbitrary remote creative URLs */}
            <img src={primary.thumbnailUrl ?? primary.url} alt={primary.title} className="h-[22rem] w-full object-cover transition group-hover:scale-[1.015]" />
          </a>
        ) : (
          <AssetPreview asset={{ ...asset, body: "" }} />
        )}
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Media brief</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{asset.body || asset.preview}</p>
        </div>
        {asset.media.length > 1 ? <AssetPreview asset={{ ...asset, body: "" }} /> : null}
      </div>
    </div>
  );
}

function MessageReviewPane({ asset }: { asset: CampaignWorkspaceAsset }) {
  const hasReadableBody = Boolean(asset.body.trim());
  const showPreview = normalizeCopy(asset.preview) !== normalizeCopy(asset.body);

  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
        <div className="grid gap-2 border-b border-[var(--border-hairline)] px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Subject</span>
          <span className="min-w-0 text-sm font-bold text-[var(--text-primary)]">{asset.title}</span>
        </div>
        {showPreview ? (
          <div className="grid gap-2 border-b border-[var(--border-hairline)] px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Preview</span>
            <span className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">{plainOrFallback(asset.preview, "No preview text available.")}</span>
          </div>
        ) : null}
        <div className="px-4 py-4">
          {hasReadableBody ? (
            <div className="space-y-3">
              {asset.body
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={`${asset.id}-body-${index}`} className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                    {paragraph}
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-[var(--text-muted)]">This piece does not include copy yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PieceQuickFacts({ asset, statusLabel }: { asset: CampaignWorkspaceAsset; statusLabel: string }) {
  const rows = [
    ["Channel", asset.channel],
    ["Type", contentWhere(asset)],
    ["Status", statusLabel],
    ["Updated", asset.updatedAt],
  ];

  return (
    <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2">
      <div className="sr-only">Piece details</div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PackageSnapshot({ summary }: { summary: CampaignPackageSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:flex sm:max-w-full sm:flex-wrap sm:justify-start lg:max-w-[32rem] lg:justify-end">
      <SnapshotMetric label="Pieces" value={summary.total} tone="gray" />
      <SnapshotMetric label="Review" value={summary.review} tone={summary.review > 0 ? "amber" : "green"} />
      <SnapshotMetric label="Ready" value={summary.ready + summary.live} tone={summary.ready + summary.live > 0 ? "blue" : "gray"} />
      <SnapshotMetric label="Media" value={summary.media} tone={summary.media > 0 ? "green" : "gray"} />
    </dl>
  );
}

function SnapshotMetric({ label, value, tone }: { label: string; value: number; tone: PlainTone }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${metricToneClass(tone)}`}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function buildPackageTabs(assets: CampaignWorkspaceAsset[], launchState: LiveCampaignWorkspace["launchState"]): Array<{ key: PackageView; label: string; count: number }> {
  return [
    { key: "Email", label: "Email", count: filterAssetsForView(assets, "Email", launchState).length },
    { key: "SMS", label: "SMS", count: filterAssetsForView(assets, "SMS", launchState).length },
    { key: "Media", label: "Media", count: filterAssetsForView(assets, "Media", launchState).length },
    { key: "Drafts", label: "Drafts", count: filterAssetsForView(assets, "Drafts", launchState).length },
    { key: "Other", label: "Other", count: filterAssetsForView(assets, "Other", launchState).length },
  ];
}

function filterAssetsForView(assets: CampaignWorkspaceAsset[], view: PackageView, launchState: LiveCampaignWorkspace["launchState"]) {
  return assets.filter((asset) => {
    if (view === "Media") return asset.media.length > 0;
    if (view === "Drafts") return contentStatusForLaunch(asset, launchState).label === "Draft";
    if (view === "Email") return contentWhere(asset) === "Email";
    if (view === "SMS") return contentWhere(asset) === "SMS";
    return !["Email", "SMS"].includes(contentWhere(asset)) && asset.media.length === 0 && contentStatusForLaunch(asset, launchState).label !== "Draft";
  });
}

function viewForAsset(asset: CampaignWorkspaceAsset, launchState: LiveCampaignWorkspace["launchState"]): PackageView {
  const where = contentWhere(asset);
  if (where === "Email") return "Email";
  if (where === "SMS") return "SMS";
  if (asset.media.length > 0) return "Media";
  if (contentStatusForLaunch(asset, launchState).label === "Draft") return "Drafts";
  return "Other";
}

function initialAssetFromHash(assets: CampaignWorkspaceAsset[]) {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#piece-/, "");
  return assets.find((asset) => asset.id === hash) ?? null;
}

function metricToneClass(tone: PlainTone) {
  if (tone === "amber") return "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]";
  if (tone === "green") return "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]";
  if (tone === "blue") return "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]";
  if (tone === "red") return "border-[var(--priority-border-soft)] bg-[var(--priority-soft)] text-[var(--priority-text)]";
  return "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)]";
}

function InlineDeployShortcut({
  asset,
  campaignId,
  status,
  connections,
}: {
  asset: CampaignWorkspaceAsset;
  campaignId: string;
  status: { label: string };
  connections: ConnectionView[];
}) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);
  const isLive = status.label === "Live";
  const channel = contentWhere(asset);
  const deployable = isChannelDeployable(channel, connections);
  const copyText = assembleCopyText(asset);

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {isLive ? "Deployed" : "Ready to ship"}
      </div>
      {isLive ? (
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          This piece is queued in the Outbox. Manage it from the Deploy &amp; share section above.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {deployable ? (
            <form action={formAction} className="flex items-center gap-2">
              <input type="hidden" name="assetId" value={asset.id} />
              <input type="hidden" name="campaignId" value={campaignId} />
              <Button type="submit" variant="primary" size="sm" disabled={isPending}>
                {isPending ? "Deploying…" : "Deploy this piece"}
              </Button>
            </form>
          ) : null}
          <CopyTextButton text={copyText} label={channel === "Social" ? "Copy caption" : "Copy text"} />
          {state ? (
            <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
              {state.message}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function pieceDescription(asset: CampaignWorkspaceAsset, agentName: string) {
  const where = contentWhere(asset);
  if (where === "Email") return "Email draft for this campaign.";
  if (where === "SMS") return "Text message draft for this campaign.";
  if (where === "Social") return "Social or ad creative for this campaign.";
  if (where === "Website") return "Landing page or website copy for this campaign.";
  if (where === "CRM") return "Lead, call, or follow-up work for this campaign.";
  return `Exportable campaign piece prepared by ${agentName}.`;
}

function decisionLabelsForTarget() {
  return {
    approve: "Approve & move on",
    decline: "Request rework",
    archive: "Remove from queue",
  };
}

function plainOrFallback(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed || /not been summarized|not recorded|not captured/i.test(trimmed)) return fallback;
  return trimmed;
}

function normalizeCopy(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
