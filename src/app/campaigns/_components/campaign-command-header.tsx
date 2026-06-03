"use client";

import Link from "next/link";
import { useState } from "react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

import { ApprovalContext } from "./approval-context";
import { DecisionControls } from "./decision-controls";
import { riskTone, statusTone } from "./status-tone";

/**
 * Fused command hero for a single campaign: campaign identity (eyebrow, status,
 * title, objective, meta) on top, the live approval decision divided in below by
 * a tone-colored rule. Replaces the old separate CampaignHeader + DecisionStepper.
 */
export function CampaignCommandHeader({
  campaign,
  campaignId,
  pendingApprovals,
  onReviewApproval,
  onOpenApprovals,
}: {
  campaign: CampaignWorkspaceMeta;
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  onReviewApproval: (approvalId: string) => void;
  onOpenApprovals: () => void;
}) {
  const meta: Array<[string, string]> = [
    ["Persona", campaign.persona],
    ["Focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <header className="module-rise mb-5">
      <Link
        href="/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        Back to campaigns
      </Link>

      <div className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="relative px-6 py-5">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,oklch(0.74_0.115_232/0.16),transparent_46%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="signal-eyebrow">Campaign package</span>
              <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
              {!campaign.launchLocked ? <StatusPill tone="blue">Approved draft</StatusPill> : null}
            </div>

            <h1 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,3vw,2.4rem)] font-black leading-[1.03] tracking-[-0.04em] text-[var(--text-primary)]">
              {campaign.name}
            </h1>

            {campaign.objective ? (
              <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {meta.map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs"
                >
                  <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                  <span className="font-semibold text-[var(--text-primary)]">{value}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <DecisionZone
          campaignId={campaignId}
          pendingApprovals={pendingApprovals}
          onReviewApproval={onReviewApproval}
          onOpenApprovals={onOpenApprovals}
        />
      </div>
    </header>
  );
}

function DecisionZone({
  campaignId,
  pendingApprovals,
  onReviewApproval,
  onOpenApprovals,
}: {
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  onReviewApproval: (approvalId: string) => void;
  onOpenApprovals: () => void;
}) {
  const total = pendingApprovals.length;
  const [index, setIndex] = useState(0);
  const [showContext, setShowContext] = useState(false);

  if (total === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[oklch(0.78_0.14_158/0.45)] bg-[oklch(0.78_0.14_158/0.06)] px-6 py-4">
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
  const safeIndex = Math.min(index, total - 1);
  const current = pendingApprovals[safeIndex];

  return (
    <div className="border-t-2 border-[oklch(0.82_0.13_85/0.5)] bg-[oklch(0.82_0.13_85/0.08)]">
      <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
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
            <button
              type="button"
              onClick={() => onReviewApproval(current.id)}
              className="text-xs font-bold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
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
