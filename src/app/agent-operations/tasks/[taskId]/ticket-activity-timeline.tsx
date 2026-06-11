import { EmptyState, StatusPill } from "@/app/_components/page-header";
import type { AgentTaskDetail } from "@/lib/agent-operations/read-model";

type LiveDetail = Extract<AgentTaskDetail, { status: "live" }>;

export function TicketActivityTimeline({ timeline }: { timeline: LiveDetail["timeline"] }) {
  return (
    <section className="module-rise rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-4 sm:px-5">
        <div className="signal-eyebrow">Activity</div>
        <h2 className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">Ticket timeline</h2>
      </div>

      {timeline.length > 0 ? (
        <ol className="divide-y divide-[var(--border-hairline)]">
          {timeline.map((item) => (
            <li className="grid gap-3 px-4 py-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:px-5" key={`${item.source}-${item.id}-${item.eventType}`}>
              <div className="flex flex-wrap items-start gap-2 sm:block">
                <StatusPill tone={sourceTone(item.source)}>{item.source}</StatusPill>
                <div className="mt-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:mt-2">
                  {humanize(item.eventType)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h3>
                  <time className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{formatDate(item.createdAt)}</time>
                </div>
                {item.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="p-4 sm:p-5">
          <EmptyState title="No timeline entries yet" detail="Task events, Mark outputs, and approval movement will collect here as the shared ticket changes." />
        </div>
      )}
    </section>
  );
}

function sourceTone(source: LiveDetail["timeline"][number]["source"]): "amber" | "green" | "red" | "blue" | "gray" {
  if (source === "Mark") return "blue";
  if (source === "Human") return "amber";
  if (source === "Approval") return "green";
  return "gray";
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
