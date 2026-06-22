"use client";

import { useMemo, useState } from "react";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { cx, type ThemeTone } from "@/app/_components/theme";
import { previewRecall } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { kindLabel } from "./brain-fact-parts";

const TIER_TONE: Record<string, ThemeTone> = { trusted: "green", observed: "blue", proposed: "amber" };

const EXAMPLES = [
  "Flooded basement, need a crew right now",
  "Freeze-thaw this week — burst pipe risk",
  "Homeowner says insurance should cover it",
  "Mold in a rental unit",
  "Plumber referred a water-damage job",
];

type Props = { nodes: BrainNode[]; edges: BrainEdge[]; agentName: string; onSelect: (id: string) => void };

export function BrainRecallTester({ nodes, edges, agentName, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const results = useMemo(
    () => (submitted == null ? null : previewRecall(nodes, edges, submitted)),
    [submitted, nodes, edges],
  );

  const run = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setQuery(t);
    setSubmitted(t);
  };

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="signal-eyebrow mb-1">Ask the brain</div>
        <p className="mb-3 max-w-prose text-sm leading-6 text-[var(--text-secondary)]">
          Describe a scenario the way an operator or a lead would. You&apos;ll see exactly which facts {agentName} pulls
          into working memory for it — the same recall it runs live. A good way to check the brain is serving {agentName}
          well, and to spot what&apos;s missing.
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(query); }}
            placeholder="e.g. flooded basement in Lincoln Park, winter, landlord"
            aria-label="Scenario to test recall"
            className="min-w-0 flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border-strong)]"
          />
          <button
            type="button"
            onClick={() => run(query)}
            className="shrink-0 rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3.5 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
          >
            See recall
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => run(ex)}
              className="rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
            >
              {ex}
            </button>
          ))}
        </div>
      </Panel>

      {results && (
        <Panel>
          {results.length === 0 ? (
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              {agentName} wouldn&apos;t recall anything specific for that — it would fall back to its core memory. Try
              wording closer to a fact in the brain, or connect more facts on the Health tab so they&apos;re reachable.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {agentName} pulls {results.length} {results.length === 1 ? "fact" : "facts"} into memory
                </h3>
                <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">core = always-on · matched = your wording</span>
              </div>
              <ol className="flex flex-col divide-y divide-[var(--border-hairline)]">
                {results.map((r, i) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-[var(--text-muted)]">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="signal-eyebrow">{kindLabel(r.kind)}</span>
                          <StatusPill tone={TIER_TONE[r.trustTier] ?? "gray"}>{r.trustTier}</StatusPill>
                          <span
                            className={cx(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              r.core
                                ? "bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                                : "border border-[var(--border-hairline)] text-[var(--text-muted)]",
                            )}
                          >
                            {r.core ? "core" : "matched"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelect(r.id)}
                          className="mt-1 block max-w-full truncate text-left text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]"
                        >
                          {r.label}
                        </button>
                        {r.summary ? <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{r.summary}</p> : null}
                        {r.related.length > 0 ? (
                          <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
                            {r.related.map((line, j) => <li key={j}>{line}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
