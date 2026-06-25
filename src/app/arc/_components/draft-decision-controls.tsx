"use client";

import { useActionState, useId, useState } from "react";

import { MAX_REVISION_INSTRUCTION_LENGTH } from "@/domain";

import { decideAssetAction, requestRevisionAction } from "@/app/campaigns/actions";

/**
 * Inline Approve / Comment-&-revise / Decline for an Arc draft card — the same
 * three real backend paths as the campaign builder, but in the chat thread so the
 * operator never has to leave for Studio. Approve unlocks the piece for launch;
 * Comment & revise reveals a notes field and sends Arc the change in place
 * (asset → 'revision requested'); Decline removes it. Outbound stays locked.
 */
export function DraftDecisionControls({ campaignId, assetId }: { campaignId: string; assetId: string }) {
  const [decideState, decideAction, deciding] = useActionState(decideAssetAction, null);
  const [reworkState, reworkAction, reworking] = useActionState(requestRevisionAction, null);
  const [reworkOpen, setReworkOpen] = useState(false);
  const reworkFieldId = useId();
  const reworkDone = reworkState?.ok === true;

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <button
            type="submit"
            name="decision"
            value="approved"
            disabled={deciding}
            className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1 text-xs font-semibold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)] disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="declined"
            disabled={deciding}
            className="rounded-md border border-[var(--border-hairline)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)] disabled:opacity-60"
          >
            Decline
          </button>
        </form>
        <button
          type="button"
          onClick={() => setReworkOpen((open) => !open)}
          aria-expanded={reworkOpen}
          aria-controls={reworkFieldId}
          className="rounded-md border border-[var(--accent-border-strong)] px-3 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-soft)]"
        >
          {reworkOpen ? "Cancel" : "Comment & revise"}
        </button>
        {decideState ? (
          <span className={`text-xs font-semibold ${decideState.ok ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>
            {decideState.message}
          </span>
        ) : null}
        {reworkDone ? <span className="text-xs font-semibold text-[var(--ok-text)]">{reworkState?.message}</span> : null}
      </div>

      {reworkOpen && !reworkDone ? (
        <form action={reworkAction} className="space-y-2 rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)] p-3">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <label htmlFor={reworkFieldId} className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Tell Arc what to change
          </label>
          <textarea
            id={reworkFieldId}
            name="instruction"
            rows={3}
            maxLength={MAX_REVISION_INSTRUCTION_LENGTH}
            placeholder="e.g. Make the opening warmer and drop the deadline pressure."
            className="w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={reworking}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {reworking ? "Sending…" : "Send to Arc"}
            </button>
            <span className="text-[11px] text-[var(--text-muted)]">Arc redrafts in place; outbound stays locked.</span>
            {reworkState && !reworkState.ok ? (
              <span className="text-xs font-semibold text-[var(--warn-text)]">{reworkState.message}</span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
