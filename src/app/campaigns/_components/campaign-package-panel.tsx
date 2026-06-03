"use client";

import { useState } from "react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import type {
  CampaignWorkspaceApproval,
  CampaignWorkspaceMeta,
  LiveCampaignWorkspace,
} from "@/lib/campaigns/read-model";

import { ApprovalContext } from "./approval-context";
import { DecisionControls } from "./decision-controls";
import { riskTone } from "./status-tone";

type TabKey = "creative" | "media" | "audience" | "reasoning" | "approvals" | "performance";
type Tone = "blue" | "green" | "amber" | "red";

/**
 * Broad, full-width operational snapshot for a single campaign. Replaces the
 * old two-aside "decision packet": one decision strip, one metric row (the
 * single source of truth), distinct brief cards, and a collapsible full brief.
 * No side rails — the content column owns the full width.
 */
export function CampaignOverview({
  detail,
  pendingApprovals,
  onOpenTab,
  onReviewApproval,
}: {
  detail: LiveCampaignWorkspace;
  pendingApprovals: CampaignWorkspaceApproval[];
  onOpenTab: (tab: TabKey) => void;
  onReviewApproval: (approvalId: string) => void;
}) {
  const { campaign, sources, reasoning, metrics, media } = detail;
  const guardrailCount = reasoning.guardrailFlags.length;

  const metricCells: Array<{ label: string; value: number; hint: string; tab: TabKey; tone: Tone }> = [
    { label: "Deliverables", value: metrics.assets, hint: "Draft pieces", tab: "creative", tone: "blue" },
    { label: "Media", value: media.length, hint: "Images, video, files", tab: "media", tone: "red" },
    { label: "Sources", value: metrics.sources, hint: "Leads & evidence", tab: "audience", tone: "green" },
    { label: "Approvals", value: metrics.approvals, hint: "Decision records", tab: "approvals", tone: "amber" },
  ];

  return (
    <section className="mb-5 space-y-4">
      <DecisionStepper
        campaignId={campaign.id}
        pendingApprovals={pendingApprovals}
        onOpenApprovals={() => onOpenTab("approvals")}
        onReviewApproval={onReviewApproval}
      />

      <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--border-hairline)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
        {metricCells.map((cell, index) => (
          <button
            key={cell.label}
            type="button"
            onClick={() => onOpenTab(cell.tab)}
            style={{ animationDelay: `${index * 45}ms` }}
            className="module-rise group bg-[var(--surface-panel)] px-5 py-4 text-left transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${toneText(cell.tone)}`}>{cell.label}</span>
              <span className="text-xs font-bold text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100">Open</span>
            </div>
            <div className="mt-2 font-display text-[2rem] font-black leading-none tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">
              {cell.value}
            </div>
            <div className="mt-1.5 text-xs font-semibold text-[var(--text-muted)]">{cell.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BriefCard index={0} tone="blue" eyebrow="Audience" label="Who this is for" value={campaign.audienceSummary} />
        <BriefCard index={1} tone="green" eyebrow="Offer" label="What Mark proposes" value={campaign.offerSummary} />
        <BriefCard index={2} tone="amber" eyebrow="Persona" label={campaign.restorationFocus} value={campaign.persona} />
        <BriefCard
          index={3}
          tone={guardrailCount > 0 ? "red" : "green"}
          eyebrow="Guardrails"
          label={`${guardrailCount} flag${guardrailCount === 1 ? "" : "s"}`}
          value={
            guardrailCount > 0
              ? reasoning.guardrailFlags.slice(0, 3).join(" · ")
              : "No risky claims recorded. Dispatch stays locked until approval."
          }
        />
      </div>

      <FullBrief campaign={campaign} sourceCount={sources.length} />
    </section>
  );
}

function DecisionStepper({
  campaignId,
  pendingApprovals,
  onOpenApprovals,
  onReviewApproval,
}: {
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  onOpenApprovals: () => void;
  onReviewApproval: (approvalId: string) => void;
}) {
  const total = pendingApprovals.length;
  const [index, setIndex] = useState(0);
  const [showContext, setShowContext] = useState(false);

  if (total === 0) {
    return (
      <div className="module-rise flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-4 shadow-[var(--elev-panel)]">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--ok)]" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--ok)]">No decision pending</div>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)]">
              Every approval on this package has been decided. Outbound stays locked.
            </p>
          </div>
        </div>
        <button type="button" onClick={onOpenApprovals} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          View approval history
        </button>
      </div>
    );
  }

  // Decisions revalidate server-side and shrink the list; clamp the cursor.
  const current = pendingApprovals[Math.min(index, total - 1)];
  const safeIndex = Math.min(index, total - 1);

  return (
    <div className="module-rise overflow-hidden rounded-2xl border border-[oklch(0.82_0.13_85/0.45)] bg-[oklch(0.82_0.13_85/0.08)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="status-breathe h-2.5 w-2.5 rounded-full bg-[var(--warn)]" />
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--warn)]">
              Decision required{total > 1 ? ` · ${total} pending` : ""}
            </span>
            <StatusPill tone={riskTone(current.riskLevel)}>{current.riskLevel} risk</StatusPill>
          </div>
          <h2 className="mt-2 truncate text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{current.title}</h2>
          <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
            {current.type} · by {current.requestedBy} · {current.submittedAt}
            {current.promptInputs.length > 0 ? ` · ${current.promptInputs.length} inputs` : ""}
          </p>
          <p className="mt-2 line-clamp-2 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{current.preview}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowContext((value) => !value)}
              aria-expanded={showContext}
              className="text-xs font-bold text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
            >
              {showContext ? "Hide full context" : "See full context"}
            </button>
            <button type="button" onClick={() => onReviewApproval(current.id)} className="text-xs font-bold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
              Open in Approvals ↗
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
          {total > 1 ? (
            <div className="flex items-center gap-2">
              <StepButton label="Previous decision" disabled={safeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
                ‹
              </StepButton>
              <span className="min-w-16 text-center font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                {safeIndex + 1} / {total}
              </span>
              <StepButton label="Next decision" disabled={safeIndex >= total - 1} onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}>
                ›
              </StepButton>
            </div>
          ) : null}
          <DecisionControls approvalItemId={current.id} campaignId={campaignId} size="md" />
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${showContext ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[oklch(0.82_0.13_85/0.3)] bg-[var(--surface-panel)] p-4">
            <ApprovalContext approval={current} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono text-base text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BriefCard({ eyebrow, label, value, tone, index }: { eyebrow: string; label: string; value: string; tone: Tone; index: number }) {
  return (
    <article style={{ animationDelay: `${index * 45}ms` }} className={`module-rise flex min-h-32 flex-col rounded-xl border p-4 ${tonePanel(tone)}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${toneText(tone)}`}>{eyebrow}</div>
      <div className="mt-1 text-xs font-bold text-[var(--text-muted)]">{label}</div>
      <p className="mt-3 line-clamp-4 text-sm font-semibold leading-6 text-[var(--text-primary)]">{value}</p>
    </article>
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

function toneText(tone: Tone) {
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  return "text-[var(--accent)]";
}

function tonePanel(tone: Tone) {
  if (tone === "green") return "border-[oklch(0.72_0.14_155/0.34)] bg-[oklch(0.43_0.12_155/0.12)]";
  if (tone === "amber") return "border-[oklch(0.78_0.14_76/0.36)] bg-[oklch(0.52_0.13_76/0.12)]";
  if (tone === "red") return "border-[oklch(0.76_0.14_18/0.32)] bg-[oklch(0.5_0.14_18/0.1)]";
  return "border-[oklch(0.76_0.14_232/0.38)] bg-[oklch(0.48_0.14_232/0.12)]";
}
