"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { nodeProvenance } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";
import { BrainFactModal } from "./brain-fact-modal";
import { deriveLinks, deriveRecall, kindLabel, RecallRow, RelationRow, trustTone } from "./brain-fact-parts";

type Props = {
  selected: BrainNode | null;
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  onSelect: (id: string) => void;
};

export function BrainNotePanel({ selected, nodes, edges, agentName, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Compact panel trims long lists; the full modal shows everything.
  const { backlinks, outgoing } = useMemo(() => deriveLinks(selected, byId, edges, 8), [selected, byId, edges]);
  const recall = useMemo(() => deriveRecall(selected, byId, edges, 5), [selected, byId, edges]);

  if (!selected) {
    return (
      <aside className="signal-panel flex min-w-0 flex-col items-center justify-center gap-1 p-4 text-center">
        <div className="text-sm font-medium text-[var(--text-secondary)]">Select a fact</div>
        <p className="text-xs text-[var(--text-muted)]">Tap any node to inspect what {agentName} knows — its source, backlinks, and what Arc recalls around it.</p>
      </aside>
    );
  }

  const prov = nodeProvenance(selected);
  // confidence is stored 0–100 (knowledge_nodes.confidence is an integer 0–100), not a 0–1 float.
  const confidence = selected.confidence != null ? Math.round(selected.confidence) : null;
  const learnedLabel = prov.learnedBy === "brand_sync" ? "Brand sync" : prov.learnedBy === "arc" ? agentName : "Operator";

  return (
    <aside className="signal-panel min-w-0 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="signal-eyebrow">{kindLabel(selected.kind)}</span>
          <div className="flex items-center gap-1.5">
            <StatusPill tone={trustTone(selected.trustTier)}>{selected.trustTier}</StatusPill>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Open full fact"
              title="Open full view"
              className="rounded-md border border-[var(--border-hairline)] p-1 text-[var(--text-muted)] transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-inset)] hover:text-[var(--accent)]"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5V8M12 3h3.5A1.5 1.5 0 0 1 17 4.5V8M8 17H4.5A1.5 1.5 0 0 1 3 15.5V12M12 17h3.5a1.5 1.5 0 0 0 1.5-1.5V12" />
              </svg>
            </button>
          </div>
        </div>
        <h3 className="font-serif text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{selected.label}</h3>
        {(selected.summary || selected.body) && (
          <p className="line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{selected.summary ?? selected.body}</p>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 text-[var(--text-muted)]">Source</span>
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
              {prov.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-[var(--text-muted)]">Learned by</span>
            <span className="text-[var(--text-secondary)]">{learnedLabel}</span>
          </div>
          {confidence != null && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-[var(--text-muted)]">Confidence</span>
              <span className="font-mono text-[var(--text-secondary)]">{confidence}%</span>
            </div>
          )}
        </div>

        {prov.deepLink && (
          <Link
            href={prov.deepLink.href}
            className="flex items-center justify-between rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
          >
            <span>{prov.deepLink.label}</span>
            <span aria-hidden>↗</span>
          </Link>
        )}

        {backlinks.length > 0 && (
          <div className="border-t border-[var(--border-hairline)] pt-3">
            <div className="signal-eyebrow mb-2">↩ Linked references · {backlinks.length}</div>
            <div className="flex flex-col gap-1">{backlinks.map((r) => <RelationRow key={`b-${r.node.id}`} node={r.node} relation={r.relation} onSelect={onSelect} />)}</div>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="border-t border-[var(--border-hairline)] pt-3">
            <div className="signal-eyebrow mb-2">→ Links · {outgoing.length}</div>
            <div className="flex flex-col gap-1">{outgoing.map((r) => <RelationRow key={`o-${r.node.id}`} node={r.node} relation={r.relation} onSelect={onSelect} />)}</div>
          </div>
        )}

        {recall.length > 0 && (
          <div className="rounded-xl border border-[var(--accent-border)] bg-[radial-gradient(130%_110%_at_0%_0%,var(--accent-soft),transparent_72%)] p-3.5">
            <div className="mb-0.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]" aria-hidden>
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="2.4" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
                </svg>
              </span>
              <span className="text-xs font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{agentName}&apos;s working memory</span>
            </div>
            <p className="mb-2 pl-7 text-[11px] leading-5 text-[var(--text-muted)]">
              Reasoning near this fact, {agentName} pulls {recall.length} connected {recall.length === 1 ? "memory" : "memories"}.
            </p>
            <div className="relative">
              <span aria-hidden className="absolute bottom-3 left-[18px] top-3 w-px bg-[var(--accent-border)]" />
              <div className="relative flex flex-col gap-0.5">
                {recall.map((r) => (
                  <RecallRow key={`r-${r.node.id}`} node={r.node} relation={r.relation} direction={r.direction} hops={r.hops} onSelect={onSelect} />
                ))}
              </div>
            </div>
          </div>
        )}

        {selected.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-3">
            {selected.tags.slice(0, 8).map((t) => (
              <span key={t} className="rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <BrainFactModal
          selected={selected}
          nodes={nodes}
          edges={edges}
          agentName={agentName}
          onSelect={onSelect}
          onClose={() => setExpanded(false)}
        />
      )}
    </aside>
  );
}
