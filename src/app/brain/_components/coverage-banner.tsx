import { DatabaseZap } from "lucide-react";

import { ResyncCrmButton } from "./resync-crm-button";

/**
 * Shown above the Brain when its memory trails the CRM. A stale or empty graph is
 * the main reason the Brain "isn't adding all the companies/contacts/leads" — this
 * makes the gap obvious and puts the one-click backfill (which now also links
 * records through their personas and parents) right next to it.
 */
export function BrainCoverageBanner({
  behind,
  crmRecords,
  brainRecords,
}: {
  behind: number;
  crmRecords: number;
  brainRecords: number;
}) {
  if (behind <= 0) return null;
  return (
    <div className="flex flex-col gap-3 border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--warn-text)]">
          <DatabaseZap aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-medium text-[var(--text-primary)]">
            {behind.toLocaleString()} CRM {behind === 1 ? "record isn’t" : "records aren’t"} in the Brain yet
          </p>
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            {brainRecords.toLocaleString()} of {crmRecords.toLocaleString()} companies, contacts, leads, and more are
            mirrored in. Sync to add the rest and link them through their personas and records.
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:self-center">
        <ResyncCrmButton />
      </div>
    </div>
  );
}
