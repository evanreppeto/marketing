import { StatusPill } from "@/app/_components/page-header";
import type { CampaignRollup } from "@/domain";

import { rollupTone } from "./status-tone";

const SEGMENTS: Array<{ key: "approved" | "pending" | "changes" | "draft"; className: string }> = [
  { key: "approved", className: "bg-[var(--ok)]" },
  { key: "pending", className: "bg-[var(--warn)]" },
  { key: "changes", className: "bg-[oklch(0.62_0.19_25)]" },
  { key: "draft", className: "bg-[var(--border-strong)]" },
];

/**
 * Action-first headline + segmented breakdown bar for a campaign's approval
 * roll-up. Presentational only — used on both the list card and the detail header.
 */
export function CampaignRollupBar({ rollup }: { rollup: CampaignRollup }) {
  const { approved, pending, changes, draft, total } = rollup;
  const ariaLabel = `${approved} approved, ${pending} pending, ${changes} need changes, ${draft} draft, of ${total} pieces`;

  return (
    <div className="space-y-1.5">
      <StatusPill tone={rollupTone(rollup.state)}>{rollup.label}</StatusPill>

      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]"
      >
        {total > 0
          ? SEGMENTS.map((segment) => {
              const value = rollup[segment.key];
              if (value === 0) return null;
              return (
                <div
                  key={segment.key}
                  className={segment.className}
                  style={{ width: `${(value / total) * 100}%` }}
                />
              );
            })
          : null}
      </div>

      <p className="text-xs font-semibold text-[var(--text-muted)]">
        {approved}/{total} approved
        {pending > 0 ? ` · ${pending} pending` : ""}
        {changes > 0 ? ` · ${changes} need changes` : ""}
        {draft > 0 ? ` · ${draft} draft` : ""}
      </p>
    </div>
  );
}
