"use client";

import Link from "next/link";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green", proposed: "amber", observed: "blue", rejected: "red", archived: "gray",
};

export function BrainBrowser({ nodes, agentName = "Arc" }: { nodes: BrainNode[]; agentName?: string }) {
  if (nodes.length === 0) {
    return (
      <Panel>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brain</h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          No facts for this filter. Run{" "}
          <code className="rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono text-xs text-[var(--text-primary)]">pnpm seed:brain</code>{" "}
          or let {agentName} start recording what it learns.
        </p>
      </Panel>
    );
  }

  const columns: ColumnDef<BrainNode>[] = [
    {
      id: "fact",
      header: "Fact",
      cell: ({ row }) => {
        const n = row.original;
        return (
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text-primary)]">{n.label}</p>
            {n.body ? <p className="truncate text-sm leading-6 text-[var(--text-secondary)]">{n.body}</p> : null}
          </div>
        );
      },
    },
    {
      id: "kind",
      header: "Kind",
      cell: ({ row }) => (
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{row.original.kind.replace(/_/g, " ")}</span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => {
        const prov = nodeProvenance(row.original);
        return (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
            {prov.label}
          </span>
        );
      },
    },
    {
      id: "trust",
      header: "Trust",
      cell: ({ row }) => <StatusPill tone={TIER_TONE[row.original.trustTier] ?? "blue"}>{row.original.trustTier}</StatusPill>,
    },
    {
      id: "link",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => {
        const prov = nodeProvenance(row.original);
        return prov.deepLink ? (
          <Link href={prov.deepLink.href} className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline">
            {prov.deepLink.label} ↗
          </Link>
        ) : null;
      },
    },
  ];

  return (
    <Panel>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brain ({nodes.length})</h2>
      <DataTable columns={columns} data={nodes} getRowId={(n) => n.id} minWidth="min-w-[760px]" />
    </Panel>
  );
}
