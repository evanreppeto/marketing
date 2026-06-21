"use client";

import { Panel } from "@/app/_components/page-header";
import { type BrainHealth as BrainHealthResult, type HealthIssue } from "@/domain";

import { kindLabel } from "./brain-fact-parts";

type Props = { health: BrainHealthResult; onSelect: (id: string) => void };

function tone(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Healthy", color: "var(--ok)" };
  if (score >= 65) return { label: "Fair", color: "var(--warn)" };
  return { label: "Needs attention", color: "var(--priority)" };
}

function IssueCard({
  title,
  hint,
  accent,
  issues,
  onSelect,
}: {
  title: string;
  hint: string;
  accent: string;
  issues: HealthIssue[];
  onSelect: (id: string) => void;
}) {
  return (
    <Panel>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)]">{issues.length}</span>
      </div>
      <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">{hint}</p>
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-[var(--ok)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
          All clear
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
          {issues.slice(0, 8).map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                className="group flex w-full items-center justify-between gap-3 py-2 text-left transition hover:bg-[var(--surface-inset)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{it.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{kindLabel(it.kind)} · {it.detail}</span>
                </span>
                <span aria-hidden className="shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)]">↗</span>
              </button>
            </li>
          ))}
          {issues.length > 8 ? (
            <li className="pt-2 text-[11px] text-[var(--text-muted)]">+{issues.length - 8} more</li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}

export function BrainHealth({ health: h, onSelect }: Props) {
  const t = tone(h.score);
  const issueTotal = h.orphans.length + h.coverageGaps.length + h.lowConfidence.length + h.stale.length;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="signal-eyebrow">Brain health</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-serif text-4xl font-bold leading-none tracking-[-0.02em]" style={{ color: t.color }}>{h.score}</span>
              <span className="text-lg text-[var(--text-muted)]">/ 100</span>
              <span className="text-sm font-semibold" style={{ color: t.color }}>{t.label}</span>
            </div>
            <p className="mt-2 max-w-prose text-sm leading-6 text-[var(--text-secondary)]">
              {issueTotal === 0
                ? `All ${h.total} facts are connected, fresh, and confident. Arc's memory is in good shape.`
                : `${h.total} facts · ${issueTotal} need attention. Fixing these makes a cleaner memory for Arc to recall from.`}
              {h.proposedCount > 0 ? ` ${h.proposedCount} also await review.` : ""}
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div className="h-full rounded-full transition-all" style={{ width: `${h.score}%`, background: t.color }} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <IssueCard title="Disconnected from the web" hint="No links, so Arc can't reach these when it recalls. Connect them to where they belong." accent="#bd6a58" issues={h.orphans} onSelect={onSelect} />
        <IssueCard title="Coverage gaps" hint="Personas Arc has little to say to — add proof points, objections, or a campaign." accent="#9a8fc4" issues={h.coverageGaps} onSelect={onSelect} />
        <IssueCard title="Low confidence" hint="Trusted but shaky. Verify the source or downgrade so Arc weights them right." accent="var(--warn)" issues={h.lowConfidence} onSelect={onSelect} />
        <IssueCard title="Going stale" hint="Older facts (stats, signals) that may need a refresh before Arc leans on them." accent="#6a86bd" issues={h.stale} onSelect={onSelect} />
      </div>
    </div>
  );
}
