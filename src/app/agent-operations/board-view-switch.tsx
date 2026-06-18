"use client";

import { useState } from "react";

import { AgentTaskBoard } from "./agent-task-board";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskKanbanBoard } from "./task-kanban-board";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

export function BoardViewSwitch({ tasks }: { tasks: AgentOperationsTask[] }) {
  const [view, setView] = useState<"board" | "table">("board");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
        <div className="inline-flex gap-0.5 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] p-0.5 text-xs font-bold">
          {(["board", "table"] as const).map((key) => {
            const active = view === key;
            return (
              <button
                key={key}
                aria-pressed={active}
                onClick={() => setView(key)}
                type="button"
                className={`rounded-[6px] px-3 py-1.5 capitalize transition-[transform,background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                  active
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-panel),0_1px_2px_rgba(0,0,0,0.25)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <NewTaskDialog />
        </div>
      </div>

      {view === "board" ? <TaskKanbanBoard tasks={tasks} /> : <AgentTaskBoard tasks={tasks} />}
    </div>
  );
}
