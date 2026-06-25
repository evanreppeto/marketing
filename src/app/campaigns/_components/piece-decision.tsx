"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/app/_components/page-header";
import { MAX_REVISION_INSTRUCTION_LENGTH } from "@/domain";

import { decideAssetAction, requestRevisionAction } from "../actions";

/**
 * Decision controls for a single deliverable, keyed by asset id. Three real
 * paths:
 *  - Approve  → `decideAssetAction(approved)` (unlocks the piece for launch).
 *  - Request rework → reveals a notes field and calls `requestRevisionAction`,
 *    which queues {agentName} to revise the piece with the operator's
 *    instruction. Outbound stays locked. This is the path that was previously
 *    a bare "decline" with no notes — now it actually sends Arc the change.
 *  - Remove → `decideAssetAction(archived)` (drops it from the queue).
 */
export function PieceDecision({
  campaignId,
  assetId,
  agentName,
}: {
  campaignId: string;
  assetId: string;
  agentName: string;
}) {
  const [decideState, decideAction, deciding] = useActionState(decideAssetAction, null);
  const [reworkState, reworkAction, reworking] = useActionState(requestRevisionAction, null);
  const [reworkOpen, setReworkOpen] = useState(false);
  const reworkFieldId = useId();

  // A successful rework submission collapses the panel back; the success line
  // shows on the main row via `reworkState`.
  const reworkDone = reworkState?.ok === true;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <Button type="submit" name="decision" value="approved" variant="approve" size="sm" disabled={deciding}>
            Approve &amp; move on
          </Button>
          <button
            type="submit"
            name="decision"
            value="archived"
            disabled={deciding}
            className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--priority-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--priority)] disabled:pointer-events-none disabled:opacity-60"
          >
            Remove from queue
          </button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setReworkOpen((open) => !open)}
          aria-expanded={reworkOpen}
          aria-controls={reworkFieldId}
        >
          {reworkOpen ? "Cancel rework" : "Request rework"}
        </Button>
        {decideState ? (
          <span className={`text-xs font-semibold ${decideState.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
            {decideState.message}
          </span>
        ) : null}
        {reworkDone ? <span className="text-xs font-semibold text-[var(--ok-text)]">{reworkState?.message}</span> : null}
      </div>

      {reworkOpen && !reworkDone ? (
        <form action={reworkAction} className="space-y-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <label htmlFor={reworkFieldId} className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Tell {agentName} what to change
          </label>
          <textarea
            id={reworkFieldId}
            name="instruction"
            rows={3}
            maxLength={MAX_REVISION_INSTRUCTION_LENGTH}
            placeholder="e.g. Lead with the 60-minute response time and make the CTA stronger."
            className="w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="revision" size="sm" disabled={reworking}>
              {reworking ? "Sending…" : `Send rework to ${agentName}`}
            </Button>
            <span className="text-xs text-[var(--text-muted)]">Outbound stays locked while {agentName} revises.</span>
            {reworkState && !reworkState.ok ? (
              <span className="text-xs font-semibold text-[var(--warn-text)]">{reworkState.message}</span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
