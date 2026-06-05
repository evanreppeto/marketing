"use client";

import { useActionState } from "react";

import { Button, StatusPill } from "@/app/_components/page-header";
import { groupByStatus, statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

import {
  cancelDispatchAction,
  markDispatchDeliveredAction,
  markDispatchFailedAction,
  markDispatchSentAction,
  type DispatchActionState,
} from "../actions";

export function OutboxConsole({ dispatches }: { dispatches: DispatchView[] }) {
  const groups = groupByStatus(dispatches).filter((group) => group.items.length > 0);

  if (dispatches.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        Nothing queued yet. When you launch a campaign, each approved deliverable lands here as a queued dispatch. The app records
        and hands off — it never sends.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section
          key={group.status}
          className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
            <StatusPill tone={STATUS_TONE[group.status]}>{statusLabel(group.status)}</StatusPill>
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-muted)]">{group.items.length}</span>
          </div>
          <ul className="divide-y divide-[var(--border-hairline)]">
            {group.items.map((dispatch) => (
              <DispatchRow key={dispatch.id} dispatch={dispatch} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DispatchRow({ dispatch }: { dispatch: DispatchView }) {
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-[var(--text-primary)]">{dispatch.deliverable}</div>
        <div className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">
          {dispatch.campaignName} · {dispatch.channel}
          {dispatch.recipientSummary ? ` · ${dispatch.recipientSummary}` : ""}
          {dispatch.dispatchedAt ? ` · sent ${dispatch.dispatchedAt}` : ""}
        </div>
        {dispatch.resultNote ? <div className="mt-1 text-xs text-[var(--text-secondary)]">{dispatch.resultNote}</div> : null}
      </div>
      <DispatchControls dispatch={dispatch} />
    </li>
  );
}

function DispatchControls({ dispatch }: { dispatch: DispatchView }) {
  if (dispatch.status === "delivered" || dispatch.status === "canceled") {
    return <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">No actions</span>;
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {dispatch.status === "queued" || dispatch.status === "scheduled" ? (
        <TransitionButton action={markDispatchSentAction} dispatch={dispatch} label="Mark sent" variant="primary" />
      ) : null}
      {dispatch.status === "sent" ? (
        <>
          <TransitionButton action={markDispatchDeliveredAction} dispatch={dispatch} label="Delivered" variant="approve" />
          <TransitionButton action={markDispatchFailedAction} dispatch={dispatch} label="Failed" variant="priority" />
        </>
      ) : null}
      {dispatch.status !== "failed" ? (
        <TransitionButton action={cancelDispatchAction} dispatch={dispatch} label="Cancel" variant="ghost" />
      ) : (
        <TransitionButton action={markDispatchSentAction} dispatch={dispatch} label="Retry → sent" variant="ghost" />
      )}
    </div>
  );
}

function TransitionButton({
  action,
  dispatch,
  label,
  variant,
}: {
  action: (prev: DispatchActionState, formData: FormData) => Promise<DispatchActionState>;
  dispatch: DispatchView;
  label: string;
  variant: "primary" | "approve" | "priority" | "ghost";
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="dispatchId" value={dispatch.id} />
      <input type="hidden" name="campaignId" value={dispatch.campaignId} />
      <Button type="submit" variant={variant} size="sm" disabled={isPending}>
        {isPending ? "…" : label}
      </Button>
      {state && !state.ok ? <span className="text-xs font-semibold text-[oklch(0.86_0.09_26)]">{state.message}</span> : null}
    </form>
  );
}
