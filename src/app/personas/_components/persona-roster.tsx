"use client";

import { ChevronDown, Search } from "lucide-react";
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

type SortKey = "name" | "segment" | "stage" | "audience" | "score";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  segment: "asc",
  stage: "asc",
  audience: "desc",
  score: "desc",
};

function needsAttention(stage: PersonaStage): boolean {
  return stage === "At risk" || stage === "Dormant";
}

function compare(a: DemoPersona, b: DemoPersona, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "segment":
      return segmentLabel(a.segment).localeCompare(segmentLabel(b.segment)) || b.score - a.score;
    case "stage":
      return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || b.score - a.score;
    case "audience":
      return a.audienceShare - b.audienceShare;
    default:
      return a.score - b.score;
  }
}

export function PersonaRoster({ personas }: { personas: DemoPersona[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "score", dir: "desc" });

  function onSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }));
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? personas.filter((p) => p.name.toLowerCase().includes(needle) || p.angle.toLowerCase().includes(needle))
      : personas;
    return filtered.slice().sort((a, b) => (sort.dir === "asc" ? compare(a, b, sort.key) : compare(b, a, sort.key)));
  }, [personas, query, sort]);

  const columns: Array<Column<DemoPersona>> = [
    {
      key: "persona",
      header: <SortHead label="Persona" sortKey="name" sort={sort} onSort={onSort} />,
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
      header: <SortHead label="Segment" sortKey="segment" sort={sort} onSort={onSort} />,
      width: "w-[150px]",
      cell: (p) => <span className="text-[13px] text-[var(--text-secondary)]">{segmentLabel(p.segment)}</span>,
    },
    {
      key: "stage",
      header: <SortHead label="Stage" sortKey="stage" sort={sort} onSort={onSort} />,
      width: "w-[120px]",
      cell: (p) => <span className={cx("text-[13px]", needsAttention(p.stage) ? "text-[var(--warn)]" : "text-[var(--text-secondary)]")}>{p.stage}</span>,
    },
    {
      key: "trend",
      header: <span className={HEAD_CLASS}>30-day trend</span>,
      width: "w-[128px]",
      cell: (p) => <Trend points={p.scoreTrend} />,
    },
    {
      key: "audience",
      header: <SortHead label="Audience" sortKey="audience" sort={sort} onSort={onSort} align="right" />,
      align: "right",
      width: "w-[110px]",
      cell: (p) => <span className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">{p.audienceShare}%</span>,
    },
    {
      key: "score",
      header: <SortHead label="Lead score" sortKey="score" sort={sort} onSort={onSort} align="right" />,
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

const HEAD_CLASS = "text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--text-muted)]";

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      className={cx(
        "group inline-flex items-center gap-1 transition",
        HEAD_CLASS,
        align === "right" && "flex-row-reverse",
        active ? "text-[var(--text-secondary)]" : "hover:text-[var(--text-secondary)]",
      )}
    >
      {label}
      <ChevronDown
        aria-hidden
        strokeWidth={2.2}
        className={cx("h-3 w-3 transition", active ? "opacity-100" : "opacity-0 group-hover:opacity-40", active && sort.dir === "asc" && "rotate-180")}
      />
    </button>
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
