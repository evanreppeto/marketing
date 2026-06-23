"use client";

import type { CampaignPerformanceRow } from "@/lib/performance/read-model";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/app/_components/page-header";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");

const TREND: Record<CampaignPerformanceRow["trend"], { glyph: string; className: string }> = {
  up: { glyph: "▲", className: "text-[var(--ok-text)]" },
  down: { glyph: "▼", className: "text-[var(--priority-text)]" },
  flat: { glyph: "—", className: "text-[var(--text-muted)]" },
};

const COLUMNS: ColumnDef<CampaignPerformanceRow>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--text-primary)]">{row.original.name}</div>
        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{row.original.persona}</div>
      </div>
    ),
  },
  { id: "impressions", header: "Impressions", meta: { align: "right", width: "w-[120px]" }, cell: ({ row }) => <Num value={row.original.impressions} /> },
  { id: "clicks", header: "Clicks", meta: { align: "right", width: "w-[90px]" }, cell: ({ row }) => <Num value={row.original.clicks} /> },
  { id: "leads", header: "Leads", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.leads} /> },
  { id: "booked", header: "Booked", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.booked} accent /> },
  {
    id: "revenue",
    header: "Revenue",
    meta: { align: "right", width: "w-[120px]" },
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{USD.format(row.original.revenueCents / 100)}</span>
    ),
  },
  {
    id: "conversion",
    header: "Conv.",
    meta: { align: "right", width: "w-[96px]" },
    cell: ({ row }) => {
      const t = TREND[row.original.trend];
      return (
        <span className="inline-flex items-center justify-end gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{row.original.conversion}%</span>
          <span className={`text-[11px] ${t.className}`} aria-hidden="true">{t.glyph}</span>
        </span>
      );
    },
  },
];

function Num({ value, accent = false }: { value: number; accent?: boolean }) {
  return (
    <span className={`font-mono text-sm tabular-nums ${accent ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
      {NUM.format(value)}
    </span>
  );
}

export function CampaignPerformanceTable({ rows }: { rows: CampaignPerformanceRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(row) => row.id}
      rowHref={(row) => `/analytics/${row.id}`}
      minWidth="min-w-[820px]"
      emptyState={<EmptyState title="No campaign performance yet" detail="Once campaigns report results, each one's impressions, leads, and revenue appear here." />}
    />
  );
}
