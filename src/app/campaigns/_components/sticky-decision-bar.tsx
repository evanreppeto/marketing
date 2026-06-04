"use client";

import { useActionState, useEffect, useState } from "react";

import { Button, buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignLaunchState } from "@/lib/campaigns/read-model";

import { launchCampaignAction } from "../actions";

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

/**
 * Slim launch/review status pinned to the top once the main Launch tracker
 * scrolls out of view. It mirrors the tracker — never a second approval surface:
 * it either jumps to the pieces that still need a decision or launches the
 * campaign when it's ready. Hidden when the campaign is already live.
 */
export function StickyDecisionBar({
  campaignId,
  launchState,
  sentinelRef,
  onReviewPieces,
}: {
  campaignId: string;
  launchState: CampaignLaunchState;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onReviewPieces: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [state, formAction, isPending] = useActionState(launchCampaignAction, null);

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

  const { requiredCount, approvedCount, pendingCount, ready, live, lifecycle } = launchState;
  // Nothing actionable to surface once it's live or there are no pieces.
  if (live || requiredCount === 0) return null;

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 px-4 transition-[transform,opacity] duration-200 ease-out sm:px-6 lg:left-[280px] lg:px-8 xl:px-10 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <div className="pointer-events-auto mx-auto mt-3 flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border-panel)] bg-[oklch(0.2_0.03_247/0.96)] px-4 py-2.5 shadow-[0_18px_44px_oklch(0.04_0.02_250/0.5)] backdrop-blur">
        <span className="flex items-center gap-2">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${ready ? "bg-[var(--ok)]" : "status-breathe bg-[var(--warn)]"}`} />
          <StatusPill tone={LIFECYCLE_TONE[lifecycle]}>{lifecycle}</StatusPill>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-secondary)]">
          <span className="font-mono tabular-nums text-[var(--text-primary)]">{approvedCount}</span>/{requiredCount} approved
          {pendingCount > 0 ? ` · ${pendingCount} need${pendingCount === 1 ? "s" : ""} you` : ""}
          {state && !state.ok ? <span className="ml-2 text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
        </span>
        {ready ? (
          <form action={formAction} className="shrink-0">
            <input type="hidden" name="campaignId" value={campaignId} />
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Launching…" : "Launch campaign"}
            </Button>
          </form>
        ) : (
          <button type="button" onClick={onReviewPieces} className={`${buttonClasses({ variant: "ghost", size: "sm" })} shrink-0`}>
            Review {pendingCount} {pendingCount === 1 ? "piece" : "pieces"}
          </button>
        )}
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
