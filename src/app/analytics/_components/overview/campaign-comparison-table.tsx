"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/app/_components/page-header";
import { SegmentedBar } from "../charts/segmented-bar";

export type ComparisonRowData = {
  id: string;
  name: string;
  persona: string;
  updatedAt: string;
  assetCount: number;
  approved: number;
  total: number;
  pending: number;
  changes: number;
  readiness: number;
  state: "ready" | "changes" | "waiting" | "draft";
};

const COLUMNS: ColumnDef<ComparisonRowData>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--text-primary)]">{r.name}</div>
          <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {r.persona} &middot; {r.assetCount} {r.assetCount === 1 ? "asset" : "assets"} &middot; updated {r.updatedAt}
          </div>
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Status",
    meta: { width: "w-[180px]" },
    cell: ({ row }) => <StateBadge row={row.original} />,
  },
  {
    id: "progress",
    header: "Progress",
    meta: { width: "w-[220px]" },
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <SegmentedBar
            segments={[
              { key: "approved", value: r.approved, toneVar: "ok" },
              { key: "pending", value: r.pending, toneVar: "warn" },
              { key: "changes", value: r.changes, toneVar: "priority" },
              { key: "draft", value: Math.max(r.total - r.approved - r.pending - r.changes, 0), toneVar: "idle" },
            ]}
          />
          <div className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
            {r.total > 0 ? `${r.approved} of ${r.total} approved` : "No pieces yet"}
          </div>
        </div>
      );
    },
  },
  {
    id: "readiness",
    header: "Approved",
    meta: { align: "right", width: "w-[96px]" },
    cell: ({ row }) => (
      <span className="font-display text-lg font-bold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">{row.original.readiness}%</span>
    ),
  },
];

function StateBadge({ row }: { row: ComparisonRowData }) {
  const config =
    row.state === "changes"
      ? {
          label: `${row.changes} need ${row.changes === 1 ? "a change" : "changes"}`,
          className: "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]",
        }
      : row.state === "waiting"
        ? {
            label: `${row.pending} waiting for approval`,
            className: "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]",
          }
        : row.state === "ready"
          ? {
              label: "Ready",
              className: "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]",
            }
          : {
              label: "In draft",
              className: "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
            };

  return (
    <span className={`inline-block shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.className}`}>
      {config.label}
    </span>
  );
}

export function CampaignComparisonTable({ rows }: { rows: ComparisonRowData[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(row) => row.id}
      rowHref={(row) => `/analytics/${row.id}`}
      minWidth="min-w-[760px]"
      emptyState={<EmptyState title="No campaigns yet" detail="When Arc drafts a campaign or you create one, it will appear here with its progress." />}
    />
  );
}
