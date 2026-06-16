import { EmptyState, Panel, StatusPill } from "../../../_components/page-header";
import { type TimelineEntry } from "@/lib/interactions/read-model";
import { type ActorKind } from "@/domain";

export function ActorBadge({ kind, label }: { kind: ActorKind; label: string }) {
  const tone = kind === "agent" ? "blue" : kind === "system" ? "gray" : "green";
  const who = kind === "agent" ? "Arc" : kind === "system" ? "System" : "Human";
  return (
    <StatusPill tone={tone}>
      {who}
      {label && label !== who ? ` - ${label}` : ""}
    </StatusPill>
  );
}

const TONE_DOT: Record<string, string> = {
  green: "bg-[oklch(0.78_0.14_158)]",
  red: "bg-[oklch(0.68_0.2_26)]",
  amber: "bg-[var(--warn)]",
  blue: "bg-[var(--accent)]",
  gray: "bg-[var(--text-muted)]",
};

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function RecordTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Activity</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Timeline</h2>
      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No activity yet" detail="Notes, tasks, and logged calls will appear here." />
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${TONE_DOT[entry.tone] ?? TONE_DOT.gray}`} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{entry.summary}</span>
                  <ActorBadge kind={entry.actorKind} label={entry.actorLabel} />
                </div>
                {entry.detail ? (
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{entry.detail}</p>
                ) : null}
                <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {when(entry.occurredAt)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
