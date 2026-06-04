"use client";

import { useEffect, useRef, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignDecisionEvent, CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

import { ApprovalContext } from "./approval-context";
import { SectionHeader } from "./section-header";
import { isDecidedStatus, riskTone, statusTone } from "./status-tone";

type FocusTarget = { id: string; nonce: number } | null;

/** Dot color signalling an approval's risk level — a compliant quick-scan marker
 *  in place of a colored side rail. */
function riskDotColor(risk: string) {
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "oklch(0.7 0.18 26)";
  if (r.includes("medium") || r.includes("moderate")) return "oklch(0.82 0.13 85)";
  if (r.includes("low")) return "oklch(0.78 0.14 158)";
  return "var(--border-strong)";
}

export function ApprovalsTab({
  approvals,
  history = [],
  focus = null,
}: {
  approvals: CampaignWorkspaceApproval[];
  history?: CampaignDecisionEvent[];
  focus?: FocusTarget;
}) {
  if (approvals.length === 0 && history.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No approval items are attached to this campaign yet.
      </p>
    );
  }

  const pending = approvals.filter((approval) => !isDecidedStatus(approval.status));
  const decided = approvals.filter((approval) => isDecidedStatus(approval.status));

  return (
    <div className="space-y-5">
      <DecisionHistory history={history} />

      <p className="max-w-[76ch] text-sm leading-5 text-[var(--text-secondary)]">
        Below: the draft, prompt inputs, and compliance notes Mark captured for each item. Approve or send back for rework in the{" "}
        <span className="font-semibold text-[var(--text-primary)]">Deliverables</span> tab; this log stays read-only.
      </p>

      {pending.length > 0 ? (
        <section>
          <SectionHeader tone="amber" eyebrow="Awaiting approval" detail="Decide these in the Deliverables tab." count={pending.length} />
          <div className="space-y-2">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} defaultOpen={pending.length <= 2} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="opacity-90">
          <SectionHeader tone="gray" eyebrow="Decided" detail="Resolved decision records." count={decided.length} />
          <div className="space-y-2">
            {decided.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} focus={focus} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DecisionHistory({ history }: { history: CampaignDecisionEvent[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <SectionHeader tone="blue" eyebrow="Decision history" detail="Every recorded decision, newest first." count={history.length} />
      </div>
      {history.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--text-muted)]">
          No decisions recorded yet. Approve or send back a deliverable and it shows up here with who and when.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border-hairline)]">
          {history.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-5 py-3">
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${historyDot(event.tone)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusPill tone={event.tone}>{event.action}</StatusPill>
                  <span className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">{event.itemTitle}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                  {event.decidedBy} · {event.at}
                </div>
                {event.notes ? <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">&ldquo;{event.notes}&rdquo;</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function historyDot(tone: CampaignDecisionEvent["tone"]) {
  if (tone === "green") return "bg-[var(--ok)]";
  if (tone === "red") return "bg-[var(--priority)]";
  if (tone === "amber") return "bg-[var(--warn)]";
  if (tone === "blue") return "bg-[var(--accent)]";
  return "bg-[var(--border-strong)]";
}

function ApprovalCard({
  approval,
  defaultOpen = false,
  focus = null,
}: {
  approval: CampaignWorkspaceApproval;
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
      className={`overflow-hidden rounded-lg border bg-[var(--surface-panel)] transition-shadow ${
        isFocused
          ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]"
          : decided
            ? "border-[var(--border-panel)]"
            : "border-[oklch(0.82_0.13_85/0.4)]"
      }`}
    >
      <div className="flex flex-col gap-2.5 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setManualOpen((value) => !value)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-1 font-mono text-xs text-[var(--text-muted)] transition group-hover:text-[var(--accent)]">{open ? "▾" : "▸"}</span>
          <span className="min-w-0">
            <span className="block truncate font-bold text-[var(--text-primary)]">{approval.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--text-muted)]">
              <span>{approval.type}</span>
              <span aria-hidden>·</span>
              <span>by {approval.requestedBy}</span>
              <span aria-hidden>·</span>
              <span>{approval.submittedAt}</span>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: riskDotColor(approval.riskLevel) }} />
          <StatusPill tone={riskTone(approval.riskLevel)}>{approval.riskLevel} risk</StatusPill>
          <StatusPill tone={decided ? statusTone(approval.status) : "amber"}>
            {decided ? approval.status : "Pending approval"}
          </StatusPill>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
            <ApprovalContext approval={approval} />
          </div>
        </div>
      </div>
    </article>
  );
}
