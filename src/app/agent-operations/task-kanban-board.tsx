"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useAgentName } from "@/app/_components/agent-name-context";
import { ChannelRow } from "@/app/_components/brand-logos";
import { EntityAvatar } from "../_components/entity-avatar";
import { labelIcon, priorityIcon, statusIcon } from "../_components/ticket-icons";

import { formatScheduleLabel } from "@/domain";

import { deriveTaskChannels } from "./task-channels";
import { badgeStyle, laneStyle, priorityAppearance, statusAppearance, type TaskVisualAppearance } from "./task-visuals";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

function buildColumns(agentName: string): Array<{ key: string; label: string; description: string }> {
  return [
    { key: "queued", label: "Waiting", description: `Ready for ${agentName}` },
    { key: "running", label: "Working", description: `${agentName} is active` },
    { key: "blocked", label: "Blocked", description: "Needs a fix" },
    { key: "needs_approval", label: "Review", description: "Human decision" },
    { key: "completed", label: "Done", description: "Finished work" },
  ];
}

const COLUMN_KEYS = ["queued", "running", "blocked", "needs_approval", "completed"];
const CLOSED_STATUSES = new Set(["failed", "canceled"]);

/**
 * Drag-and-drop task board, powered by @dnd-kit. Board state is held client-side
 * (seeded from props) so cards move between columns and reorder within a column
 * for the session — no DB write, approval-safe, nothing goes outbound. Snappy
 * pointer + keyboard sensors, a lifted drag overlay, and an animated drop slot.
 */
export function TaskKanbanBoard({ tasks }: { tasks: AgentOperationsTask[] }) {
  const agentName = useAgentName();
  const COLUMNS = useMemo(() => buildColumns(agentName), [agentName]);

  // Client-held board: ordered task ids per column, seeded from props. Reseeds
  // when the incoming task set changes identity (e.g. a server refresh), but
  // local moves persist for the session in between.
  const [order, setOrder] = useState<Record<string, string[]>>(() => seedOrder(tasks));
  const [statusById, setStatusById] = useState<Record<string, string>>(() => seedStatus(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  const seedKey = tasks.map((t) => t.fullId).join("|");
  const lastSeedKey = useRef(seedKey);
  useEffect(() => {
    if (lastSeedKey.current === seedKey) return;
    lastSeedKey.current = seedKey;
    setOrder(seedOrder(tasks));
    setStatusById(seedStatus(tasks));
  }, [seedKey, tasks]);

  const taskById = useMemo(() => {
    const map = new Map<string, AgentOperationsTask>();
    for (const task of tasks) map.set(task.fullId, task);
    return map;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function columnOf(id: string): string | null {
    if (COLUMN_KEYS.includes(id)) return id;
    for (const key of COLUMN_KEYS) {
      if (order[key]?.includes(id)) return key;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCol = columnOf(String(active.id));
    const overCol = columnOf(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    // Move the card into the column it's hovering over (cross-column live move).
    setOrder((prev) => {
      const from = prev[activeCol].filter((id) => id !== active.id);
      const to = [...prev[overCol]];
      const overIndex = to.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : to.length;
      to.splice(insertAt, 0, String(active.id));
      return { ...prev, [activeCol]: from, [overCol]: to };
    });
    setStatusById((prev) => ({ ...prev, [String(active.id)]: overCol }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const col = columnOf(String(active.id));
    if (!col) return;

    // Reorder within the resolved column.
    setOrder((prev) => {
      const ids = prev[col];
      const oldIndex = ids.indexOf(String(active.id));
      const overIndex = COLUMN_KEYS.includes(String(over.id))
        ? ids.length - 1
        : ids.indexOf(String(over.id));
      if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return prev;
      const next = [...ids];
      next.splice(oldIndex, 1);
      next.splice(overIndex, 0, String(active.id));
      return { ...prev, [col]: next };
    });
  }

  const openCount = COLUMN_KEYS.reduce((sum, key) => sum + (order[key]?.length ?? 0), 0);
  const closedCount = tasks.filter((t) => CLOSED_STATUSES.has(t.status)).length;
  const activeTask = activeId ? taskById.get(activeId) ?? null : null;

  return (
    <section className={`overflow-hidden ${activeId ? "select-none" : ""}`}>
      <style>{KANBAN_CSS}</style>

      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Color key</span>
          {COLUMNS.map((column) => {
            const appearance = statusAppearance(column.key);
            return (
              <span
                className="kanban-legend inline-flex min-h-7 cursor-default items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px active:translate-y-px"
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
          {openCount} visible tasks. Drag a card to move it across the board.
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="overflow-x-auto p-3">
          <div className="grid min-w-[940px] grid-cols-5 gap-3">
            {COLUMNS.map((col) => {
              const ids = order[col.key] ?? [];
              const cards = ids.map((id) => taskById.get(id)).filter((t): t is AgentOperationsTask => Boolean(t));
              return (
                <Column
                  key={col.key}
                  id={col.key}
                  label={col.label}
                  description={col.description}
                  count={cards.length}
                  activeId={activeId}
                >
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    {cards.map((task) => (
                      <SortableCard
                        key={task.fullId}
                        task={task}
                        liveStatus={col.key}
                        dragging={activeId === task.fullId}
                      />
                    ))}
                  </SortableContext>
                  {cards.length === 0 ? (
                    <div className="kanban-empty rounded-lg border border-dashed border-[var(--lane-border)] bg-[var(--lane-soft)] px-2 py-5 text-center text-[10.5px] font-medium text-[var(--text-muted)] transition-[background-color,border-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                      {activeId ? "Release to drop here" : "No cards"}
                    </div>
                  ) : null}
                </Column>
              );
            })}
          </div>

          {closedCount > 0 ? (
            <div className="mt-2 px-1 text-[11px] font-medium text-[var(--text-muted)]">
              Hidden failed or canceled tasks: {closedCount}
            </div>
          ) : null}
        </div>

        {typeof document !== "undefined"
          ? createPortal(
              <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
                {activeTask ? (
                  <div className="kanban-overlay">
                    <Card overlay task={activeTask} liveStatus={statusById[activeTask.fullId]} />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
    </section>
  );
}

function seedOrder(tasks: AgentOperationsTask[]): Record<string, string[]> {
  const result: Record<string, string[]> = { queued: [], running: [], blocked: [], needs_approval: [], completed: [] };
  const open = tasks.filter((t) => !CLOSED_STATUSES.has(t.status)).slice().sort(compareTaskPriority);
  for (const task of open) {
    const col = COLUMN_KEYS.includes(task.status) ? task.status : "queued";
    result[col].push(task.fullId);
  }
  return result;
}

function seedStatus(tasks: AgentOperationsTask[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const task of tasks) {
    result[task.fullId] = COLUMN_KEYS.includes(task.status) ? task.status : "queued";
  }
  return result;
}

function Column({
  id,
  label,
  description,
  count,
  activeId,
  children,
}: {
  id: string;
  label: string;
  description: string;
  count: number;
  activeId: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useSortable({ id, data: { type: "column" } });
  const appearance = statusAppearance(id);

  return (
    <div
      ref={setNodeRef}
      className={`kanban-col flex min-h-[140px] flex-col rounded-xl border border-[var(--border-hairline)] ${
        isOver && activeId ? "kanban-col--over" : ""
      }`}
      style={laneStyle(appearance)}
    >
      <div className="kanban-col-header sticky top-0 z-[1] flex items-center justify-between rounded-t-xl border-b px-3 py-2">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--lane-text)]">
            <CardIconSlot>{statusIcon(id)}</CardIconSlot>
            {label}
          </span>
          <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--text-muted)]">{description}</p>
        </div>
        <span className="rounded-full border border-[var(--lane-border)] bg-[var(--surface-panel)] px-2 text-[10px] font-bold text-[var(--lane-text)]">
          {count} {count === 1 ? "card" : "cards"}
        </span>
      </div>

      <div className="kanban-col-body flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function SortableCard({
  task,
  liveStatus,
  dragging,
}: {
  task: AgentOperationsTask;
  liveStatus: string;
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.fullId,
    data: { type: "card" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card task={task} liveStatus={liveStatus} ghost={dragging || isDragging} />
    </div>
  );
}

function Card({
  task,
  liveStatus,
  ghost = false,
  overlay = false,
}: {
  task: AgentOperationsTask;
  liveStatus?: string;
  ghost?: boolean;
  overlay?: boolean;
}) {
  // The card reflects the column it currently lives in (liveStatus), so moving a
  // card across the board updates its status pill, color, and "next action".
  const effectiveStatus = liveStatus ?? task.status;
  const accent = priorityAccent(task.priority);
  const needsApproval =
    effectiveStatus === "needs_approval" ||
    (effectiveStatus === task.status &&
      (Boolean(task.approvalHref) || /approval/i.test(`${task.status} ${task.approval}`)));
  const working = effectiveStatus === "running";
  const visibleStatus = needsApproval ? "needs_approval" : effectiveStatus;
  const status = statusAppearance(visibleStatus);
  const priority = priorityAccent(task.priority);
  const channels = useMemo(() => deriveTaskChannels(task), [task]);
  const pct =
    task.progress && task.progress.total > 0
      ? Math.min(100, Math.round((task.progress.done / task.progress.total) * 100))
      : null;
  const now = useMemo(() => new Date(), []);
  const scheduledLabel =
    effectiveStatus === "queued" && task.scheduledFor && new Date(task.scheduledFor).getTime() > now.getTime()
      ? formatScheduleLabel(task.scheduledFor, now)
      : null;
  const driverLabel = task.driver?.label ?? task.agentName;
  const driverIsArc = task.driver?.kind === "agent";
  const nextAction = nextActionLabel(effectiveStatus, needsApproval, working, scheduledLabel, driverLabel);
  const statusLabel = status.label;

  return (
    <article
      className={`kanban-card group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
        ghost ? "kanban-card--ghost" : ""
      } ${overlay ? "kanban-card--overlay" : ""}`}
      style={cardStyle(status, accent)}
    >
      {task.campaignLabel ? (
        <div className="mb-2 flex items-center justify-between gap-1.5">
          <span
            className="inline-flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em]"
            style={badgeStyle(status)}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: priority.accent }} />
            <span className="truncate">{task.campaignLabel}</span>
          </span>
          {channels.length > 0 ? <ChannelRow channels={channels} size={18} max={4} /> : null}
        </div>
      ) : null}

      <div className="flex items-start gap-2.5">
        <EntityAvatar
          owner={driverIsArc ? { kind: "agent" } : { kind: "human", name: driverLabel }}
          size={22}
          pending={working}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-[1.25] text-[var(--text-primary)]">
            {task.objective}
          </p>
          {task.personaLabel ? (
            <p className="mt-1 truncate text-[10.5px] font-medium text-[var(--text-muted)]">{task.personaLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold" style={badgeStyle(status)}>
          <CardIconSlot>{statusIcon(visibleStatus)}</CardIconSlot>
          {statusLabel}
        </span>
        {pct !== null ? (
          <>
            <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {task.progress!.done}/{task.progress!.total}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{nextAction}</span>
        )}
      </div>

      {working && !overlay ? <div className="kanban-shimmer mt-2" /> : null}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2 text-[10px] text-[var(--text-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono tabular-nums">
          <CardIconSlot>{labelIcon("calendar")}</CardIconSlot>
          {scheduledLabel ? scheduledLabel : formatDue(task.dueAt)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {working ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--lane-text)]">
              <span className="kanban-presence" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold" style={badgeStyle(priority)}>
              <CardIconSlot>{priorityIcon(task.priority)}</CardIconSlot>
              {titleize(task.priority)}
            </span>
          )}
          {!overlay ? (
            <Link
              href={task.href}
              onPointerDown={(event) => event.stopPropagation()}
              className="kanban-open inline-flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 font-bold text-[var(--text-secondary)] transition-[transform,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:border-[var(--accent-border)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] active:scale-[0.96] active:translate-y-0"
            >
              Open
            </Link>
          ) : null}
        </span>
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
.kanban-col--over .kanban-empty {
  border-color: var(--lane-accent);
  border-style: solid;
  background: color-mix(in oklab, var(--lane-soft) 80%, transparent);
  color: var(--lane-text);
}
.kanban-col-body { max-height: min(64vh, 680px); }
.kanban-card {
  cursor: grab;
  touch-action: none;
  background: linear-gradient(180deg, var(--lane-soft), transparent 72px), var(--surface-panel);
  transition: border-color 300ms cubic-bezier(0.32,0.72,0,1), transform 300ms cubic-bezier(0.32,0.72,0,1), box-shadow 300ms cubic-bezier(0.32,0.72,0,1);
}
.kanban-card:hover { border-color: var(--lane-border); transform: translateY(-2px); }
.kanban-card:active { cursor: grabbing; }
.kanban-card--ghost { opacity: 0.3; border-style: dashed; }
.kanban-card--ghost > * { visibility: hidden; }
.kanban-card--overlay { background: var(--surface-raised); border-color: var(--accent-border); }
.kanban-overlay {
  pointer-events: none; cursor: grabbing;
  transform: rotate(2.5deg) scale(1.04);
  filter: drop-shadow(0 18px 30px rgba(0,0,0,0.55)) drop-shadow(0 4px 8px rgba(0,0,0,0.4));
  animation: kanban-lift 150ms cubic-bezier(0.16,1,0.3,1);
}
@keyframes kanban-lift { from { transform: rotate(0deg) scale(1); } to { transform: rotate(2.5deg) scale(1.04); } }
@media (prefers-reduced-motion: reduce) { .kanban-overlay { animation: none; transform: scale(1.02); } }
.kanban-card { animation: kanban-card-in 200ms cubic-bezier(0.16,1,0.3,1); }
@keyframes kanban-card-in { from { transform: translateY(-6px) scale(0.98); } to { transform: none; } }
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
