"use client";

import { useMemo } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { nodeProvenance, traverseFrom } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

type Relation = { node: BrainNode; relation: string };
type RecallHop = { node: BrainNode; relation: string; direction: "in" | "out"; hops: number };
type Props = {
  selected: BrainNode | null;
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  onSelect: (id: string) => void;
};

function trustTone(tier: string): "green" | "amber" | "gray" {
  if (tier === "trusted") return "green";
  if (tier === "observed") return "amber";
  return "gray";
}

const KIND_LABELS: Record<string, string> = {
  arc: "Core", hub: "Core", brand_fact: "Brand fact", persona: "Persona", proof_point: "Proof point",
  campaign: "Campaign", objection: "Objection", channel: "Channel", service: "Service",
  learning: "Learning", signal: "Signal", messaging_angle: "Messaging", campaign_ref: "Campaign ref", cta: "CTA",
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function RelationRow({ node, relation, onSelect }: Relation & { onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--surface-inset)]"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SOURCE_DOT[nodeProvenance(node).system] }} />
        <span className="truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{node.label}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{relation.replace(/_/g, " ")}</span>
    </button>
  );
}

const relationPhrase = (relation: string) => relation.replace(/_/g, " ");

/** A single fact Arc pulls into working memory, shown as a premium connected row:
 *  a direction node, the recalled fact's label, and its relation/kind/distance. */
function RecallRow({ node, relation, direction, hops, onSelect }: RecallHop & { onSelect: (id: string) => void }) {
  const dot = SOURCE_DOT[nodeProvenance(node).system];
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--surface-panel)]"
    >
      {/* direction node on a connecting rail */}
      <span
        className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--accent-border-strong)] bg-[var(--canvas)] text-[var(--accent)]"
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          {direction === "out" ? <path d="M4 8h8M9 5l3 3-3 3" /> : <path d="M12 8H4M7 5L4 8l3 3" />}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
          <span className="truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{node.label}</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {relationPhrase(relation)} · {kindLabel(node.kind)}
          {hops > 1 ? ` · ${hops} hops` : ""}
        </span>
      </span>
    </button>
  );
}

export function BrainNotePanel({ selected, nodes, edges, agentName, onSelect }: Props) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const { backlinks, outgoing } = useMemo(() => {
    const back: Relation[] = [];
    const out: Relation[] = [];
    if (!selected) return { backlinks: back, outgoing: out };
    for (const e of edges) {
      if (e.toNodeId === selected.id) {
        const n = byId.get(e.fromNodeId);
        if (n) back.push({ node: n, relation: e.relation });
      } else if (e.fromNodeId === selected.id) {
        const n = byId.get(e.toNodeId);
        if (n) out.push({ node: n, relation: e.relation });
      }
    }
    return { backlinks: back.slice(0, 8), outgoing: out.slice(0, 8) };
  }, [selected, edges, byId]);

  // Structured multi-hop recall: exactly what Arc pulls into working memory around
  // this fact (same traversal the runner uses), as rich rows instead of raw text.
  const recall = useMemo<RecallHop[]>(() => {
    if (!selected) return [];
    const graphEdges = edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation }));
    const conns = traverseFrom([selected.id], graphEdges, { depth: 2, maxPerSeed: 5 }).get(selected.id) ?? [];
    return conns.flatMap((c) => {
      const node = byId.get(c.nodeId);
      return node ? [{ node, relation: c.relation, direction: c.direction, hops: c.hops }] : [];
    });
  }, [selected, edges, byId]);

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
          <StatusPill tone={trustTone(selected.trustTier)}>{selected.trustTier}</StatusPill>
        </div>
        <h3 className="font-serif text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">{selected.label}</h3>
        {(selected.summary || selected.body) && (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{selected.summary ?? selected.body}</p>
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
            {/* connecting rail behind the direction nodes */}
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
    </aside>
  );
}
