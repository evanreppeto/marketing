"use client";

import { useMemo } from "react";

import { cx } from "@/app/_components/theme";
import type { BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT, SOURCE_ORDER, sourceCounts } from "./brain-colors";
import type { SourceFilter } from "./brain-shell";

type Props = { nodes: BrainNode[]; active: SourceFilter; onChange: (next: SourceFilter) => void };

export function BrainSourceFilter({ nodes, active, onChange }: Props) {
  const counts = useMemo(() => sourceCounts(nodes), [nodes]);

  const pill = (key: SourceFilter, label: string, count: number, dot?: string) => {
    const isActive = active === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={isActive}
        className={cx(
          "relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition after:hidden",
          isActive
            ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-contrast)]"
            : "border-[var(--border-hairline)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
        )}
      >
        {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> : null}
        <span>{label}</span>
        <span className={cx("font-mono", isActive ? "text-[var(--accent-contrast)]" : "text-[var(--text-muted)]")}>{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="signal-eyebrow mr-1">Source</span>
      {pill("all", "All", counts.all)}
      {SOURCE_ORDER.filter((s) => counts.bySystem[s.system] > 0).map((s) =>
        pill(s.system, s.label, counts.bySystem[s.system], SOURCE_DOT[s.system]),
      )}
    </div>
  );
}
