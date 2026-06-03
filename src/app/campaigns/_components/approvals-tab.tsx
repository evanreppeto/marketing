"use client";

import { useEffect, useRef, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

import { ApprovalContext } from "./approval-context";
import { DecisionControls } from "./decision-controls";
import { SectionHeader } from "./section-header";
import { isDecidedStatus, riskTone, statusTone } from "./status-tone";

type FocusTarget = { id: string; nonce: number } | null;

/** Left-rail color signalling an approval's risk level. Applied inline so it
 *  wins over the class-based border-color shorthand regardless of CSS order. */
function riskRailColor(risk: string) {
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "oklch(0.7 0.18 26)";
  if (r.includes("medium") || r.includes("moderate")) return "oklch(0.82 0.13 85)";
  if (r.includes("low")) return "oklch(0.78 0.14 158)";
  return "var(--border-strong)";
}

export function ApprovalsTab({
  approvals,
  campaignId,
  focus = null,
}: {
  approvals: CampaignWorkspaceApproval[];
  campaignId: string;
  focus?: FocusTarget;
}) {
  if (approvals.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No approval items are attached to this campaign yet.
      </p>
    );
  }

  const pending = approvals.filter((approval) => !isDecidedStatus(approval.status));
  const decided = approvals.filter((approval) => isDecidedStatus(approval.status));

  return (
    <div className="space-y-3">
      <p className="max-w-[76ch] text-sm leading-6 text-[var(--text-secondary)]">
        Each item shows the draft, prompt inputs, and compliance notes Mark recorded — expand to read the full context, then approve,
        decline, or archive. Decisions are backend state transitions; outbound stays locked.
      </p>

      {pending.length > 0 ? (
        <section>
          <SectionHeader tone="amber" eyebrow="Decision required" detail="Awaiting your review — outbound stays locked." count={pending.length} />
          <div className="space-y-2.5">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} defaultOpen={pending.length <= 2} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="opacity-90">
          <SectionHeader tone="gray" eyebrow="Decided" detail="Resolved decision records." count={decided.length} />
          <div className="space-y-2.5">
            {decided.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} campaignId={campaignId} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ApprovalCard({
  approval,
  campaignId,
  defaultOpen = false,
  focus = null,
}: {
  approval: CampaignWorkspaceApproval;
  campaignId: string;
  defaultOpen?: boolean;
  focus?: FocusTarget;
}) {
  const isFocused = focus?.id === approval.id;
  const [manualOpen, setManualOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement | null>(null);
  const decided = isDecidedStatus(approval.status);
  // A card the operator navigated to is always expanded; otherwise honor toggle.
  const open = manualOpen || isFocused;

  useEffect(() => {
    if (isFocused) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isFocused, focus?.nonce]);

  return (
    <article
      ref={ref}
      style={{ borderLeftColor: riskRailColor(approval.riskLevel) }}
      className={`overflow-hidden rounded-xl border border-l-4 bg-[var(--surface-panel)] transition-shadow ${
        isFocused
          ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]"
          : decided
            ? "border-[var(--border-panel)]"
            : "border-[oklch(0.82_0.13_85/0.4)]"
      }`}
    >
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setManualOpen((value) => !value)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-1 font-mono text-xs text-[var(--text-muted)] transition group-hover:text-[var(--accent)]">{open ? "▾" : "▸"}</span>
          <span className="min-w-0">
            <span className="block truncate font-bold text-[var(--text-primary)]">{approval.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--text-muted)]">
              <span>{approval.type}</span>
              <span aria-hidden>·</span>
              <span>by {approval.requestedBy}</span>
              <span aria-hidden>·</span>
              <span>{approval.submittedAt}</span>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={riskTone(approval.riskLevel)}>{approval.riskLevel} risk</StatusPill>
          {decided ? (
            <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
          ) : (
            <DecisionControls approvalItemId={approval.id} campaignId={campaignId} />
          )}
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <ApprovalContext approval={approval} />
          </div>
        </div>
      </div>
    </article>
  );
}
