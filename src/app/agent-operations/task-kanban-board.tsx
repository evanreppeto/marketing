"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { moveTaskAction } from "./actions";
import { StatusPill } from "../_components/page-header";
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
  laneKey: string;
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state: AgentOperationsTask[], move: OptimisticMove) =>
      state.map((task) => (task.fullId === move.taskId ? { ...task, status: move.toStatus } : task)),
  );

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

  function startDrag(event: React.PointerEvent, task: AgentOperationsTask, laneKey: string) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDrag({
      taskId: task.fullId,
      laneKey,
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

  // Global pointer listeners, attached once. They read the live drag via ref so
  // the board re-renders only when the hovered column or drag-started flips.
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
        const col = under?.closest<HTMLElement>("[data-drop-status]");
        const lane = col?.closest<HTMLElement>("[data-lane-key]");
        overStatus = col && lane?.dataset.laneKey === d.laneKey ? col.dataset.dropStatus ?? null : null;
      }
      setDrag({ ...d, x: event.clientX, y: event.clientY, moved, overStatus });
    }

    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      if (!d.moved) {
        router.push(d.task.href); // a click, not a drag
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

  const lanes = agents.length > 0 ? agents : inferLanes(tasks);
  const dragging = drag?.moved ?? false;

  return (
    <section className={`overflow-hidden ${dragging ? "select-none" : ""}`}>
      <style>{KANBAN_CSS}</style>

      {error ? (
        <div className="border-b border-[var(--priority-border)] bg-[var(--priority-soft)] px-5 py-2 text-sm font-semibold text-[var(--priority-text)]">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        {lanes.map((lane) => {
          const laneTasks = optimisticTasks.filter((task) => task.agentKey === lane.key);
          const closed = laneTasks.filter((task) => CLOSED_STATUSES.has(task.status));
          return (
            <div className="border-b border-[var(--border-hairline)]" data-lane-key={lane.key} key={lane.key}>
              <div className="flex items-center gap-2 bg-[var(--surface-inset)] px-5 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-soft)]" />
                <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{lane.name}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)]">· outbound locked</span>
              </div>

              <div className="grid min-w-[1000px] grid-cols-5">
                {COLUMNS.map((col) => {
                  const cards = laneTasks.filter((task) => task.status === col.key);
                  const isOver = dragging && drag?.laneKey === lane.key && drag?.overStatus === col.key;
                  const isValidTarget = isOver && drag?.fromStatus !== col.key;
                  return (
                    <div
                      className={`kanban-col min-h-[150px] border-r border-[var(--border-hairline)] p-2.5 last:border-r-0 ${
                        isValidTarget ? "kanban-col--over" : ""
                      }`}
                      data-drop-status={col.key}
                      key={col.key}
                    >
                      <div
                        className={`mb-2.5 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider ${
                          col.key === "needs_approval" ? "text-[var(--accent-strong)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span>{col.label}</span>
                        <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-[10px]">{cards.length}</span>
                      </div>

                      {isValidTarget ? (
                        <div className="kanban-slot" style={{ ["--slot-h" as string]: `${drag?.height ?? 64}px` }} />
                      ) : null}

                      {cards.map((task) => {
                        const isSource = drag?.taskId === task.fullId && dragging;
                        return (
                          <article
                            className={`kanban-card mb-2 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
                              isSource ? "kanban-card--ghost" : ""
                            }`}
                            key={task.fullId}
                            onPointerDown={(event) => startDrag(event, task, lane.key)}
                          >
                            <CardBody task={task} />
                          </article>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {closed.length > 0 ? (
                <div className="bg-[var(--surface-soft)] px-5 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
                  ▾ Closed (failed · canceled): {closed.length}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {drag && dragging
        ? createPortal(
            <div
              className="kanban-overlay"
              style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
            >
              <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)] p-2.5">
                <CardBody task={drag.task} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function CardBody({ task }: { task: AgentOperationsTask }) {
  return (
    <>
      <div className="text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">{task.objective}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.risk ? <StatusPill tone={riskTone(task.risk)}>Risk·{task.risk}</StatusPill> : null}
        {task.linkedObject && task.linkedObject !== "No linked record" ? (
          <span className="rounded border border-[var(--border-panel)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
            {task.linkedObject}
          </span>
        ) : null}
        {task.approval && /approval/i.test(task.approval) ? (
          <span className="text-[10px] font-extrabold text-[var(--accent-strong)]">⬢ Outbound</span>
        ) : null}
      </div>
    </>
  );
}

const KANBAN_CSS = `
.kanban-card {
  cursor: grab;
  touch-action: none;
  transition: border-color 150ms cubic-bezier(0.16,1,0.3,1), opacity 150ms cubic-bezier(0.16,1,0.3,1);
}
.kanban-card:hover { border-color: var(--border-strong); }
.kanban-card:active { cursor: grabbing; }
.kanban-card--ghost {
  opacity: 0.3;
  border-style: dashed;
  background: var(--surface-soft);
}
.kanban-card--ghost > * { visibility: hidden; }
.kanban-col {
  background: var(--canvas);
  transition: background-color 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms cubic-bezier(0.16,1,0.3,1);
}
.kanban-col--over {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1.5px var(--accent-border);
}
.kanban-slot {
  height: var(--slot-h, 64px);
  margin-bottom: 8px;
  border-radius: 9px;
  border: 1.5px dashed var(--accent-border-strong);
  background: color-mix(in oklab, var(--accent-soft) 60%, transparent);
  animation: kanban-slot-open 170ms cubic-bezier(0.16,1,0.3,1);
}
@keyframes kanban-slot-open {
  from { height: 0; opacity: 0; margin-bottom: 0; }
  to { height: var(--slot-h, 64px); opacity: 1; margin-bottom: 8px; }
}
.kanban-overlay {
  position: fixed;
  z-index: 80;
  pointer-events: none;
  will-change: left, top;
  transform: rotate(2.5deg) scale(1.04);
  filter: drop-shadow(0 18px 30px rgba(0,0,0,0.55)) drop-shadow(0 4px 8px rgba(0,0,0,0.4));
  animation: kanban-lift 150ms cubic-bezier(0.16,1,0.3,1);
}
@keyframes kanban-lift {
  from { transform: rotate(0deg) scale(1); }
  to { transform: rotate(2.5deg) scale(1.04); }
}
@media (prefers-reduced-motion: reduce) {
  .kanban-overlay { animation: none; transform: scale(1.02); }
  .kanban-slot { animation: none; }
}
`;

function riskTone(risk: string) {
  if (/high|blocked/i.test(risk)) return "red" as const;
  if (/medium|warn/i.test(risk)) return "amber" as const;
  return "green" as const;
}

function inferLanes(tasks: AgentOperationsTask[]): AgentOperationsAgent[] {
  const seen = new Map<string, string>();
  for (const task of tasks) {
    if (!seen.has(task.agentKey)) seen.set(task.agentKey, task.agentName);
  }
  return [...seen.entries()].map(([key, name]) => ({
    key,
    name,
    purpose: "",
    status: "",
    currentTask: "",
    riskFlags: [],
    href: `/agent-operations/${key}`,
  }));
}
