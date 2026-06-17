"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState, StatusPill } from "./page-header";
import { useAgentName } from "./agent-name-context";
import type { ThemeTone } from "./theme";

export type OpportunityRow = {
  id: string;
  href: string;
  record: string;
  account: string;
  nextStep: string;
  stage: string;
  tone: ThemeTone;
  value: string;
  personaTag?: string;
  urgencyTag?: string;
  sourceTag?: string;
  lifecycleTag?: string;
  actions?: React.ReactNode;
};

export type OpportunityBucket = {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: ThemeTone;
  rows: OpportunityRow[];
  emptyTitle: string;
  emptyDetail: string;
};

export function OpportunityCommandCenter({ buckets }: { buckets: OpportunityBucket[] }) {
  const agentName = useAgentName();
  const [activeKey, setActiveKey] = useState(buckets[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const activeBucket = buckets.find((bucket) => bucket.key === activeKey) ?? buckets[0];
  const normalizedQuery = query.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    if (!activeBucket) return [];
    if (!normalizedQuery) return activeBucket.rows;

    return activeBucket.rows.filter((row) =>
      [
        row.record,
        row.account,
        row.nextStep,
        row.stage,
        row.value,
        row.personaTag,
        row.urgencyTag,
        row.sourceTag,
        row.lifecycleTag,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [activeBucket, normalizedQuery]);

  if (!activeBucket) {
    return (
      <EmptyState
        title="No opportunity lanes yet"
        detail={`When CRM, partner, campaign, approval, and ${agentName} task data is available, the prioritized lanes will appear here.`}
      />
    );
  }

  return (
    <section className="signal-panel module-rise overflow-hidden">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.7fr)] 2xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Prioritized opportunities</span>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Needs attention now</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              Switch lanes instead of scrolling through every opportunity. {agentName} can prepare and revise; humans approve anything external.
            </p>
          </div>

          <label className="relative block">
            <span className="sr-only">Search opportunity lane</span>
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 20 20"
            >
              <circle cx="9" cy="9" r="6" />
              <path d="m18 18-4.5-4.5" strokeLinecap="round" />
            </svg>
            <input
              className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${activeBucket.title.toLowerCase()}...`}
              type="search"
              value={query}
            />
          </label>
        </div>

        <nav aria-label="Opportunity lanes" className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {buckets.map((bucket) => {
            const selected = bucket.key === activeBucket.key;
            return (
              <button
                aria-pressed={selected}
                className={`min-h-[96px] cursor-pointer rounded-lg border p-3 text-left transition duration-200 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] active:translate-y-px ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)]"
                }`}
                key={bucket.key}
                onClick={() => {
                  setActiveKey(bucket.key);
                  setQuery("");
                }}
                type="button"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-bold leading-5 text-[var(--text-primary)]">{bucket.title}</span>
                  <StatusPill tone={bucket.tone}>{bucket.rows.length}</StatusPill>
                </span>
                <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">{bucket.detail}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {visibleRows.length > 0 ? (
            <div className="divide-y divide-[var(--border-hairline)]">
              {visibleRows.slice(0, 8).map((row) => (
                <div className="group px-5 py-4 transition hover:bg-[var(--surface-inset)]" key={row.id}>
                  <Link
                    className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    href={row.href}
                  >
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="line-clamp-1 font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
                            {row.record}
                          </span>
                          <StatusPill tone={row.tone}>{row.stage}</StatusPill>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{row.account}</p>
                        <p className="mt-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{row.nextStep}</p>
                      </div>
                      <div className="font-mono text-sm font-bold tabular-nums text-[var(--accent)] lg:text-right">{row.value}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                      {row.personaTag ? <Tag>{humanizeTag(row.personaTag)}</Tag> : null}
                      {row.urgencyTag ? <Tag>{humanizeTag(row.urgencyTag)}</Tag> : null}
                      {row.sourceTag ? <Tag>{humanizeTag(row.sourceTag)}</Tag> : null}
                      {row.lifecycleTag ? <Tag>{humanizeTag(row.lifecycleTag)}</Tag> : null}
                    </div>
                  </Link>
                  {row.actions ? <div className="mt-3">{row.actions}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title={normalizedQuery ? "No matching opportunity records" : activeBucket.emptyTitle}
                detail={normalizedQuery ? "Clear the search or try another term in this lane." : activeBucket.emptyDetail}
              />
            </div>
          )}
        </div>

        <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] p-5 xl:border-l xl:border-t-0">
          <div className="signal-eyebrow">Lane contract</div>
          <h3 className="mt-2 text-lg font-bold tracking-[-0.03em] text-[var(--text-primary)]">{activeBucket.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{activeBucket.detail}</p>
          <div className="mt-4 grid gap-2">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Visible records</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{visibleRows.length}</div>
            </div>
            <Link
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] active:translate-y-px"
              href={activeBucket.href}
            >
              Open source view
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
            This lane is for prioritization only. It does not send, publish, launch, spend, or contact anyone.
          </p>
        </aside>
      </div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1 font-semibold">
      {children}
    </span>
  );
}

function humanizeTag(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
