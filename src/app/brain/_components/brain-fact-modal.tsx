"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { nodeProvenance } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";
import { deriveLinks, deriveRecall, kindLabel, RecallRow, RelationRow, trustTone } from "./brain-fact-parts";

type Props = {
  selected: BrainNode;
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** Full-screen reader for a single fact: complete body, every linked reference and
 *  outgoing link, the recall memory, provenance, and tags — nothing truncated.
 *  Clicking any linked fact navigates the modal to it (stays open). */
export function BrainFactModal({ selected, nodes, edges, agentName, onSelect, onClose }: Props) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { backlinks, outgoing } = useMemo(() => deriveLinks(selected, byId, edges), [selected, byId, edges]);
  const recall = useMemo(() => deriveRecall(selected, byId, edges, 8), [selected, byId, edges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prov = nodeProvenance(selected);
  const confidence = selected.confidence != null ? Math.round(selected.confidence) : null;
  const learnedLabel = prov.learnedBy === "brand_sync" ? "Brand sync" : prov.learnedBy === "arc" ? agentName : "Operator";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 py-[7vh]" role="dialog" aria-modal="true" aria-label={selected.label}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="signal-eyebrow">{kindLabel(selected.kind)}</span>
              <StatusPill tone={trustTone(selected.trustTier)}>{selected.trustTier}</StatusPill>
            </div>
            <h2 className="font-serif text-xl font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{selected.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md border border-[var(--border-hairline)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* body — scrolls */}
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          {(selected.summary || selected.body) && (
            <div className="flex flex-col gap-2">
              {selected.summary && <p className="text-sm font-medium leading-6 text-[var(--text-primary)]">{selected.summary}</p>}
              {selected.body && <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{selected.body}</p>}
            </div>
          )}

          {/* provenance grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-xs sm:grid-cols-3">
            <div>
              <div className="text-[var(--text-muted)]">Source</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
                {prov.label}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Learned by</div>
              <div className="mt-0.5 text-[var(--text-secondary)]">{learnedLabel}</div>
            </div>
            {confidence != null && (
              <div>
                <div className="text-[var(--text-muted)]">Confidence</div>
                <div className="mt-0.5 font-mono text-[var(--text-secondary)]">{confidence}%</div>
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

          {/* links — two columns on wide */}
          <div className="grid gap-5 sm:grid-cols-2">
            {backlinks.length > 0 && (
              <div>
                <div className="signal-eyebrow mb-2">↩ Linked references · {backlinks.length}</div>
                <div className="flex flex-col gap-0.5">{backlinks.map((r) => <RelationRow key={`b-${r.node.id}`} node={r.node} relation={r.relation} onSelect={onSelect} />)}</div>
              </div>
            )}
            {outgoing.length > 0 && (
              <div>
                <div className="signal-eyebrow mb-2">→ Links · {outgoing.length}</div>
                <div className="flex flex-col gap-0.5">{outgoing.map((r) => <RelationRow key={`o-${r.node.id}`} node={r.node} relation={r.relation} onSelect={onSelect} />)}</div>
              </div>
            )}
          </div>

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
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-4">
              {selected.tags.map((t) => (
                <span key={t} className="rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
