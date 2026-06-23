"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

const COLUMNS: ColumnDef<AgentOperationsTask>[] = [
  {
    id: "objective",
    header: "Objective",
    cell: ({ row }) => (
      <>
        <div className="font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.original.task}</div>
        <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.original.objective}</div>
      </>
    ),
  },
  { id: "status", header: "Status", cell: ({ row }) => <StatusPill tone={statusTone(row.original.status)}>{row.original.status}</StatusPill> },
  { id: "risk", header: "Risk", cell: ({ row }) => <StatusPill tone={riskTone(row.original.risk)}>{row.original.risk}</StatusPill> },
  {
    id: "linked",
    header: "Linked work",
    cell: ({ row }) => <span className="text-sm font-semibold text-[var(--accent)]">{row.original.linkedObject}</span>,
  },
  { id: "updated", header: "Updated", meta: { cellClassName: "text-[var(--text-secondary)]" }, cell: ({ row }) => row.original.updated },
];

export function AgentTaskTable({ tasks }: { tasks: AgentOperationsTask[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={tasks}
      getRowId={(row) => row.fullId}
      rowHref={(row) => row.href}
      minWidth="min-w-[920px]"
      emptyState={<EmptyState title="No tasks for this agent" detail="When tasks are assigned here, they will appear with linked records, risk, and approval state." />}
    />
  );
}

function statusTone(status: string) {
  if (/complete|active|approved|ready|configured/i.test(status)) return "green";
  if (/blocked|error|failed/i.test(status)) return "red";
  if (/queued|running|approval|pending|review/i.test(status)) return "amber";
  return "blue";
}

function riskTone(risk: string) {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium|warning/i.test(risk)) return "amber";
  return "green";
}
