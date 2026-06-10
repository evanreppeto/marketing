"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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

export function TaskKanbanBoard({
  agents,
  tasks,
}: {
  agents: AgentOperationsAgent[];
  tasks: AgentOperationsTask[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const lanes = agents.length > 0 ? agents : inferLanes(tasks);

  function onDrop(toStatus: string) {
    const taskId = dragId;
    setDragId(null);
    if (!taskId) return;
    setError(null);
    startTransition(async () => {
      const result = await moveTaskAction(taskId, toStatus);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden">
      {error ? (
        <div className="border-b border-[var(--priority-border)] bg-[var(--priority-soft)] px-5 py-2 text-sm font-semibold text-[var(--priority-text)]">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        {lanes.map((lane) => {
          const laneTasks = tasks.filter((t) => t.agentKey === lane.key);
          const closed = laneTasks.filter((t) => CLOSED_STATUSES.has(t.status));
          return (
            <div className="border-b border-[var(--border-hairline)]" key={lane.key}>
              <div className="flex items-center gap-2 bg-[var(--surface-inset)] px-5 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[var(--ok)] shadow-[0_0_0_3px_var(--ok-soft)]" />
                <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{lane.name}</span>
                <span className="text-[11px] font-medium text-[var(--text-muted)]">· outbound locked</span>
              </div>

              <div className="grid min-w-[1000px] grid-cols-5">
                {COLUMNS.map((col) => {
                  const cards = laneTasks.filter((t) => t.status === col.key);
                  return (
                    <div
                      className="min-h-[150px] border-r border-[var(--border-hairline)] bg-[var(--canvas)] p-2.5 last:border-r-0"
                      key={col.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(col.key)}
                    >
                      <div
                        className={`mb-2.5 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider ${
                          col.key === "needs_approval" ? "text-[var(--accent-strong)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span>{col.label}</span>
                        <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-[10px]">{cards.length}</span>
                      </div>

                      {cards.map((task) => (
                        <article
                          className={`mb-2 cursor-grab rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2.5 ${
                            pending && dragId === task.fullId ? "opacity-50" : ""
                          }`}
                          draggable
                          key={task.fullId}
                          onDragStart={() => setDragId(task.fullId)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => router.push(task.href)}
                        >
                          <div className="text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
                            {task.objective}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {task.risk ? <StatusPill tone={riskTone(task.risk)}>Risk·{task.risk}</StatusPill> : null}
                            {task.linkedObject && task.linkedObject !== "No linked record" ? (
                              <span className="rounded border border-[var(--border-panel)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                                {task.linkedObject}
                              </span>
                            ) : null}
                            {task.approval && /approval/i.test(task.approval) ? (
                              <span className="text-[10px] font-extrabold text-[var(--accent-strong)]">&#x2BE2; Outbound</span>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>

              {closed.length > 0 ? (
                <div className="bg-[var(--surface-soft)] px-5 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
                  &#x25BE; Closed (failed · canceled): {closed.length}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function riskTone(risk: string) {
  if (/high|blocked/i.test(risk)) return "red" as const;
  if (/medium|warn/i.test(risk)) return "amber" as const;
  return "green" as const;
}

function inferLanes(tasks: AgentOperationsTask[]): AgentOperationsAgent[] {
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (!seen.has(t.agentKey)) seen.set(t.agentKey, t.agentName);
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
