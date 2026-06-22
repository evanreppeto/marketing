"use client";

import { nodeProvenance, traverseFrom } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

export type Relation = { node: BrainNode; relation: string };
export type RecallHop = { node: BrainNode; relation: string; direction: "in" | "out"; hops: number };

export function trustTone(tier: string): "green" | "amber" | "gray" {
  if (tier === "trusted") return "green";
  if (tier === "observed") return "amber";
  return "gray";
}

const KIND_LABELS: Record<string, string> = {
  arc: "Core", hub: "Core", brand_fact: "Brand fact", persona: "Persona", proof_point: "Proof point",
  campaign: "Campaign", objection: "Objection", channel: "Channel", service: "Service",
  learning: "Learning", signal: "Signal", messaging_angle: "Messaging", campaign_ref: "Campaign ref", cta: "CTA",
};
export const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const relationPhrase = (relation: string) => relation.replace(/_/g, " ");

/** Split a fact's edges into incoming (backlinks) and outgoing links. `limit` of
 *  0 (default) returns everything; pass a cap to trim for the compact side panel. */
export function deriveLinks(
  selected: BrainNode | null,
  byId: Map<string, BrainNode>,
  edges: BrainEdge[],
  limit = 0,
): { backlinks: Relation[]; outgoing: Relation[] } {
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
  return limit > 0 ? { backlinks: back.slice(0, limit), outgoing: out.slice(0, limit) } : { backlinks: back, outgoing: out };
}

/** The multi-hop memory Arc pulls around a fact (same traversal as the runner). */
export function deriveRecall(
  selected: BrainNode | null,
  byId: Map<string, BrainNode>,
  edges: BrainEdge[],
  maxPerSeed = 5,
): RecallHop[] {
  if (!selected) return [];
  const graphEdges = edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation }));
  const conns = traverseFrom([selected.id], graphEdges, { depth: 2, maxPerSeed }).get(selected.id) ?? [];
  return conns.flatMap((c) => {
    const node = byId.get(c.nodeId);
    return node ? [{ node, relation: c.relation, direction: c.direction, hops: c.hops }] : [];
  });
}

/** A clickable linked-fact row (used in Linked references / Links lists). */
export function RelationRow({ node, relation, onSelect }: Relation & { onSelect: (id: string) => void }) {
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

/** A single recalled fact, shown as a premium connected row on a rail. */
export function RecallRow({ node, relation, direction, hops, onSelect }: RecallHop & { onSelect: (id: string) => void }) {
  const dot = SOURCE_DOT[nodeProvenance(node).system];
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--surface-panel)]"
    >
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
