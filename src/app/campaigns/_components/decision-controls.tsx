"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/page-header";

import { decideApprovalAction } from "../actions";

/**
 * Approve / Decline / Archive controls for a campaign approval item. Three
 * submit buttons share one form; the clicked button supplies `decision`.
 */
export function DecisionControls({
  approvalItemId,
  campaignId,
  size = "sm",
}: {
  approvalItemId: string;
  campaignId: string;
  size?: "sm" | "md";
}) {
  const [state, formAction, isPending] = useActionState(decideApprovalAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="approvalItemId" value={approvalItemId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button type="submit" name="decision" value="approved" variant="primary" size={size} disabled={isPending}>
        Approve
      </Button>
      <Button type="submit" name="decision" value="declined" variant="ghost" size={size} disabled={isPending}>
        Decline
      </Button>
      <Button type="submit" name="decision" value="archived" variant="ghost" size={size} disabled={isPending}>
        Archive
      </Button>
      {state ? (
        <span className={`text-xs font-semibold ${state.ok ? "text-[oklch(0.88_0.1_158)]" : "text-[oklch(0.86_0.09_26)]"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
