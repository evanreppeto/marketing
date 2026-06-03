"use client";

import { useActionState, useState } from "react";

import { Button, buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceAsset, CampaignWorkspaceAssetCategory } from "@/lib/campaigns/read-model";

import { requestRevisionAction } from "../actions";
import { AssetPreview } from "./asset-preview";
import { DecisionControls } from "./decision-controls";
import { isDecidedStatus, statusTone } from "./status-tone";

/** A deliverable counts as "decided" when its gating approval (or, lacking one,
 *  its own status) has been resolved. */
function isAssetDecided(asset: CampaignWorkspaceAsset) {
  return isDecidedStatus(asset.approval?.status ?? asset.status);
}

function decidedCount(assets: CampaignWorkspaceAsset[]) {
  return assets.filter(isAssetDecided).length;
}

type FilterKey = CampaignWorkspaceAssetCategory | "all";

const SECTIONS: Array<{ key: CampaignWorkspaceAssetCategory; title: string; detail: string }> = [
  { key: "physical", title: "Physical pieces", detail: "Postcards, mailers, leave-behinds, and call scripts." },
  { key: "virtual", title: "Digital outreach", detail: "Email, SMS, landing pages, social, and sequences." },
  { key: "ads", title: "Paid ads", detail: "Meta, Google, display, search, and platform-ready drafts." },
  { key: "media", title: "Images & video", detail: "Generated visuals, videos, mockups, and creative references." },
  { key: "other", title: "Supporting items", detail: "Research notes and supporting pieces." },
];

export function CreativeTab({
  groups,
  campaignId,
  filter,
  onFilterChange,
}: {
  groups: Record<CampaignWorkspaceAssetCategory, CampaignWorkspaceAsset[]>;
  campaignId: string;
  filter: string | null;
  onFilterChange: (value: string | null) => void;
}) {
  const populated = SECTIONS.filter((section) => groups[section.key]?.length > 0);
  const totalCount = populated.reduce((sum, section) => sum + groups[section.key].length, 0);
  const totalDecided = populated.reduce((sum, section) => sum + decidedCount(groups[section.key]), 0);
  // Controlled by the URL ?filter=…; fall back to "all" for missing/unknown values.
  const activeFilter: FilterKey = populated.some((section) => section.key === filter)
    ? (filter as CampaignWorkspaceAssetCategory)
    : "all";

  if (populated.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        Mark has not attached any campaign deliverables yet.
      </p>
    );
  }

  const visible = activeFilter === "all" ? populated : populated.filter((section) => section.key === activeFilter);
  const pct = totalCount > 0 ? Math.round((totalDecided / totalCount) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--elev-panel)]">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Review progress</span>
        <div className="flex h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={totalDecided}
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-label="Deliverables decided"
          />
        </div>
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
          {totalDecided}/{totalCount} decided
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Deliverable type">
        <FilterChip active={activeFilter === "all"} total={totalCount} decided={totalDecided} onClick={() => onFilterChange(null)}>
          All types
        </FilterChip>
        {populated.map((section) => (
          <FilterChip
            key={section.key}
            active={activeFilter === section.key}
            total={groups[section.key].length}
            decided={decidedCount(groups[section.key])}
            onClick={() => onFilterChange(section.key)}
          >
            {section.title}
          </FilterChip>
        ))}
      </div>

      <div className="space-y-6">
        {visible.map((section) => (
          <section key={section.key}>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{section.title}</h3>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{section.detail}</p>
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {groups[section.key].length} item{groups[section.key].length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {groups[section.key].map((asset) => (
                <AssetCard key={asset.id} asset={asset} campaignId={campaignId} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  total,
  decided,
  onClick,
  children,
}: {
  active: boolean;
  total: number;
  decided: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const allDecided = decided === total && total > 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      {children}
      <span className={`font-mono text-xs tabular-nums ${allDecided ? "text-[var(--ok)]" : "text-[var(--text-muted)]"}`}>
        {decided}/{total}
      </span>
    </button>
  );
}

function AssetCard({ asset, campaignId }: { asset: CampaignWorkspaceAsset; campaignId: string }) {
  const [revising, setRevising] = useState(false);
  const approval = asset.approval;
  const canDecide = approval !== null && !isDecidedStatus(approval.status);
  const decided = approval !== null && isDecidedStatus(approval.status);

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border bg-[var(--surface-panel)] transition ${
        revising ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--border-panel)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-[var(--text-primary)]">{asset.title}</div>
          <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
            {asset.channel} · {asset.assetType}
          </div>
        </div>
        <StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill>
      </div>

      <div className="flex-1 p-4">
        <AssetPreview asset={asset} />
      </div>

      <div className="space-y-3 border-t border-[var(--border-hairline)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            {asset.toolSource ? <span>Built with {asset.toolSource}</span> : null}
            {!asset.dispatchLocked ? <StatusPill tone="blue">Approved draft</StatusPill> : <StatusPill tone="amber">Locked</StatusPill>}
          </span>
          {decided ? <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {canDecide ? (
            <DecisionControls approvalItemId={approval.id} campaignId={campaignId} size="sm" />
          ) : approval === null ? (
            <span className="text-xs text-[var(--text-muted)]">Not submitted for approval</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setRevising((open) => !open)}
            aria-expanded={revising}
            className={buttonClasses({ variant: revising ? "primary" : "ghost", size: "sm" })}
          >
            {revising ? "Close" : "Request revision"}
          </button>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${revising ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <RevisionForm campaignId={campaignId} assetId={asset.id} onDone={() => setRevising(false)} />
        </div>
      </div>
    </article>
  );
}

function RevisionForm({
  campaignId,
  assetId,
  onDone,
}: {
  campaignId: string;
  assetId: string;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(requestRevisionAction, null);

  return (
    <form action={formAction} className="space-y-3 border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="assetId" value={assetId} />

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Tell Mark what to change
        </span>
        <textarea
          name="instruction"
          rows={3}
          placeholder="e.g. Make the email shorter and add a referral CTA."
          className="w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Sending…" : "Queue revision"}
        </Button>
        <button type="button" onClick={onDone} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Cancel
        </button>
        <span className="text-xs text-[var(--text-muted)]">Creates a queued task. Nothing is sent.</span>
      </div>

      {state ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.ok
              ? "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
              : "border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.14)] text-[oklch(0.86_0.09_26)]"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
