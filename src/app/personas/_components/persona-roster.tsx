"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/app/_components/data-table";
import { cx } from "@/app/_components/theme";
import { segmentLabel, type DemoPersona, type PersonaStage } from "../_data/demo-personas";

const STAGE_ORDER: Record<PersonaStage, number> = {
  "Hot lead": 0,
  Champion: 1,
  Active: 2,
  New: 3,
  "At risk": 4,
  Dormant: 5,
};

type SortKey = "score" | "name" | "stage" | "audience";

function needsAttention(stage: PersonaStage): boolean {
  return stage === "At risk" || stage === "Dormant";
}

const HEAD = "text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--text-muted)]";

export function PersonaRoster({ personas }: { personas: DemoPersona[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? personas.filter((p) => p.name.toLowerCase().includes(needle) || p.angle.toLowerCase().includes(needle))
      : personas;
    return filtered.slice().sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stage") return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || b.score - a.score;
      if (sort === "audience") return b.audienceShare - a.audienceShare;
      return b.score - a.score;
    });
  }, [personas, query, sort]);

  const columns: Array<Column<DemoPersona>> = [
    {
      key: "persona",
      header: <span className={HEAD}>Persona</span>,
      cell: (p) => (
        <div className="min-w-0 py-1">
          <div className="flex items-center gap-2">
            {needsAttention(p.stage) ? <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--warn)]" /> : null}
            <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--text-primary)]">{p.name}</span>
          </div>
          <div className={cx("mt-1 truncate text-[12.5px] leading-snug text-[var(--text-muted)]", needsAttention(p.stage) && "ml-[13px]")}>{p.angle}</div>
        </div>
      ),
    },
    {
      key: "segment",
      header: <span className={HEAD}>Segment</span>,
      width: "w-[150px]",
      cell: (p) => <span className="text-[13px] text-[var(--text-secondary)]">{segmentLabel(p.segment)}</span>,
    },
    {
      key: "stage",
      header: <span className={HEAD}>Stage</span>,
      width: "w-[120px]",
      cell: (p) => <span className={cx("text-[13px]", needsAttention(p.stage) ? "text-[var(--warn)]" : "text-[var(--text-secondary)]")}>{p.stage}</span>,
    },
    {
      key: "trend",
      header: <span className={HEAD}>30-day trend</span>,
      width: "w-[128px]",
      cell: (p) => <Trend points={p.scoreTrend} />,
    },
    {
      key: "audience",
      header: <span className={HEAD}>Audience</span>,
      align: "right",
      width: "w-[110px]",
      cell: (p) => <span className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">{p.audienceShare}%</span>,
    },
    {
      key: "score",
      header: <span className={HEAD}>Lead score</span>,
      align: "right",
      width: "w-[104px]",
      cell: (p) => <span className="font-mono text-[16px] font-medium tabular-nums tracking-[-0.01em] text-[var(--text-primary)]">{p.score}</span>,
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 py-3">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)]" strokeWidth={1.8} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search personas"
          aria-label="Search personas"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <label className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--text-muted)]">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort personas"
            className="cursor-pointer bg-transparent text-[13px] text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="score">Lead score</option>
            <option value="audience">Audience</option>
            <option value="name">Name</option>
            <option value="stage">Stage</option>
          </select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.slug}
        rowHref={(p) => `/personas/${p.slug}`}
        minWidth="min-w-[820px]"
        emptyState={<p className="px-3 py-12 text-center text-sm text-[var(--text-muted)]">No personas match &ldquo;{query.trim()}&rdquo;.</p>}
      />
    </div>
  );
}

function Trend({ points }: { points: number[] }) {
  const delta = points[points.length - 1] - points[0];
  const rising = delta >= 0;
  return (
    <div className="flex items-center gap-2">
      <Sparkline points={points} rising={rising} />
      <span className={cx("font-mono text-[11px] tabular-nums", rising ? "text-[var(--ok)]" : "text-[var(--warn)]")}>
        {rising ? "+" : "−"}
        {Math.abs(delta)}
      </span>
    </div>
  );
}

function Sparkline({ points, rising }: { points: number[]; rising: boolean }) {
  if (points.length < 2) return null;
  const w = 52;
  const h = 16;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((value, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((value - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden className="shrink-0">
      <path d={d} stroke={rising ? "var(--ok)" : "var(--warn)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
