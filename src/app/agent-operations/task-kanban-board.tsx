"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { EntityAvatar } from "../_components/entity-avatar";

import { initialDemoFrame, nextDemoFrame, type DemoStatus } from "@/domain";

import { moveTaskAction } from "./actions";
import { type AgentOperationsAgent, type AgentOperationsTask } from "@/lib/agent-operations/read-model";

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "blocked", label: "Blocked" },
  { key: "needs_approval", label: "Needs approval" },
  { key: "completed", label: "Completed" },
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

export function TaskKanbanBoard({
  agents,
  tasks,
}: {
  agents: AgentOperationsAgent[];
  tasks: AgentOperationsTask[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state: AgentOperationsTask[], move: OptimisticMove) =>
      state.map((task) => (task.fullId === move.taskId ? { ...task, status: move.toStatus } : task)),
  );

  const [demo, setDemo] = useState(false);
  const [demoFrame, setDemoFrame] = useState(initialDemoFrame);

  // Live polling: refresh server data while the board is visible. When Mark moves
  // a task or reports progress via his API, the next refresh reflects it.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 8000);
    return () => window.clearInterval(id);
  }, [router]);

  // Demo simulation: a visual-only card that loops the lifecycle. Writes nothing.
  useEffect(() => {
    if (!demo) return;
    const id = window.setInterval(() => {
      setDemoFrame((frame) => nextDemoFrame(frame.step));
    }, 1600);
    return () => window.clearInterval(id);
  }, [demo]);

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
    if (task.fullId === "__demo__") return;
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

  const agentName = (key: string) =>
    agents.find((a) => a.key === key)?.name ?? tasks.find((t) => t.agentKey === key)?.agentName ?? key;
  const agentOptions = [...new Set(optimisticTasks.map((t) => t.agentKey))];

  const visible = optimisticTasks.filter((t) => agentFilter === "all" || t.agentKey === agentFilter);
  const open = visible.filter((t) => !CLOSED_STATUSES.has(t.status));
  const closedCount = visible.length - open.length;
  const dragging = drag?.moved ?? false;

  const demoTask: AgentOperationsTask | null = demo
    ? {
        id: "demo",
        fullId: "__demo__",
        agentKey: "mark",
        agentName: "Mark",
        task: "Demo",
        objective: "Demo · Mark working a task across the board",
        linkedObject: "Campaign: Demo Walkthrough",
        linkedHref: "/board",
        approvalHref: null,
        risk: "Low",
        approval: "Internal task",
        status: demoFrame.status,
        priority: "Medium",
        dueAt: null,
        progress: demoFrame.working ? { done: 12, total: 20 } : null,
        updated: "now",
        href: "/board",
      }
    : null;

  return (
    <section className={`overflow-hidden ${dragging ? "select-none" : ""}`}>
      <style>{KANBAN_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] px-4 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Agent</span>
        <select
          className="h-8 cursor-pointer rounded-md border border-[var(--border-panel)] bg-[var(--surface-inset)] px-2 text-xs font-semibold text-[var(--text-primary)]"
          onChange={(event) => setAgentFilter(event.target.value)}
          value={agentFilter}
        >
          <option value="all">All agents</option>
          {agentOptions.map((key) => (
            <option key={key} value={key}>
              {agentName(key)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={demo}
          onClick={() => {
            setDemo((value) => {
              if (value) setDemoFrame(initialDemoFrame());
              return !value;
            });
          }}
          className={`h-8 cursor-pointer rounded-md border px-3 text-xs font-bold ${
            demo
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border-panel)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
          }`}
          title="Visual-only simulation — writes no data"
        >
          {demo ? "Demo: on" : "Demo"}
        </button>
        <span className="ml-auto text-[11px] font-medium text-[var(--text-muted)]">
          {open.length} open · outbound locked
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
            const cards = [
              ...open.filter((task) => task.status === col.key),
              ...(demoTask && (demoTask.status as DemoStatus) === col.key ? [demoTask] : []),
            ];
            const isValidTarget = dragging && drag?.overStatus === col.key && drag?.fromStatus !== col.key;
            return (
              <div
                className={`kanban-col flex min-h-[140px] flex-col rounded-xl border border-[var(--border-hairline)] ${
                  isValidTarget ? "kanban-col--over" : ""
                }`}
                data-drop-status={col.key}
                key={col.key}
              >
                <div className="sticky top-0 z-[1] flex items-center justify-between rounded-t-xl border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                  <span
                    className={`text-[10.5px] font-extrabold uppercase tracking-wider ${
                      col.key === "needs_approval" ? "text-[var(--accent-strong)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {col.label}
                  </span>
                  <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-[10px] font-bold text-[var(--text-muted)]">
                    {cards.length}
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
                    <div className="px-1 py-3 text-[11px] italic text-[var(--text-muted)]">No tasks</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {closedCount > 0 ? (
          <div className="mt-2 px-1 text-[11px] font-medium text-[var(--text-muted)]">
            ▾ Closed (failed · canceled): {closedCount}
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
  const accent = riskAccent(task.risk);
  const campaign = task.linkedObject.startsWith("Campaign:")
    ? task.linkedObject.replace(/^Campaign:\s*/, "")
    : null;
  const needsApproval = /approval/i.test(task.approval);
  const working = task.status === "running";
  const pct =
    task.progress && task.progress.total > 0
      ? Math.min(100, Math.round((task.progress.done / task.progress.total) * 100))
      : null;

  return (
    <article
      className={`kanban-card group rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
        ghost ? "kanban-card--ghost" : ""
      } ${overlay ? "kanban-card--overlay" : ""}`}
      onPointerDown={onPointerDown}
      style={{ boxShadow: `inset 3px 0 0 ${accent.bar}` }}
    >
      <div className="flex items-start gap-2">
        <EntityAvatar owner={{ kind: "agent" }} size={22} pending={working} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
            {task.objective}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
            {task.task} · #{task.id}
          </p>
        </div>
      </div>

      {pct !== null ? (
        <div className="mt-2 pl-7">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="mt-1 block text-[9.5px] font-medium text-[var(--text-muted)]">
            {task.progress!.done} of {task.progress!.total}
          </span>
        </div>
      ) : null}

      {working && !overlay ? <div className="kanban-shimmer ml-7 mt-2" /> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-7">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: accent.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.bar }} />
          {task.risk}
        </span>
        <span className="text-[10px] font-semibold text-[var(--text-muted)]">{task.priority}</span>
        {campaign ? (
          <span className="inline-flex max-w-[150px] items-center gap-1 truncate text-[10px] font-semibold text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">◆</span>
            <span className="truncate">{campaign}</span>
          </span>
        ) : null}
        {needsApproval ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Outbound
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between pl-7">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">{formatDue(task.dueAt)}</span>
        {working ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
            <span className="kanban-presence" />
            Mark · live
          </span>
        ) : null}
      </div>
    </article>
  );
}

function riskAccent(risk: string): { bar: string; text: string } {
  if (/high|blocked/i.test(risk)) return { bar: "var(--priority)", text: "var(--priority-text)" };
  if (/medium|warn/i.test(risk)) return { bar: "var(--warn)", text: "var(--warn-text)" };
  return { bar: "var(--ok)", text: "var(--ok-text)" };
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

const KANBAN_CSS = `
.kanban-col { background: var(--canvas); transition: box-shadow 160ms cubic-bezier(0.16,1,0.3,1); }
.kanban-col--over { box-shadow: 0 0 0 1.5px var(--accent-border), 0 0 0 4px var(--accent-soft); }
.kanban-col-body { max-height: min(64vh, 680px); }
.kanban-card { cursor: grab; touch-action: none; transition: border-color 150ms cubic-bezier(0.16,1,0.3,1), transform 150ms cubic-bezier(0.16,1,0.3,1); }
.kanban-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
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
