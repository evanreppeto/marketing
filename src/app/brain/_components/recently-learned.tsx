"use client";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { nodeProvenance } from "@/domain";
import { type BrainNode } from "@/lib/knowledge-graph/read-model";

import { kindDot, SOURCE_DOT } from "./brain-colors";

const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green", proposed: "amber", observed: "blue", rejected: "red", archived: "gray",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function RecentlyLearned({ nodes }: { nodes: BrainNode[] }) {
  const recent = [...nodes]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 8);

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recently learned</h2>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{recent.length} latest</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">Nothing recorded for this filter yet. As Arc learns, new facts land here newest-first.</p>
      ) : (
        <ol className="relative flex flex-col">
          {recent.map((node, i) => {
            const prov = nodeProvenance(node);
            return (
              <li key={node.id} className="flex gap-3 pb-3 last:pb-0">
                <div className="relative flex w-3 shrink-0 justify-center">
                  {i < recent.length - 1 ? <span aria-hidden className="absolute top-3 bottom-0 w-px bg-[var(--border-hairline)]" /> : null}
                  <span aria-hidden className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-panel)]" style={{ backgroundColor: kindDot(node.kind) }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
                      {prov.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{timeAgo(node.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-[var(--text-primary)]">{node.label}</p>
                    <StatusPill tone={TIER_TONE[node.trustTier] ?? "gray"}>{node.trustTier}</StatusPill>
                  </div>
                  {node.summary || node.body ? (
                    <p className="mt-0.5 truncate text-sm leading-6 text-[var(--text-secondary)]">{node.summary ?? node.body}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
