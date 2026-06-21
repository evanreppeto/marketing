"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cx } from "@/app/_components/theme";
import { type DemoPersona, type PersonaStage } from "../_data/demo-personas";

const STAGE_ORDER: Record<PersonaStage, number> = {
  "Hot lead": 0,
  Champion: 1,
  Active: 2,
  New: 3,
  "At risk": 4,
  Dormant: 5,
};

type SortKey = "score" | "name" | "stage";

function needsAttention(stage: PersonaStage): boolean {
  return stage === "At risk" || stage === "Dormant";
}

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
      return b.score - a.score;
    });
  }, [personas, query, sort]);

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-3">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)]" strokeWidth={1.8} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search personas"
          aria-label="Search personas"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort personas"
          className="shrink-0 cursor-pointer bg-transparent text-[13px] text-[var(--text-muted)] transition focus:text-[var(--text-secondary)] focus:outline-none"
        >
          <option value="score">Lead score</option>
          <option value="name">Name</option>
          <option value="stage">Stage</option>
        </select>
      </div>

      {rows.length > 0 ? (
        <div>
          {rows.map((persona) => {
            const attn = needsAttention(persona.stage);
            return (
              <Link
                key={persona.slug}
                href={`/personas/${persona.slug}`}
                className="group grid grid-cols-[minmax(0,1fr)_88px_52px] items-center gap-5 border-t border-[var(--border-hairline)] py-[18px] transition first:border-t-0 hover:bg-[color-mix(in_srgb,var(--text-primary)_3%,transparent)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    {attn ? <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--warn)]" /> : null}
                    <span className="truncate text-[16px] font-medium tracking-[-0.01em] text-[var(--text-primary)]">{persona.name}</span>
                  </div>
                  <div className={cx("mt-1.5 truncate text-[13px] leading-snug text-[var(--text-muted)]", attn && "ml-[15px]")}>{persona.angle}</div>
                </div>
                <div className={cx("text-right text-[13px]", attn ? "text-[var(--warn)]" : "text-[var(--text-muted)]")}>{persona.stage}</div>
                <div className="text-right font-mono text-[19px] font-medium tabular-nums tracking-[-0.01em] text-[var(--text-primary)]">{persona.score}</div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">No personas match &ldquo;{query.trim()}&rdquo;.</p>
      )}
    </div>
  );
}
