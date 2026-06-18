"use client";

import { useMemo, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

import { BrainGraphCytoscape } from "./brain-graph-cytoscape";

type Props = { nodes: BrainNode[]; edges: BrainEdge[]; agentName: string };

const KIND_LABELS: Record<string, string> = {
  arc: "Core",
  hub: "Core",
  brand_fact: "Brand facts",
  persona: "Personas",
  proof_point: "Proof points",
  campaign: "Campaigns",
  objection: "Objections",
  channel: "Channels",
  service: "Services",
  learning: "Learnings",
  signal: "Signals",
  messaging_angle: "Messaging",
  campaign_ref: "Campaign refs",
  cta: "CTAs",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const KIND_DOT: Record<string, string> = {
  brand_fact: "var(--accent)",
  persona: "var(--ok)",
  proof_point: "var(--accent-strong)",
  campaign: "var(--accent)",
  objection: "var(--priority)",
  channel: "var(--text-secondary)",
  service: "var(--ok)",
  learning: "var(--warn)",
};

function trustTone(tier: string): "green" | "amber" | "gray" {
  if (tier === "trusted") return "green";
  if (tier === "observed") return "amber";
  return "gray";
}

export function BrainWorkspace({ nodes, edges, agentName }: Props) {
  const hub = useMemo(
    () => nodes.find((n) => n.kind === "arc" || n.kind === "hub") ?? null,
    [nodes],
  );
  // Default focus: the flagship campaign node if present, else the hub.
  const initial = useMemo(() => {
    const flagship = nodes.find((n) => /emergency water/i.test(n.label));
    return flagship?.id ?? hub?.id ?? nodes[0]?.id ?? null;
  }, [nodes, hub]);

  const [selectedId, setSelectedId] = useState<string | null>(initial);

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

  const connections = useMemo(() => {
    if (!selectedId) return [];
    const out: { node: BrainNode; relation: string }[] = [];
    for (const e of edges) {
      if (e.fromNodeId === selectedId) {
        const n = byId.get(e.toNodeId);
        if (n) out.push({ node: n, relation: e.relation });
      } else if (e.toNodeId === selectedId) {
        const n = byId.get(e.fromNodeId);
        if (n) out.push({ node: n, relation: e.relation });
      }
    }
    return out.slice(0, 8);
  }, [selectedId, edges, byId]);

  const confidence = selected?.confidence != null ? Math.round(selected.confidence * 100) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[208px_minmax(0,1fr)_320px]">
      {/* Category rail */}
      <aside className="signal-panel hidden min-w-0 flex-col p-3 lg:flex">
        <div className="signal-eyebrow mb-2.5 px-1">Explore</div>
        <button
          type="button"
          onClick={() => setSelectedId(hub?.id ?? null)}
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
                onClick={() => rep && setSelectedId(rep.id)}
                className={cx(
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition",
                  active
                    ? "bg-[var(--surface-inset)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: KIND_DOT[kind] ?? "var(--text-muted)" }}
                  />
                  <span className="truncate">{kindLabel(kind)}</span>
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Graph hero */}
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
        <div className="relative h-[74vh] min-h-[620px] w-full bg-[radial-gradient(120%_90%_at_50%_8%,rgba(200,162,74,0.05),transparent_60%)]">
          {nodes.length > 0 ? (
            <BrainGraphCytoscape nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              The brain is empty.
            </div>
          )}
        </div>
      </section>

      {/* Selected node detail */}
      <aside className="signal-panel min-w-0 p-4">
        {selected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="signal-eyebrow">{kindLabel(selected.kind)}</span>
              <StatusPill tone={trustTone(selected.trustTier)}>{selected.trustTier}</StatusPill>
            </div>
            <h3 className="font-serif text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
              {selected.label}
            </h3>
            {(selected.summary || selected.body) && (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{selected.summary ?? selected.body}</p>
            )}
            {confidence != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>Confidence</span>
                  <span className="font-mono text-[var(--text-secondary)]">{confidence}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${confidence}%` }}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-hairline)] pt-3 text-xs">
              <div>
                <div className="text-[var(--text-muted)]">Source</div>
                <div className="mt-0.5 text-[var(--text-secondary)]">{selected.source ?? "Arc inference"}</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)]">Connections</div>
                <div className="mt-0.5 font-mono text-[var(--text-secondary)]">{connections.length}</div>
              </div>
            </div>
            {selected.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {connections.length > 0 && (
              <div className="border-t border-[var(--border-hairline)] pt-3">
                <div className="signal-eyebrow mb-2">Related</div>
                <div className="flex flex-col gap-1">
                  {connections.map(({ node, relation }) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedId(node.id)}
                      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--surface-inset)]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: KIND_DOT[node.kind] ?? "var(--text-muted)" }}
                        />
                        <span className="truncate text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                          {node.label}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {relation.replace(/_/g, " ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <div className="text-sm font-medium text-[var(--text-secondary)]">Select a node</div>
            <p className="text-xs text-[var(--text-muted)]">Tap any node in the web to inspect what {agentName} knows.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
