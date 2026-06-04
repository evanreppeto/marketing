"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/page-header";

import { decideAssetAction } from "../actions";

export type DecisionControlLabels = {
  approve: string;
  decline: string;
  archive: string;
};

export function decisionTargetFromType(type: string) {
  const normalized = type.toLowerCase();
  if (/image|creative set|media|video|visual/.test(normalized)) return "image set";
  if (/paid|ad|search|display|meta|google/.test(normalized)) return "ad draft";
  if (/email/.test(normalized)) return "email draft";
  if (/sms|text/.test(normalized)) return "message draft";
  if (/landing|page/.test(normalized)) return "landing page draft";
  return type.toLowerCase();
}

export function decisionLabelsForTarget(target: string): DecisionControlLabels {
  return {
    approve: `Approve ${target}`,
    decline: "Request rework",
    archive: "Remove from queue",
  };
}

/**
 * Approve / Request rework / Remove controls for a single deliverable, keyed by
 * asset id so every piece is decidable (with or without an approval gate). Three
 * submit buttons share one form; the clicked button supplies `decision`.
 */
export function DecisionControls({
  assetId,
  campaignId,
  labels,
  size = "sm",
}: {
  assetId: string;
  campaignId: string;
  labels?: DecisionControlLabels;
  size?: "sm" | "md";
}) {
  const [state, formAction, isPending] = useActionState(decideAssetAction, null);
  const buttonLabels = labels ?? { approve: "Approve", decline: "Decline", archive: "Archive" };

  // Hierarchy: Approve is the single emphasized action. "Request rework" is a
  // quiet secondary; "Remove from queue" is the quietest, tinted toward
  // priority on hover to read as destructive without shouting.
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button type="submit" name="decision" value="approved" variant="approve" size={size} disabled={isPending}>
        {buttonLabels.approve}
      </Button>
      <Button type="submit" name="decision" value="declined" variant="ghost" size={size} disabled={isPending}>
        {buttonLabels.decline}
      </Button>
      <button
        type="submit"
        name="decision"
        value="archived"
        disabled={isPending}
        className={`inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--priority-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--priority)] disabled:pointer-events-none disabled:opacity-60 ${size === "md" ? "min-h-11" : ""}`}
      >
        {buttonLabels.archive}
      </button>
      {state ? (
        <span className={`text-xs font-semibold ${state.ok ? "text-[oklch(0.88_0.1_158)]" : "text-[oklch(0.86_0.09_26)]"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
