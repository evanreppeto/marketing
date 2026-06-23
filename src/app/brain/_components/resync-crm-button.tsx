"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { resyncCrmIntoBrainAction } from "@/app/brain/actions";

/**
 * Operator control to backfill every CRM record into the Brain. Idempotent —
 * safe to run repeatedly. Surfaces the action's result message inline.
 */
export function ResyncCrmButton() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function run() {
    setFeedback(null);
    startTransition(async () => {
      const result = await resyncCrmIntoBrainAction();
      setFeedback(result);
    });
  }

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1.5 lg:items-end">
      <button
        className={buttonClasses({ variant: "ghost", size: "sm" })}
        disabled={pending}
        onClick={run}
        type="button"
      >
        <RefreshCw aria-hidden className={cx("h-3.5 w-3.5", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync CRM into Brain"}
      </button>
      {feedback ? (
        <p
          aria-live="polite"
          className={cx(
            "max-w-[40ch] text-xs leading-5",
            feedback.ok ? "text-[var(--text-muted)]" : "text-[var(--priority-text)]",
          )}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
