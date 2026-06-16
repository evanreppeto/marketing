"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { Button, buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignMediaAsset, CampaignWorkspaceAsset, CampaignWorkspaceAssetCategory } from "@/lib/campaigns/read-model";

import { deployAssetAction, decideAssetAction, reopenAssetAction, requestRevisionAction } from "../actions";
import { DecisionControls } from "./decision-controls";
import { RevisionDiff } from "./revision-diff";
import { SectionHeader } from "./section-header";

type FilterKey = CampaignWorkspaceAssetCategory | "all";

const SECTIONS: Array<{ key: CampaignWorkspaceAssetCategory; title: string; detail: string }> = [
  { key: "physical", title: "Physical pieces", detail: "Postcards, mailers, leave-behinds, and call scripts." },
  { key: "virtual", title: "Digital outreach", detail: "Email, SMS, landing pages, social, and sequences." },
  { key: "ads", title: "Paid ads", detail: "Meta, Google, display, search, and platform-ready drafts." },
  { key: "media", title: "Images & video", detail: "Generated visuals, videos, mockups, and creative references." },
  { key: "other", title: "Supporting items", detail: "Research notes and supporting pieces." },
];

const SECTION_TONE: Record<CampaignWorkspaceAssetCategory, "blue" | "red" | "amber" | "green" | "gray"> = {
  physical: "amber",
  virtual: "blue",
  ads: "red",
  media: "green",
  other: "gray",
};

const SECTION_MARKER: Record<CampaignWorkspaceAssetCategory, string> = {
  physical: "bg-[oklch(0.82_0.13_85)]",
  virtual: "bg-[var(--accent)]",
  ads: "bg-[var(--priority)]",
  media: "bg-[var(--ok)]",
  other: "bg-[var(--border-strong)]",
};

type WorkflowStageKey = "review" | "approved" | "deployed" | "declined" | "archived";

type WorkflowStage = {
  key: WorkflowStageKey;
  label: string;
  detail: string;
  tone: "amber" | "green" | "red" | "blue" | "gray";
  dot: string;
  noteClass: string;
  revisionLabel: string;
};

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
  const agentName = useAgentName();
  const populated = SECTIONS.filter((section) => groups[section.key]?.length > 0);
  const allAssets = populated.flatMap((section) => groups[section.key]);
  const total = allAssets.length;
  const needsApproval = allAssets.filter((asset) => assetWorkflow(asset, agentName).key === "review").length;
  const approved = allAssets.filter((asset) => ["approved", "deployed"].includes(assetWorkflow(asset, agentName).key)).length;
  const deployed = allAssets.filter((asset) => assetWorkflow(asset, agentName).key === "deployed").length;
  const decided = total - needsApproval;
  const [selected, setSelected] = useState<{ id: string; revise: boolean } | null>(null);
  // Controlled by the URL ?filter=…; fall back to "all" for missing/unknown values.
  const activeFilter: FilterKey = populated.some((section) => section.key === filter)
    ? (filter as CampaignWorkspaceAssetCategory)
    : "all";

  if (populated.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        {agentName} has not attached any campaign deliverables yet. New pieces appear here for approval as {agentName} builds them.
      </p>
    );
  }

  const visible = activeFilter === "all" ? populated : populated.filter((section) => section.key === activeFilter);
  const pct = total > 0 ? Math.round((decided / total) * 100) : 0;
  const selectedAsset = selected ? allAssets.find((asset) => asset.id === selected.id) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Review progress — the queue's single status line. */}
      <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-3.5 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Review progress</span>
          <div className="flex h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div
              className="h-full rounded-full bg-[var(--ok)] transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={decided}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Deliverables decided"
            />
          </div>
          <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {decided}/{total} decided
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-semibold">
          <CountChip dot="bg-[var(--warn)]" label="need approval" value={needsApproval} />
          <span aria-hidden className="text-[var(--text-muted)]">·</span>
          <CountChip dot="bg-[var(--ok)]" label="approved" value={approved} />
          <span aria-hidden className="text-[var(--text-muted)]">·</span>
          <CountChip dot="bg-[var(--accent)]" label="deployed" value={deployed} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Deliverable type">
        <FilterChip active={activeFilter === "all"} total={total} decided={decided} onClick={() => onFilterChange(null)}>
          All types
        </FilterChip>
        {populated.map((section) => {
          const sectionAssets = groups[section.key];
          const sectionDecided = sectionAssets.filter((asset) => assetWorkflow(asset, agentName).key !== "review").length;
          return (
            <FilterChip
              key={section.key}
              active={activeFilter === section.key}
              total={sectionAssets.length}
              decided={sectionDecided}
              onClick={() => onFilterChange(section.key)}
            >
              {section.title}
            </FilterChip>
          );
        })}
      </div>

      <div className="space-y-4">
        {visible.map((section) => {
          const sectionAssets = groups[section.key];
          const sectionDecided = sectionAssets.filter((asset) => assetWorkflow(asset, agentName).key !== "review").length;
          return (
            <section
              key={section.key}
              className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
            >
              <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
                <SectionHeader tone={SECTION_TONE[section.key]} eyebrow={section.title} detail={section.detail} count={sectionAssets.length} />
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
                  <span aria-hidden className={`h-1.5 w-8 rounded-full ${SECTION_MARKER[section.key]}`} />
                  <span>
                    {sectionDecided}/{sectionAssets.length} decided
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-4">
                {sectionAssets.map((asset) => (
                  <DeliverableCard
                    key={asset.id}
                    asset={asset}
                    campaignId={campaignId}
                    onReview={() => setSelected({ id: asset.id, revise: false })}
                    onRevise={() => setSelected({ id: asset.id, revise: true })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {selectedAsset ? (
        <ReviewDrawer
          key={selectedAsset.id}
          asset={selectedAsset}
          campaignId={campaignId}
          initialRevising={selected?.revise ?? false}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function CountChip({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{value}</span>
      {label}
    </span>
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

/**
 * A deliverable as a compact, image-forward card. The cover renders the artifact
 * (image/video creative as a real preview; email/sms/ads/docs as a typed
 * "document" cover). Clicking the card opens the review drawer; quick-approve /
 * deploy stay inline so common decisions need no drawer.
 */
function DeliverableCard({
  asset,
  campaignId,
  onReview,
  onRevise,
}: {
  asset: CampaignWorkspaceAsset;
  campaignId: string;
  onReview: () => void;
  onRevise: () => void;
}) {
  const agentName = useAgentName();
  const workflow = assetWorkflow(asset, agentName);
  const kind = assetKind(asset);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] transition hover:border-[var(--border-strong)]">
      <button
        type="button"
        onClick={onReview}
        className="block text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label={`Review ${asset.title}`}
      >
        <DeliverableCover asset={asset} kind={kind} />
      </button>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-bold leading-tight text-[var(--text-primary)]">{asset.title}</h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">
              {kind.label}
              {isDistinctMeta(kind.label, asset.channel) ? ` · ${asset.channel}` : ""}
              {asset.media.length > 0 ? ` · ${asset.media.length} media` : ""}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${workflow.dot}`} />
          </span>
        </div>

        <div className="mt-2">
          <StatusPill tone={workflow.tone}>{workflow.label}</StatusPill>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
          {workflow.key === "review" ? <QuickApprove assetId={asset.id} campaignId={campaignId} /> : null}
          {workflow.key === "approved" ? <DeployButton assetId={asset.id} campaignId={campaignId} /> : null}
          {workflow.key === "declined" || workflow.key === "deployed" ? (
            <button type="button" onClick={onRevise} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Revise with {agentName}
            </button>
          ) : null}
          {workflow.key === "archived" ? <ReopenButton assetId={asset.id} campaignId={campaignId} label="Restore" /> : null}
          <button
            type="button"
            onClick={onReview}
            className={`${buttonClasses({ variant: "ghost", size: "sm" })} ml-auto`}
          >
            Review
          </button>
        </div>
      </div>
    </article>
  );
}

function DeliverableCover({ asset, kind }: { asset: CampaignWorkspaceAsset; kind: ReturnType<typeof assetKind> }) {
  const primaryMedia = asset.media.find((media) => media.type === "image" || media.type === "video" || media.type === "embed") ?? null;
  const text = asset.body || asset.preview || "";
  const email = parseEmailPreview(text);

  if (primaryMedia) {
    if (primaryMedia.type === "image") {
      return (
        <div className="flex h-40 items-center justify-center overflow-hidden bg-[oklch(0.14_0.025_246)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- Arc emits arbitrary remote creative URLs; no optimizer config */}
          <img src={primaryMedia.thumbnailUrl ?? primaryMedia.url} alt={primaryMedia.title} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]" />
        </div>
      );
    }
    if (primaryMedia.type === "video") {
      return (
        <div className="h-40 bg-[var(--media-void)]">
          <video src={primaryMedia.url} poster={primaryMedia.thumbnailUrl ?? undefined} className="h-full w-full object-contain" />
        </div>
      );
    }
    // embed — no inline poster, show a typed cover
  }

  const coverTone =
    asset.category === "ads"
      ? "border-b-[oklch(0.68_0.2_26/0.3)] bg-[oklch(0.2_0.04_26/0.35)] text-[oklch(0.86_0.1_26)]"
      : email
        ? "border-b-[oklch(0.74_0.115_232/0.3)] bg-[oklch(0.18_0.035_246)] text-[var(--accent)]"
        : "border-b-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-muted)]";
  const label = email ? "Email" : asset.category === "ads" ? "Paid ad" : kind.label;
  const headline = email?.subject ?? null;
  const teaser = email?.body ?? (text || "No readable draft captured yet.");

  return (
    <div className={`flex h-40 flex-col gap-2 border-b p-3 ${coverTone}`}>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      {headline ? (
        <span className="line-clamp-2 text-sm font-bold leading-snug text-[var(--text-primary)]">{headline}</span>
      ) : null}
      <p className={`whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)] ${headline ? "line-clamp-3" : "line-clamp-5"}`}>{teaser}</p>
    </div>
  );
}

function QuickApprove({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="decision" value="approved" />
      <Button type="submit" variant="approve" size="sm" disabled={isPending}>
        {isPending ? "Approving…" : "Approve"}
      </Button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}

function DeployButton({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(deployAssetAction, null);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? "Deploying…" : "Deploy now"}
      </Button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}

/** Send a decided/deployed/removed piece back to the review queue (change your mind). */
function ReopenButton({ assetId, campaignId, label }: { assetId: string; campaignId: string; label: string }) {
  const [state, formAction, isPending] = useActionState(reopenAssetAction, null);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <button type="submit" disabled={isPending} className={buttonClasses({ variant: "ghost", size: "sm" })}>
        {isPending ? "Re-opening…" : label}
      </button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}

/** Quiet, destructive-tinted "Remove from queue" (archive) with a two-step
 *  confirm so it's never a single misclick. */
function RemoveButton({ assetId, campaignId }: { assetId: string; campaignId: string }) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--priority-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--priority)]"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="decision" value="archived" />
      <Button type="submit" variant="priority" size="sm" disabled={isPending}>
        {isPending ? "Removing…" : "Confirm remove"}
      </Button>
      <button type="button" onClick={() => setArmed(false)} className="text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
        Cancel
      </button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}

/**
 * Focused review of one deliverable, slid over the right side so the grid never
 * reflows. Holds the full draft (scrollable), media, compliance, facts, and
 * every decision/deploy/revise action. Closes on backdrop click or Escape.
 */
function ReviewDrawer({
  asset,
  campaignId,
  initialRevising = false,
  onClose,
}: {
  asset: CampaignWorkspaceAsset;
  campaignId: string;
  initialRevising?: boolean;
  onClose: () => void;
}) {
  const agentName = useAgentName();
  const [revising, setRevising] = useState(initialRevising);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const workflow = assetWorkflow(asset, agentName);
  const kind = assetKind(asset);
  const target = buildAssetDecisionTarget(asset);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close review" onClick={onClose} className="absolute inset-0 cursor-default bg-[oklch(0.04_0.02_250/0.6)] backdrop-blur-[1px]" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Review: ${asset.title}`}
        className="module-rise relative flex h-full w-full max-w-xl flex-col border-l border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <KindGlyph kind={kind} />
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-[-0.02em] text-[var(--text-primary)]">{asset.title}</h2>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                {kind.label}
                {isDistinctMeta(kind.label, asset.channel) ? ` · ${asset.channel}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={workflow.tone}>{workflow.label}</StatusPill>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Full draft</div>
            <AssetRecordPreview asset={asset} full />
          </div>

          {asset.revision ? <RevisionDiff draft={asset.revision.draft} current={asset.revision.current} /> : null}

          {asset.media.length > 0 ? <AssetMediaLibrary media={asset.media} /> : null}

          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Compliance</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{asset.complianceNotes}</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-sm">
            <ReviewFact label="Type" value={kind.label} />
            <ReviewFact label="Channel" value={asset.channel} />
            <ReviewFact label="Asset type" value={asset.assetType} />
            <ReviewFact label="Media" value={`${asset.media.length}`} />
            <ReviewFact label="Tool" value={asset.toolSource ?? "No tool recorded"} />
            <ReviewFact label="Updated" value={asset.updatedAt} />
            <ReviewFact label="Dispatch" value={asset.dispatchLocked ? "Locked" : "Unlocked"} />
          </div>
        </div>

        <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {workflow.key === "review" ? (
              <DecisionControls assetId={asset.id} campaignId={campaignId} labels={buildAssetDecisionLabels(target)} size="md" />
            ) : (
              <>
                {workflow.key === "approved" ? <DeployButton assetId={asset.id} campaignId={campaignId} /> : null}
                {workflow.key === "deployed" ? <WorkflowNote workflow={workflow} /> : null}
                <button
                  type="button"
                  onClick={() => setRevising((open) => !open)}
                  aria-expanded={revising}
                  className={buttonClasses({ variant: revising ? "primary" : "ghost", size: "sm" })}
                >
                  {revising ? "Close" : workflow.revisionLabel}
                </button>
                {workflow.key === "archived" ? (
                  <ReopenButton assetId={asset.id} campaignId={campaignId} label="Restore" />
                ) : (
                  <>
                    <ReopenButton assetId={asset.id} campaignId={campaignId} label="Send back to review" />
                    <RemoveButton assetId={asset.id} campaignId={campaignId} />
                  </>
                )}
              </>
            )}
          </div>

          <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${revising ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <RevisionForm campaignId={campaignId} assetId={asset.id} onDone={() => setRevising(false)} />
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function AssetRecordPreview({ asset, full = false }: { asset: CampaignWorkspaceAsset; full?: boolean }) {
  const text = asset.body || asset.preview || "No readable preview has been attached yet.";
  const email = parseEmailPreview(text);
  const primaryMedia = asset.media[0] ?? null;
  const kind = assetKind(asset);
  // In the drawer (full) the whole draft reads with an internal scroll so even
  // long copy never overflows the panel.
  const bodyClamp = full ? "max-h-[48vh] overflow-auto pr-1" : "line-clamp-6";

  if (email) {
    return (
      <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Email draft</span>
          <span className="text-xs text-[var(--text-muted)]">Subject</span>
        </div>
        <div className="space-y-3 p-3">
          <div className="rounded-md border border-[var(--border-hairline)] bg-[oklch(0.2_0.032_246)] px-3 py-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">
            {email.subject}
          </div>
          <p className={`whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)] ${bodyClamp}`}>{email.body}</p>
        </div>
      </div>
    );
  }

  if (primaryMedia) {
    return (
      <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
        <MediaHero media={primaryMedia} />
        <div className="border-t border-[var(--border-hairline)] px-3 py-2">
          <div className="text-xs font-bold text-[var(--text-primary)]">{primaryMedia.title}</div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{primaryMedia.description ?? text}</p>
        </div>
      </div>
    );
  }

  if (asset.category === "ads") {
    return (
      <div className="min-w-0 rounded-lg border border-[oklch(0.68_0.2_26/0.28)] bg-[oklch(0.25_0.04_26/0.28)] p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.86_0.1_26)]">Ad preview</span>
          <span className="rounded border border-[oklch(0.68_0.2_26/0.3)] px-2 py-0.5 text-[10px] font-bold uppercase text-[oklch(0.86_0.1_26)]">{asset.channel}</span>
        </div>
        <p className={`whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)] ${bodyClamp}`}>{text}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{kind.label}</span>
        <span className="text-lg font-bold text-[var(--text-muted)]">{kind.icon}</span>
      </div>
      <p className={`whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)] ${bodyClamp}`}>{text}</p>
    </div>
  );
}

function parseEmailPreview(text: string) {
  const subject = text.match(/(?:^|\n)\s*subject\s*:\s*(.+)/i)?.[1]?.trim();
  if (!subject) return null;

  const body = text
    .replace(/(?:^|\n)\s*subject\s*:\s*.+/i, "")
    .replace(/(?:^|\n)\s*(body|copy)\s*:\s*/i, "")
    .trim();

  return {
    subject,
    body: body || "No email body captured.",
  };
}

function MediaHero({ media }: { media: CampaignMediaAsset }) {
  if (media.type === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="group block overflow-hidden bg-[oklch(0.14_0.025_246)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Arc emits arbitrary remote creative URLs; no optimizer config */}
        <img src={media.thumbnailUrl ?? media.url} alt={media.title} className="max-h-80 w-full object-contain transition group-hover:scale-[1.01]" />
      </a>
    );
  }

  if (media.type === "video") {
    return <video src={media.url} poster={media.thumbnailUrl ?? undefined} controls className="max-h-80 w-full bg-[var(--media-void)] object-contain" />;
  }

  return (
    <a href={media.url} target="_blank" rel="noreferrer" className="flex h-28 flex-col justify-between bg-[var(--surface-inset)] p-3 transition hover:bg-[var(--surface-raised)]">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {media.type === "embed" ? "Video" : media.type === "file" ? "File" : "Link"}
      </span>
      <span className="line-clamp-2 text-sm font-bold text-[var(--text-primary)]">{media.title}</span>
      <span className="text-xs font-semibold text-[var(--accent)]">Open original</span>
    </a>
  );
}

function isDistinctMeta(left: string, right: string) {
  return left.trim().toLowerCase() !== right.trim().toLowerCase();
}

function assetKind(asset: CampaignWorkspaceAsset) {
  const text = `${asset.assetType} ${asset.channel} ${asset.title}`.toLowerCase();
  if (/email/.test(text)) return { icon: "@", label: "Email", iconClass: "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] text-[var(--accent)]" };
  if (/sms|text/.test(text)) return { icon: "#", label: "SMS", iconClass: "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[var(--ok)]" };
  if (/landing|web/.test(text)) return { icon: "WWW", label: "Landing page", iconClass: "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] text-[var(--accent)] text-[10px]" };
  if (asset.category === "ads") return { icon: "AD", label: "Paid ad", iconClass: "border-[oklch(0.76_0.14_18/0.32)] bg-[oklch(0.68_0.2_26/0.12)] text-[oklch(0.86_0.1_26)]" };
  if (asset.category === "media") return { icon: "IMG", label: "Image/video", iconClass: "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[var(--ok)] text-[10px]" };
  if (asset.category === "physical") return { icon: "DOC", label: "Print/physical", iconClass: "border-[oklch(0.78_0.14_76/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.89_0.12_76)] text-[10px]" };
  return { icon: "IT", label: "Supporting item", iconClass: "border-[var(--border-strong)] bg-[var(--surface-soft)] text-[var(--text-muted)]" };
}

/**
 * Every deliverable is a piece that needs a decision. Derive the stage from its
 * approval gate if present, else its own status — so an asset Arc created
 * without a gate still reads as "Needs approval", never a dead-end draft.
 * Approved pieces split into Approved (still dispatch-locked) vs Deployed.
 */
function assetWorkflow(asset: CampaignWorkspaceAsset, agentName: string): WorkflowStage {
  const status = asset.approval?.status ?? asset.status;

  if (/approved/i.test(status)) {
    if (!asset.dispatchLocked) {
      return {
        key: "deployed",
        label: "Deployed",
        detail: `Live — handed off to ${agentName} for dispatch.`,
        tone: "blue",
        dot: "bg-[var(--accent)]",
        noteClass: "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] text-[var(--chicago-blue-soft)]",
        revisionLabel: "Request revision",
      };
    }
    return {
      key: "approved",
      label: "Approved",
      detail: "Approved. Deploy it now, or launch it with the campaign.",
      tone: "green",
      dot: "bg-[var(--ok)]",
      noteClass: "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]",
      revisionLabel: "Request revision",
    };
  }

  if (/declined|rejected/i.test(status)) {
    return {
      key: "declined",
      label: "Rework requested",
      detail: `Sent back to ${agentName} — out of the launch until re-approved.`,
      tone: "red",
      dot: "bg-[var(--priority)]",
      noteClass: "border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.12)] text-[oklch(0.86_0.09_26)]",
      revisionLabel: "Request revision",
    };
  }

  if (/archived/i.test(status)) {
    return {
      key: "archived",
      label: "Removed",
      detail: "Removed from the queue.",
      tone: "gray",
      dot: "bg-[var(--border-strong)]",
      noteClass: "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-secondary)]",
      revisionLabel: "Request revision",
    };
  }

  return {
    key: "review",
    label: "Needs approval",
    detail: "Read it, then approve or request rework.",
    tone: "amber",
    dot: "bg-[var(--warn)]",
    noteClass: "border-[oklch(0.82_0.13_85/0.42)] bg-[oklch(0.82_0.13_85/0.13)] text-[oklch(0.9_0.09_85)]",
    revisionLabel: "Request revision",
  };
}

function WorkflowNote({ workflow }: { workflow: WorkflowStage }) {
  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${workflow.noteClass}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${workflow.dot}`} />
      {workflow.detail}
    </span>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-bold text-[var(--text-muted)]">{label}</span>
      <span className="text-right text-xs font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function AssetMediaLibrary({ media }: { media: CampaignMediaAsset[] }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Media</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {media.map((item) => (
          <div key={item.id} className="overflow-hidden rounded-lg border border-[var(--border-hairline)]">
            <MediaHero media={item} />
            <div className="border-t border-[var(--border-hairline)] px-3 py-2">
              <div className="text-xs font-bold text-[var(--text-primary)]">{item.title}</div>
              {item.description ? <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.description}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KindGlyph({ kind }: { kind: ReturnType<typeof assetKind> }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] font-bold ${kind.iconClass}`}
    >
      {kind.icon}
    </span>
  );
}

function buildAssetDecisionTarget(asset: CampaignWorkspaceAsset) {
  const normalized = `${asset.assetType} ${asset.channel} ${asset.category}`.toLowerCase();
  if (/image|creative set|media|video|visual/.test(normalized)) return "image set";
  if (/paid|ad|search|display|meta|google/.test(normalized)) return "ad draft";
  if (/email/.test(normalized)) return "email draft";
  if (/sms|text/.test(normalized)) return "message draft";
  if (/landing|page/.test(normalized)) return "landing page draft";
  return asset.assetType.toLowerCase();
}

function buildAssetDecisionLabels(target: string) {
  return {
    approve: `Approve ${target}`,
    decline: "Request rework",
    archive: "Remove from queue",
  };
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
  const agentName = useAgentName();
  const [state, formAction, isPending] = useActionState(requestRevisionAction, null);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="assetId" value={assetId} />

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Tell {agentName} what to change</span>
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
