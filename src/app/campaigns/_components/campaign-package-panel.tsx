"use client";

import { useActionState, useState } from "react";

import { Button, buttonClasses, StatusPill } from "@/app/_components/page-header";
import type {
  CampaignExecutiveOverview,
  CampaignLaunchState,
  CampaignWorkspaceMeta,
  LiveCampaignWorkspace,
} from "@/lib/campaigns/read-model";

import { launchCampaignAction } from "../actions";

type TabKey = "creative" | "media" | "audience" | "reasoning" | "approvals" | "performance";
type PillTone = "blue" | "green" | "amber" | "gray";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], PillTone> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

/**
 * Broad, full-width operational snapshot for a single campaign. Replaces the
 * old two-aside "decision packet": one decision strip, one metric row (the
 * single source of truth), distinct brief cards, and a collapsible full brief.
 * No side rails — the content column owns the full width.
 */
export function CampaignOverview({
  detail,
  onOpenTab,
}: {
  detail: LiveCampaignWorkspace;
  onOpenTab: (tab: TabKey) => void;
}) {
  const { campaign, sources, reasoning, executiveOverview, launchState } = detail;
  const guardrailCount = reasoning.guardrailFlags.length;

  return (
    <section className="mb-5 space-y-4">
      <LaunchTracker campaignId={campaign.id} launchState={launchState} onReviewPieces={() => onOpenTab("creative")} />

      <ExecutiveOverview overview={executiveOverview} />

      {guardrailCount > 0 ? <GuardrailNotice flags={reasoning.guardrailFlags} /> : null}

      <FullBrief campaign={campaign} sourceCount={sources.length} />
    </section>
  );
}

/**
 * The campaign's single decision-to-deploy surface. Approval happens per piece
 * in the Deliverables list; this tracks readiness and owns the one Launch
 * action. Lifecycle is derived: Drafting → In review → Ready → Live.
 */
function LaunchTracker({
  campaignId,
  launchState,
  onReviewPieces,
}: {
  campaignId: string;
  launchState: CampaignLaunchState;
  onReviewPieces: () => void;
}) {
  const [state, formAction, isPending] = useActionState(launchCampaignAction, null);
  const [armed, setArmed] = useState(false);
  const { requiredCount, approvedCount, pendingCount, deployedCount, ready, live, lifecycle } = launchState;
  const pct = requiredCount > 0 ? Math.round((approvedCount / requiredCount) * 100) : 0;

  if (live) {
    return (
      <div className="module-rise flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[oklch(0.74_0.115_232/0.45)] bg-[oklch(0.74_0.115_232/0.08)] px-5 py-4 shadow-[var(--elev-panel)]">
        <div className="flex items-center gap-3">
          <span aria-hidden className="status-breathe h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Live</div>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)]">
              Launched and handed off to Mark for dispatch. {approvedCount} approved deliverable{approvedCount === 1 ? "" : "s"} are unlocked.
            </p>
          </div>
        </div>
        <button type="button" onClick={onReviewPieces} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          View deliverables
        </button>
      </div>
    );
  }

  const accent = ready
    ? "border-[oklch(0.78_0.14_158/0.5)] bg-[oklch(0.78_0.14_158/0.08)]"
    : "border-[oklch(0.82_0.13_85/0.45)] bg-[oklch(0.82_0.13_85/0.07)]";
  const heading =
    requiredCount === 0 ? "No pieces in review yet" : ready ? "Ready to launch" : "Pieces awaiting your approval";
  const subtext =
    requiredCount === 0
      ? "Mark is still building this campaign. Deliverables will appear here for approval."
      : ready
        ? "Every piece is approved. Launch to hand the campaign off to Mark for dispatch — outbound stays locked until you do."
        : `${pendingCount} of ${requiredCount} ${pendingCount === 1 ? "piece" : "pieces"} still need a decision before this campaign can launch.`;

  return (
    <div className={`module-rise overflow-hidden rounded-2xl border shadow-[var(--elev-panel)] ${accent}`}>
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Launch</span>
            <StatusPill tone={LIFECYCLE_TONE[lifecycle]}>{lifecycle}</StatusPill>
          </div>
          <h2 className="mt-2 text-lg font-bold tracking-[-0.03em] text-[var(--text-primary)]">{heading}</h2>
          <p className="mt-1 max-w-[72ch] text-sm leading-5 text-[var(--text-secondary)]">{subtext}</p>

          {requiredCount > 0 ? (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-2 min-w-40 max-w-xs flex-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full bg-[var(--ok)] transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={approvedCount}
                  aria-valuemin={0}
                  aria-valuemax={requiredCount}
                  aria-label="Deliverables approved"
                />
              </div>
              <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                {approvedCount}/{requiredCount} approved{deployedCount > 0 ? ` · ${deployedCount} deployed` : ""}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
          {pendingCount > 0 ? (
            <button type="button" onClick={onReviewPieces} className={buttonClasses({ variant: "ghost", size: "md" })}>
              Review {pendingCount} {pendingCount === 1 ? "piece" : "pieces"}
            </button>
          ) : null}
          {!ready ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled
              title={`Approve every piece to launch — ${pendingCount} still ${pendingCount === 1 ? "needs" : "need"} a decision.`}
            >
              Launch campaign
            </Button>
          ) : armed ? (
            <form action={formAction} className="flex items-center gap-2">
              <input type="hidden" name="campaignId" value={campaignId} />
              <Button type="submit" variant="primary" size="md" disabled={isPending}>
                {isPending ? "Launching…" : "Confirm launch"}
              </Button>
              <button type="button" onClick={() => setArmed(false)} className="text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
                Cancel
              </button>
            </form>
          ) : (
            <Button type="button" variant="primary" size="md" onClick={() => setArmed(true)}>
              Launch campaign
            </Button>
          )}
        </div>
      </div>

      {state ? (
        <div
          className={`border-t px-5 py-2.5 text-sm font-semibold ${
            state.ok
              ? "border-[oklch(0.78_0.14_158/0.3)] bg-[oklch(0.78_0.14_158/0.1)] text-[oklch(0.88_0.1_158)]"
              : "border-[oklch(0.68_0.2_26/0.35)] bg-[oklch(0.68_0.2_26/0.1)] text-[oklch(0.86_0.09_26)]"
          }`}
        >
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

function ExecutiveOverview({ overview }: { overview: CampaignExecutiveOverview }) {
  // Uniform, scannable facts — no rainbow labels, no clamps (this is reference
  // copy you should be able to read). "Where" is dropped: it restated the brief.
  const facts: Array<[string, string]> = [
    ["Why", overview.why],
    ["Timeframe", overview.timeframe],
    ["How we measure success", overview.successTracking],
  ];

  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <span className="signal-eyebrow">Executive overview</span>
        <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Campaign brief</h2>
        <p className="mt-2 max-w-[82ch] text-sm leading-6 text-[var(--text-secondary)]">{overview.what}</p>
      </div>

      <dl className="grid gap-px bg-[var(--border-hairline)] sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="bg-[var(--surface-panel)] px-5 py-4">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GuardrailNotice({ flags }: { flags: string[] }) {
  return (
    <div className="module-rise rounded-xl border border-[oklch(0.76_0.14_18/0.32)] bg-[oklch(0.5_0.14_18/0.1)] px-4 py-3 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[oklch(0.86_0.1_26)]">Guardrails</span>
        <StatusPill tone="red">
          {flags.length} flag{flags.length === 1 ? "" : "s"}
        </StatusPill>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-secondary)]">{flags.slice(0, 3).join(" / ")}</p>
    </div>
  );
}

function FullBrief({ campaign, sourceCount }: { campaign: CampaignWorkspaceMeta; sourceCount: number }) {
  const rows: Array<[string, string]> = [
    ["Objective", campaign.objective],
    ["Audience", campaign.audienceSummary],
    ["Offer", campaign.offerSummary],
    ["Persona", campaign.persona],
    ["Restoration focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Linked sources", `${sourceCount} record${sourceCount === 1 ? "" : "s"}`],
    ["Compliance", campaign.complianceNotes],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <details className="group overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div className="flex items-center gap-2">
          <span className="signal-eyebrow">Full brief & compliance</span>
        </div>
        <span className="font-mono text-xs font-bold text-[var(--text-muted)] transition group-open:text-[var(--accent)]">
          <span className="group-open:hidden">Expand</span>
          <span className="hidden group-open:inline">Collapse</span>
        </span>
      </summary>
      <dl className="divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-3 px-5 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
            <dd className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
