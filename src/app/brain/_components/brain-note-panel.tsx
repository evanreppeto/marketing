"use client";

import { useMemo } from "react";
import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { enrichRecall, nodeProvenance, type RecallGraph } from "@/domain";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { SOURCE_DOT } from "./brain-colors";

type Relation = { node: BrainNode; relation: string };
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

  const recallLines = useMemo(() => {
    if (!selected) return [] as string[];
    const graph: RecallGraph = {
      nodes: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges: edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation })),
    };
    const seed = { id: selected.id, kind: selected.kind, label: selected.label, summary: selected.summary, tags: selected.tags, trustTier: selected.trustTier };
    return enrichRecall([seed], graph, { enrichLimit: 1, relationsPerNode: 4 })[0]?.related ?? [];
  }, [selected, nodes, edges]);

  if (!selected) {
    return (
      <aside className="signal-panel flex min-w-0 flex-col items-center justify-center gap-1 p-4 text-center">
        <div className="text-sm font-medium text-[var(--text-secondary)]">Select a fact</div>
        <p className="text-xs text-[var(--text-muted)]">Tap any node to inspect what {agentName} knows — its source, backlinks, and what Arc recalls around it.</p>
      </aside>
    );
  }

  const prov = nodeProvenance(selected);
  const confidence = selected.confidence != null ? Math.round(selected.confidence * 100) : null;
  const learnedLabel = prov.learnedBy === "brand_sync" ? "Brand sync" : prov.learnedBy === "arc" ? agentName : "Operator";

  const RelationRow = ({ node, relation }: Relation) => (
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
            <div className="flex flex-col gap-1">{backlinks.map((r) => <RelationRow key={`b-${r.node.id}`} {...r} />)}</div>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="border-t border-[var(--border-hairline)] pt-3">
            <div className="signal-eyebrow mb-2">→ Links · {outgoing.length}</div>
            <div className="flex flex-col gap-1">{outgoing.map((r) => <RelationRow key={`o-${r.node.id}`} {...r} />)}</div>
          </div>
        )}

        {recallLines.length > 0 && (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[radial-gradient(120%_100%_at_0%_0%,var(--accent-soft),transparent_70%)] p-3">
            <div className="signal-eyebrow mb-1.5">⟡ What {agentName} recalls here</div>
            <p className="mb-1.5 text-[11px] text-[var(--text-muted)]">When reasoning near this fact, {agentName} also pulls:</p>
            <ul className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {recallLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
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
