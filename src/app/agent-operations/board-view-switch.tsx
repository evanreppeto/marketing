"use client";

import { useState } from "react";

import { AgentTaskBoard } from "./agent-task-board";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskKanbanBoard } from "./task-kanban-board";
import { type AgentOperationsAgent, type AgentOperationsTask } from "@/lib/agent-operations/read-model";

export function BoardViewSwitch({
  agents,
  tasks,
}: {
  agents: AgentOperationsAgent[];
  tasks: AgentOperationsTask[];
}) {
  const [view, setView] = useState<"board" | "table">("board");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border-panel)] text-xs font-bold">
          <button
            aria-pressed={view === "board"}
            className={`px-3 py-1.5 ${view === "board" ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
            onClick={() => setView("board")}
            type="button"
          >
            Board
          </button>
          <button
            aria-pressed={view === "table"}
            className={`px-3 py-1.5 ${view === "table" ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
            onClick={() => setView("table")}
            type="button"
          >
            Table
          </button>
        </div>
        <div className="flex items-center gap-2">
          <NewTaskDialog />
        </div>
      </div>

      {view === "board" ? <TaskKanbanBoard agents={agents} tasks={tasks} /> : <AgentTaskBoard tasks={tasks} />}
    </div>
  );
}
