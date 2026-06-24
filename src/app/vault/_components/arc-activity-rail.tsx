import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import type { ArcActivity } from "@/lib/vault/live-signals";

export function ArcActivityRail({
  activity,
  isLive,
  reviewHref,
}: {
  activity: ArcActivity;
  isLive: boolean;
  reviewHref: string;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="signal-eyebrow">{activity.name} — live</div>
        <StatusPill tone={isLive ? "green" : "gray"}>{isLive ? activity.status : "Offline"}</StatusPill>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className={`h-2 w-2 rounded-full ${isLive ? "bg-[oklch(0.78_0.14_158)] status-breathe" : "bg-[var(--text-muted)]"}`} aria-hidden="true" />
        <span>{activity.killSwitch}</span>
        <span className="text-[var(--text-muted)]">· heartbeat {activity.lastHeartbeat}</span>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-[var(--text-muted)]">Drafting now</div>
        {activity.drafting.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {activity.drafting.map((task, i) => (
              <li className="flex items-start justify-between gap-2 text-sm" key={`${task.title}-${i}`}>
                <span className="min-w-0 truncate text-[var(--text-primary)]">{task.title}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{task.updated}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Nothing in progress.</p>
        )}
      </div>

      <Link
        className="mt-4 flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 transition hover:border-[var(--border-strong)]"
        href={reviewHref}
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">Awaiting review</span>
        <StatusPill tone={activity.awaitingReview > 0 ? "amber" : "gray"}>{activity.awaitingReview}</StatusPill>
      </Link>

      <div className="mt-4">
        <div className="text-xs font-medium text-[var(--text-muted)]">Recent output</div>
        {activity.recentOutputs.length > 0 ? (
          <ul className="mt-2 divide-y divide-[var(--border-hairline)]">
            {activity.recentOutputs.map((output, i) => (
              <li className="flex items-center justify-between gap-2 py-2 text-sm" key={`${output.title}-${i}`}>
                <span className="min-w-0 truncate text-[var(--text-secondary)]">{output.title}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{output.time}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-muted)]">No recent output.</p>
        )}
      </div>
    </Panel>
  );
}
