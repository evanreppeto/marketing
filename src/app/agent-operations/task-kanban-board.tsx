"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { EntityAvatar } from "../_components/entity-avatar";
import { priorityIcon, statusIcon } from "../_components/ticket-icons";

import { formatScheduleLabel } from "@/domain";

import { moveTaskAction } from "./actions";
import { badgeStyle, laneStyle, priorityAppearance, statusAppearance, type TaskVisualAppearance } from "./task-visuals";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

const COLUMNS: Array<{ key: string; label: string; description: string }> = [
  { key: "queued", label: "Waiting", description: "Ready for Mark" },
  { key: "running", label: "Working", description: "Mark is active" },
  { key: "blocked", label: "Blocked", description: "Needs a fix" },
  { key: "needs_approval", label: "Review", description: "Human decision" },
  { key: "completed", label: "Done", description: "Finished work" },
];

const CLOSED_STATUSES = new Set(["failed", "canceled"]);
const DRAG_THRESHOLD = 5;

type DragState = {
  taskId: string;
  fromStatus: string;
  task: AgentOperationsTask;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overStatus: string | null;
  moved: boolean;
};

type OptimisticMove = { taskId: string; toStatus: string };

export function TaskKanbanBoard({ tasks }: { tasks: AgentOperationsTask[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state: AgentOperationsTask[], move: OptimisticMove) =>
      state.map((task) => (task.fullId === move.taskId ? { ...task, status: move.toStatus } : task)),
  );

  // Live polling: refresh server data while the board is visible. When Mark moves
  // a task or reports progress via his API, the next refresh reflects it.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 8000);
    return () => window.clearInterval(id);
  }, [router]);

  const dragRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragRef.current = drag;
  });

  function commitMove(taskId: string, toStatus: string) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ taskId, toStatus });
      const result = await moveTaskAction(taskId, toStatus);
      if (!result.ok) setError(result.message);
    });
  }

  function startDrag(event: React.PointerEvent, task: AgentOperationsTask) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDrag({
      taskId: task.fullId,
      fromStatus: task.status,
      task,
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      overStatus: task.status,
      moved: false,
    });
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const moved =
        d.moved ||
        Math.abs(event.clientX - d.startX) > DRAG_THRESHOLD ||
        Math.abs(event.clientY - d.startY) > DRAG_THRESHOLD;

      let overStatus = d.overStatus;
      if (moved) {
        const under = document.elementFromPoint(event.clientX, event.clientY);
        overStatus = under?.closest<HTMLElement>("[data-drop-status]")?.dataset.dropStatus ?? null;
      }
      setDrag({ ...d, x: event.clientX, y: event.clientY, moved, overStatus });
    }

    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      if (!d.moved) {
        router.push(d.task.href);
        return;
      }
      if (d.overStatus && d.overStatus !== d.fromStatus) {
        commitMove(d.taskId, d.overStatus);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = optimisticTasks.filter((t) => !CLOSED_STATUSES.has(t.status));
  const closedCount = optimisticTasks.length - open.length;
  const dragging = drag?.moved ?? false;

  return (
    <section className={`overflow-hidden ${dragging ? "select-none" : ""}`}>
      <style>{KANBAN_CSS}</style>

      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Color key</span>
          {COLUMNS.map((column) => {
            const appearance = statusAppearance(column.key);
            return (
              <span
                className="inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold"
                key={column.key}
                style={badgeStyle(appearance)}
                title={column.description}
              >
                <CardIconSlot>{statusIcon(column.key)}</CardIconSlot>
                {column.label}
              </span>
            );
          })}
        </div>
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          {open.length} visible tasks. Higher priority stays at the top.
        </span>
      </div>

      {error ? (
        <div className="border-b border-[var(--priority-border)] bg-[var(--priority-soft)] px-4 py-2 text-sm font-semibold text-[var(--priority-text)]">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto p-3">
        <div className="grid min-w-[940px] grid-cols-5 gap-3">
          {COLUMNS.map((col) => {
            const cards = open.filter((task) => task.status === col.key).sort(compareTaskPriority);
            const isValidTarget = dragging && drag?.overStatus === col.key && drag?.fromStatus !== col.key;
            const appearance = statusAppearance(col.key);
            return (
              <div
                className={`kanban-col flex min-h-[140px] flex-col rounded-xl border border-[var(--border-hairline)] ${
                  isValidTarget ? "kanban-col--over" : ""
                }`}
                data-drop-status={col.key}
                key={col.key}
                style={laneStyle(appearance)}
              >
                <div className="kanban-col-header sticky top-0 z-[1] flex items-center justify-between rounded-t-xl border-b px-3 py-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--lane-text)]">
                      <CardIconSlot>{statusIcon(col.key)}</CardIconSlot>
                      {col.label}
                    </span>
                    <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--text-muted)]">{col.description}</p>
                  </div>
                  <span className="rounded-full border border-[var(--lane-border)] bg-[var(--surface-panel)] px-2 text-[10px] font-bold text-[var(--lane-text)]">
                    {cards.length} {cards.length === 1 ? "card" : "cards"}
                  </span>
                </div>

                <div className="kanban-col-body flex-1 space-y-2 overflow-y-auto p-2">
                  {isValidTarget ? (
                    <div className="kanban-slot" style={{ ["--slot-h" as string]: `${drag?.height ?? 56}px` }} />
                  ) : null}

                  {cards.map((task) => (
                    <Card
                      ghost={drag?.taskId === task.fullId && dragging}
                      key={task.fullId}
                      onPointerDown={(event) => startDrag(event, task)}
                      task={task}
                    />
                  ))}

                  {cards.length === 0 && !isValidTarget ? (
                    <div className="rounded-lg border border-dashed border-[var(--lane-border)] bg-[var(--lane-soft)] px-2 py-5 text-center text-[10.5px] font-medium text-[var(--text-muted)]">
                      Nothing {col.label.toLowerCase()}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {closedCount > 0 ? (
          <div className="mt-2 px-1 text-[11px] font-medium text-[var(--text-muted)]">
            Hidden failed or canceled tasks: {closedCount}
          </div>
        ) : null}
      </div>

      {drag && dragging
        ? createPortal(
            <div
              className="kanban-overlay"
              style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
            >
              <Card overlay task={drag.task} />
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function Card({
  task,
  ghost = false,
  overlay = false,
  onPointerDown,
}: {
  task: AgentOperationsTask;
  ghost?: boolean;
  overlay?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
}) {
  const accent = priorityAccent(task.priority);
  const needsApproval = Boolean(task.approvalHref) || /approval/i.test(`${task.status} ${task.approval}`);
  const working = task.status === "running";
  const visibleStatus = needsApproval ? "needs_approval" : task.status;
  const status = statusAppearance(visibleStatus);
  const priority = priorityAccent(task.priority);
  const pct =
    task.progress && task.progress.total > 0
      ? Math.min(100, Math.round((task.progress.done / task.progress.total) * 100))
      : null;
  const now = useMemo(() => new Date(), []);
  const scheduledLabel =
    task.status === "queued" && task.scheduledFor && new Date(task.scheduledFor).getTime() > now.getTime()
      ? formatScheduleLabel(task.scheduledFor, now)
      : null;
  const ownerLabel = task.owner?.label ?? "Operator";
  const driverLabel = task.driver?.label ?? task.agentName;
  const driverIsMark = task.driver?.kind === "agent";
  const nextAction = nextActionLabel(task.status, needsApproval, working, scheduledLabel, driverLabel);
  const statusLabel = status.label;

  return (
    <article
      className={`kanban-card group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-3 ${
        ghost ? "kanban-card--ghost" : ""
      } ${overlay ? "kanban-card--overlay" : ""}`}
      onPointerDown={onPointerDown}
      style={cardStyle(status, accent)}
    >
      <div className="flex items-start gap-2.5">
        <EntityAvatar
          owner={driverIsMark ? { kind: "agent" } : { kind: "human", name: driverLabel }}
          size={24}
          pending={working}
        />
        <div className="min-w-0">
          <p className="line-clamp-3 text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
            {task.objective}
          </p>
          <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
            Owner: {ownerLabel} / Doing: {driverLabel}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--border-hairline)] pt-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold" style={badgeStyle(status)}>
            <CardIconSlot>{statusIcon(visibleStatus)}</CardIconSlot>
            {statusLabel}
          </span>
          <span className="min-w-0 truncate">{nextAction}</span>
        </div>
      </div>

      {pct !== null ? (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="mt-1 block text-[10px] font-medium text-[var(--text-muted)]">
            {task.progress!.done} of {task.progress!.total}
          </span>
        </div>
      ) : null}

      {working && !overlay ? <div className="kanban-shimmer mt-3" /> : null}

      <div className="mt-3 flex items-center justify-between gap-2 text-[10.5px] text-[var(--text-muted)]">
        <span className="min-w-0 truncate">{scheduledLabel ? `Scheduled / ${scheduledLabel}` : formatDue(task.dueAt)}</span>
        {working ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-bold text-[var(--lane-text)]">
            <span className="kanban-presence" />
            Live
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold" style={badgeStyle(priority)}>
            <CardIconSlot>{priorityIcon(task.priority)}</CardIconSlot>
            {titleize(task.priority)}
          </span>
        )}
      </div>
    </article>
  );
}

function CardIconSlot({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{children}</span>;
}

function priorityAccent(priority: string): TaskVisualAppearance {
  return priorityAppearance(priority);
}

function cardStyle(status: TaskVisualAppearance, priority: TaskVisualAppearance): CSSProperties {
  return {
    "--lane-accent": status.accent,
    "--lane-soft": status.soft,
    "--lane-border": status.border,
    "--lane-text": status.text,
    boxShadow: `inset 2px 0 0 ${priority.accent}, inset 0 1px 0 ${status.border}`,
  } as CSSProperties;
}

function compareTaskPriority(left: AgentOperationsTask, right: AgentOperationsTask) {
  const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
  if (priorityDelta !== 0) return priorityDelta;

  const dueDelta = dueRank(left.dueAt) - dueRank(right.dueAt);
  if (dueDelta !== 0) return dueDelta;

  return timestampRank(right.updated) - timestampRank(left.updated);
}

function priorityRank(priority: string) {
  const normalized = priority.toLowerCase();
  if (normalized.includes("urgent")) return 4;
  if (normalized.includes("high")) return 3;
  if (normalized.includes("medium")) return 2;
  if (normalized.includes("low")) return 1;
  return 0;
}

function dueRank(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function timestampRank(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function nextActionLabel(
  status: string,
  needsApproval: boolean,
  working: boolean,
  scheduledLabel: string | null,
  driverLabel: string,
) {
  if (needsApproval) return "Needs human review";
  if (working) return `${driverLabel} is working`;
  if (status === "queued" && scheduledLabel) return "Scheduled";
  if (status === "queued") return `Waiting for ${driverLabel}`;
  if (status === "blocked") return "Needs a human fix";
  if (status === "completed") return "Finished";
  return titleize(status);
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const KANBAN_CSS = `
.kanban-col {
  background: linear-gradient(180deg, var(--lane-soft), transparent 88px), var(--canvas);
  border-color: color-mix(in oklab, var(--lane-border) 70%, var(--border-hairline));
  box-shadow: inset 0 2px 0 var(--lane-accent);
  transition: box-shadow 160ms cubic-bezier(0.16,1,0.3,1), border-color 160ms cubic-bezier(0.16,1,0.3,1);
}
.kanban-col-header {
  background: color-mix(in oklab, var(--lane-soft) 62%, var(--surface-inset));
  border-color: color-mix(in oklab, var(--lane-border) 70%, var(--border-hairline));
}
.kanban-col--over { box-shadow: inset 0 2px 0 var(--lane-accent), 0 0 0 1.5px var(--lane-border), 0 0 0 4px var(--lane-soft); }
.kanban-col-body { max-height: min(64vh, 680px); }
.kanban-card {
  cursor: grab;
  touch-action: none;
  background: linear-gradient(180deg, var(--lane-soft), transparent 72px), var(--surface-panel);
  transition: border-color 150ms cubic-bezier(0.16,1,0.3,1), transform 150ms cubic-bezier(0.16,1,0.3,1);
}
.kanban-card:hover { border-color: var(--lane-border); transform: translateY(-1px); }
.kanban-card:active { cursor: grabbing; }
.kanban-card--ghost { opacity: 0.3; border-style: dashed; }
.kanban-card--ghost > * { visibility: hidden; }
.kanban-card--overlay { background: var(--surface-raised); border-color: var(--accent-border); }
.kanban-slot {
  height: var(--slot-h, 56px);
  border-radius: 9px;
  border: 1.5px dashed var(--accent-border-strong);
  background: color-mix(in oklab, var(--accent-soft) 60%, transparent);
  animation: kanban-slot-open 170ms cubic-bezier(0.16,1,0.3,1);
}
@keyframes kanban-slot-open { from { height: 0; opacity: 0; } to { height: var(--slot-h, 56px); opacity: 1; } }
.kanban-overlay {
  position: fixed; z-index: 80; pointer-events: none; will-change: left, top;
  transform: rotate(2.5deg) scale(1.04);
  filter: drop-shadow(0 18px 30px rgba(0,0,0,0.55)) drop-shadow(0 4px 8px rgba(0,0,0,0.4));
  animation: kanban-lift 150ms cubic-bezier(0.16,1,0.3,1);
}
@keyframes kanban-lift { from { transform: rotate(0deg) scale(1); } to { transform: rotate(2.5deg) scale(1.04); } }
@media (prefers-reduced-motion: reduce) { .kanban-overlay { animation: none; transform: scale(1.02); } .kanban-slot { animation: none; } }
.kanban-card { animation: kanban-card-in 200ms cubic-bezier(0.16,1,0.3,1); }
@keyframes kanban-card-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
.kanban-presence { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: kanban-pulse 1.5s infinite; }
@keyframes kanban-pulse { 0% { box-shadow: 0 0 0 0 var(--accent-soft); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.kanban-shimmer { height: 4px; border-radius: 3px; background: linear-gradient(90deg, var(--surface-inset), var(--accent-soft), var(--surface-inset)); background-size: 200% 100%; animation: kanban-shimmer-move 1.3s linear infinite; }
@keyframes kanban-shimmer-move { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .kanban-card { animation: none; }
  .kanban-presence { animation: none; }
  .kanban-shimmer { animation: none; }
}
`;
