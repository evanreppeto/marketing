"use client";

import { useState, useTransition } from "react";

import type { AgentTaskDetail } from "@/lib/agent-operations/read-model";

import { toggleAcceptanceCriterionAction } from "./actions";

type LiveDetail = Extract<AgentTaskDetail, { status: "live" }>;
type Criterion = LiveDetail["acceptanceCriteria"][number];

export function TicketAcceptanceCriteria({
  taskId,
  criteria,
}: {
  taskId: string;
  criteria: Criterion[];
}) {
  const [items, setItems] = useState(criteria);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (criteria.length === 0) return null;

  function toggleCriterion(criterion: Criterion, completed: boolean) {
    setMessage(null);
    setPendingId(criterion.id);
    setItems((current) => current.map((item) => (item.id === criterion.id ? { ...item, completed } : item)));

    startTransition(async () => {
      const result = await toggleAcceptanceCriterionAction(taskId, criterion.id, completed);
      setPendingId(null);
      if (!result.ok) {
        setItems((current) => current.map((item) => (item.id === criterion.id ? { ...item, completed: criterion.completed } : item)));
        setMessage(result.message);
      }
    });
  }

  const completedCount = items.filter((item) => item.completed).length;

  return (
    <section className="module-rise rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <div className="signal-eyebrow">Acceptance</div>
          <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Criteria</h2>
        </div>
        <div className="font-mono text-xs font-semibold text-[var(--text-muted)]">
          {completedCount}/{items.length} complete
        </div>
      </div>

      <div className="divide-y divide-[var(--border-hairline)]">
        {items.map((criterion) => (
          <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-[var(--surface-inset)] sm:px-5" key={criterion.id}>
            <input
              checked={criterion.completed}
              className="mt-1 h-4 w-4 rounded border-[var(--border-strong)] bg-[var(--surface-inset)] accent-[var(--accent)]"
              disabled={pendingId === criterion.id}
              onChange={(event) => toggleCriterion(criterion, event.target.checked)}
              type="checkbox"
            />
            <span className={criterion.completed ? "text-sm leading-6 text-[var(--text-muted)] line-through" : "text-sm leading-6 text-[var(--text-primary)]"}>
              {criterion.label}
            </span>
          </label>
        ))}
      </div>

      {message ? <p className="border-t border-[var(--border-hairline)] px-4 py-3 text-xs font-semibold text-[var(--warn)] sm:px-5">{message}</p> : null}
    </section>
  );
}
