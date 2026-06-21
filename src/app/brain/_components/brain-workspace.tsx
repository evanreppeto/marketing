"use client";

import { useMemo } from "react";

import { cx } from "@/app/_components/theme";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { BrainGraphCytoscape } from "./brain-graph-cytoscape";
import { BrainNotePanel } from "./brain-note-panel";
import { KIND_DOT } from "./brain-colors";

type Props = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  agentName: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const KIND_LABELS: Record<string, string> = {
  arc: "Core", hub: "Core", brand_fact: "Brand facts", persona: "Personas", proof_point: "Proof points",
  campaign: "Campaigns", objection: "Objections", channel: "Channels", service: "Services",
  learning: "Learnings", signal: "Signals", messaging_angle: "Messaging", campaign_ref: "Campaign refs", cta: "CTAs",
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function BrainWorkspace({ nodes, edges, agentName, selectedId, onSelect }: Props) {
  const hub = useMemo(() => nodes.find((n) => n.kind === "arc" || n.kind === "hub") ?? null, [nodes]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.kind === "arc" || n.kind === "hub") continue;
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  return (
    <div className="grid gap-3 lg:grid-cols-[208px_minmax(0,1fr)_320px]">
      <aside className="signal-panel hidden min-w-0 flex-col p-3 lg:flex">
        <div className="signal-eyebrow mb-2.5 px-1">Explore</div>
        <button
          type="button"
          onClick={() => hub && onSelect(hub.id)}
          className={cx(
            "mb-1 flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition",
            !selected || selected.id === hub?.id
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            All knowledge
          </span>
          <span className="font-mono text-xs text-[var(--text-muted)]">{nodes.length}</span>
        </button>
        <div className="mt-1 flex flex-col">
          {categories.map(([kind, count]) => {
            const rep = nodes.find((n) => n.kind === kind);
            const active = selected?.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => rep && onSelect(rep.id)}
                className={cx(
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition",
                  active ? "bg-[var(--surface-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[kind] ?? "var(--text-muted)" }} />
                  <span className="truncate">{kindLabel(kind)}</span>
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="signal-panel relative min-w-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Knowledge web</span>
            <span className="text-xs text-[var(--text-muted)]">{agentName}&apos;s connected memory</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ok)]" />Trusted</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />Observed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-dashed border-[var(--text-muted)]" />Proposed</span>
          </div>
        </div>
        <div className="relative h-[74vh] min-h-[620px] w-full bg-[radial-gradient(105%_80%_at_50%_38%,rgba(200,162,74,0.08),transparent_58%),linear-gradient(180deg,var(--canvas-deep),var(--canvas))]">
          {nodes.length > 0 ? (
            <BrainGraphCytoscape nodes={nodes} edges={edges} selectedId={selectedId} onSelect={onSelect} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No facts match this filter.</div>
          )}
        </div>
      </section>

      <BrainNotePanel selected={selected} nodes={nodes} edges={edges} agentName={agentName} onSelect={onSelect} />
    </div>
  );
}
