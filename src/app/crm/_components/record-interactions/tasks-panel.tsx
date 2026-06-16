import { ActorBadge } from "./timeline";
import { EmptyState, Panel, StatusPill, buttonClasses } from "../../../_components/page-header";
import { completeTaskAction, createTaskAction } from "../../interactions-actions";
import { type TaskEntry } from "@/lib/interactions/read-model";
import { type CrmEntityType } from "@/domain";

const inputClass =
  "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]";

const URGENCY_TONE: Record<TaskEntry["urgency"], "red" | "amber" | "blue" | "gray"> = {
  overdue: "red",
  due_today: "amber",
  upcoming: "blue",
  none: "gray",
};

const URGENCY_LABEL: Record<TaskEntry["urgency"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
  none: "No due date",
};

function dueLabel(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function TasksPanel({
  entityType,
  entityId,
  tasks,
}: {
  entityType: CrmEntityType;
  entityId: string;
  tasks: TaskEntry[];
}) {
  const open = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const done = tasks.filter((task) => task.status === "completed" || task.status === "canceled");

  return (
    <Panel className="module-rise">
      <div className="signal-eyebrow">Follow-ups</div>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">Tasks</h2>

      <form action={createTaskAction} className="mt-4 space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input name="title" required placeholder="What needs to happen next?" className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="dueAt" className={inputClass} />
          <select name="priority" defaultValue="normal" className={inputClass}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses({ variant: "primary", size: "sm" })}>
            Create task
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {open.length === 0 ? (
          <EmptyState title="No open tasks" detail="Create a follow-up above." />
        ) : (
          open.map((task) => (
            <div
              key={task.id}
              className={`rounded-lg border p-3 ${
                task.urgency === "overdue"
                  ? "border-[oklch(0.68_0.2_26/0.5)] bg-[oklch(0.68_0.2_26/0.1)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</span>
                <StatusPill tone={URGENCY_TONE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</StatusPill>
                <StatusPill tone={task.priority === "urgent" || task.priority === "high" ? "red" : "gray"}>
                  {task.priority}
                </StatusPill>
                <ActorBadge kind={task.actorKind} label={task.actorLabel} />
              </div>
              {task.description ? (
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{task.description}</p>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Due {dueLabel(task.dueAt)}
                </span>
                <form action={completeTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="entityType" value={entityType} />
                  <input type="hidden" name="entityId" value={entityId} />
                  <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                    Arc complete
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
        {done.length > 0 ? (
          <div className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {done.length} completed / closed
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
