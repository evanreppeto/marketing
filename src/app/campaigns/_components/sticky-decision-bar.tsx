"use client";

import { useEffect, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceApproval } from "@/lib/campaigns/read-model";

import { DecisionControls } from "./decision-controls";
import { riskTone } from "./status-tone";

/**
 * Slim quick-approve bar pinned to the top of the content column. Hidden until
 * the page's primary decision strip scrolls out of view (tracked via a sentinel
 * the workspace places after the overview), so Approve/Decline stay reachable
 * while reviewing deliverables far down the page. Top bar only — never a side
 * rail. Renders nothing when no approval is pending.
 */
export function StickyDecisionBar({
  campaignId,
  pendingApprovals,
  sentinelRef,
  onReview,
}: {
  campaignId: string;
  pendingApprovals: CampaignWorkspaceApproval[];
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onReview: (approvalId: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // The content scrolls inside an inner overflow container on desktop and the
    // window on mobile. IntersectionObserver is unreliable across nested
    // scrollers, so listen on the actual scroll parent and measure directly:
    // show the bar once the sentinel passes above the viewport top.
    const scroller = findScrollParent(sentinel);
    function update() {
      setVisible(sentinel!.getBoundingClientRect().top < 0);
    }

    update();
    const targets: Array<Window | HTMLElement> = scroller ? [scroller, window] : [window];
    targets.forEach((target) => target.addEventListener("scroll", update, { passive: true }));
    window.addEventListener("resize", update);
    return () => {
      targets.forEach((target) => target.removeEventListener("scroll", update));
      window.removeEventListener("resize", update);
    };
  }, [sentinelRef]);

  const total = pendingApprovals.length;
  if (total === 0) return null;

  const current = pendingApprovals[0];

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 px-4 transition-[transform,opacity] duration-200 ease-out sm:px-6 lg:left-[280px] lg:px-8 xl:px-10 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <div className="pointer-events-auto mx-auto mt-3 flex max-w-[1600px] flex-wrap items-center gap-3 rounded-xl border border-[oklch(0.82_0.13_85/0.5)] bg-[oklch(0.2_0.03_247/0.96)] px-4 py-2.5 shadow-[0_18px_44px_oklch(0.04_0.02_250/0.5)] backdrop-blur">
        <span aria-hidden className="status-breathe h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--warn)]" />
        <button
          type="button"
          onClick={() => onReview(current.id)}
          className="group min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          title="Open this item in Approvals"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--warn)]">
              Decision required{total > 1 ? ` · ${total} pending` : ""}
            </span>
            <StatusPill tone={riskTone(current.riskLevel)}>{current.riskLevel} risk</StatusPill>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-[var(--text-primary)] underline-offset-2 group-hover:underline">{current.title}</span>
            <span aria-hidden className="shrink-0 font-mono text-xs text-[var(--accent)] opacity-0 transition group-hover:opacity-100">Review ↗</span>
          </div>
        </button>
        <div className="shrink-0">
          <DecisionControls approvalItemId={current.id} campaignId={campaignId} />
        </div>
      </div>
    </div>
  );
}

/** Nearest scrollable ancestor (overflow auto/scroll with real overflow), else null. */
function findScrollParent(node: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}
