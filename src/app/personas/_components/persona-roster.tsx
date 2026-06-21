"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { cx, type ThemeTone } from "@/app/_components/theme";
import { type DemoPersona, type PersonaStage } from "../_data/demo-personas";

const STAGE_TONE: Record<PersonaStage, ThemeTone> = {
  New: "gray",
  "Hot lead": "blue",
  Active: "green",
  Champion: "green",
  "At risk": "amber",
  Dormant: "gray",
};

const STAGE_ORDER: Record<PersonaStage, number> = {
  "Hot lead": 0,
  Champion: 1,
  Active: 2,
  New: 3,
  "At risk": 4,
  Dormant: 5,
};

type SortKey = "score" | "name" | "stage";

export function PersonaRoster({ personas }: { personas: DemoPersona[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? personas.filter((p) => p.name.toLowerCase().includes(needle) || p.angle.toLowerCase().includes(needle))
      : personas;
    const sorted = filtered.slice().sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stage") return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || b.score - a.score;
      return b.score - a.score;
    });
    return sorted;
  }, [personas, query, sort]);

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] px-3 py-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={1.8} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search personas"
            aria-label="Search personas"
            className="h-10 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="font-semibold uppercase tracking-[0.12em]">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort personas"
            className="h-10 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-sm font-medium text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <option value="score">Lead score</option>
            <option value="name">Name</option>
            <option value="stage">Lifecycle stage</option>
          </select>
        </label>
      </div>

      {rows.length > 0 ? (
        <div className="p-1.5">
          {rows.map((persona) => (
            <PersonaRow key={persona.slug} persona={persona} />
          ))}
        </div>
      ) : (
        <EmptyState title="No personas match" detail="Try a different search, or clear it to see the full list." />
      )}
    </div>
  );
}

function PersonaRow({ persona }: { persona: DemoPersona }) {
  return (
    <Link
      href={`/personas/${persona.slug}`}
      className="group flex items-center gap-3.5 rounded-[10px] px-3.5 py-3 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <Monogram initials={persona.initials} live={persona.live} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
            {persona.name}
          </span>
          {persona.live ? <span aria-hidden title="Live data" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ok)]" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-[1.4] text-[var(--text-secondary)]">{persona.angle}</span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill>
      </span>
      <ScoreMeter score={persona.score} />
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)] sm:block" strokeWidth={1.8} />
    </Link>
  );
}

function Monogram({ initials, live }: { initials: string; live: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border text-[13px] font-semibold tracking-[0.02em]",
        live
          ? "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-[var(--accent)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
      )}
    >
      {initials}
    </span>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <span className="w-[62px] shrink-0">
      <span className="block text-right text-[9.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">Score</span>
      <span className="block text-right font-display text-[15px] font-semibold tabular-nums leading-none text-[var(--text-primary)]">{score}</span>
      <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}
