"use client";

import { useState } from "react";

import { cx, theme } from "@/app/_components/theme";
import { AgentTaskBoard } from "./agent-task-board";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskKanbanBoard } from "./task-kanban-board";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

export function BoardViewSwitch({ tasks }: { tasks: AgentOperationsTask[] }) {
  const [view, setView] = useState<"board" | "table">("board");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
        <div className="inline-flex gap-1 border-b border-[var(--border-hairline)] pb-2 text-xs font-bold">
          {(["board", "table"] as const).map((key) => {
            const active = view === key;
            return (
              <button
                key={key}
                aria-pressed={active}
                onClick={() => setView(key)}
                type="button"
                className={cx(`relative rounded-[8px] px-3 py-2 capitalize transition duration-150 active:translate-y-px ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`)}
              >
                {key}
                {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
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
