"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import { type BrainEdge, type BrainNode } from "@/lib/knowledge-graph/read-model";
import type { ForceGraphMethods, ForceGraphProps, NodeObject, LinkObject } from "react-force-graph-2d";

// ---------------------------------------------------------------------------
// Dynamic import — browser-only (uses window/canvas)
// ---------------------------------------------------------------------------
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => ({ default: m.default })),
  { ssr: false },
) as React.ComponentType<
  ForceGraphProps<Record<string, unknown>, Record<string, unknown>> & {
    ref?: React.RefObject<ForceGraphMethods | undefined>;
  }
>;

// ---------------------------------------------------------------------------
// Node-kind colors — concrete hex values required by canvas API
// ---------------------------------------------------------------------------
const KIND_COLOR: Record<string, string> = {
  brand_fact:       "#c1452a", // restoration red
  persona:          "#8b6f47", // warm brown
  segment:          "#4a6741", // muted green
  service:          "#2c5282", // deep blue
  proof_point:      "#6b5b95", // slate-purple
  messaging_angle:  "#b45309", // amber-brown
  cta:              "#c2410c", // burnt orange
  asset_ref:        "#1e6b8c", // teal-blue
  learning:         "#3d6b61", // sage
  signal:           "#7c3d2f", // deep rust
  crm_ref:          "#4c5d6e", // steel-gray
  campaign_ref:     "#2d4a6b", // navy
  other:            "#555f6d", // neutral
};

const KIND_COLOR_DEFAULT = "#6b7280"; // gray-500

function kindColor(kind: string): string {
  return KIND_COLOR[kind] ?? KIND_COLOR_DEFAULT;
}

// ---------------------------------------------------------------------------
// Internal graph link shape (after transform)
// ---------------------------------------------------------------------------
type GraphLink = {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number | null;
  trustTier: string;
};

// Alias for what react-force-graph gives us in callbacks (source/target may be resolved to objects)
type RFGNode = NodeObject<Record<string, unknown>>;
type RFGLink = LinkObject<Record<string, unknown>, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------
function downloadGraphJson(nodes: BrainNode[], edges: BrainEdge[]) {
  const payload = {
    nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, trustTier: n.trustTier })),
    links: edges.map((e) => ({ source: e.fromNodeId, target: e.toNodeId, relation: e.relation, weight: e.weight })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "brain-graph.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BrainGraph({ nodes, edges }: { nodes: BrainNode[]; edges: BrainEdge[] }) {
  // ---- state ---------------------------------------------------------------
  const [selected, setSelected] = useState<BrainNode | null>(null);
  // Local overrides: approved/rejected decisions applied optimistically.
  // key = node id, value = "trusted" | "rejected" (to filter out)
  const [tierOverrides, setTierOverrides] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<string>>(new Set());
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Derive localNodes from props + overrides (no effect needed)
  const localNodes = useMemo<BrainNode[]>(() => {
    return nodes
      .filter((n) => tierOverrides.get(n.id) !== "rejected")
      .map((n) => {
        const override = tierOverrides.get(n.id);
        return override ? { ...n, trustTier: override as BrainNode["trustTier"] } : n;
      });
  }, [nodes, tierOverrides]);

  // ---- canvas sizing -------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(el);
    // seed on mount
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- graph ref for imperative API ----------------------------------------
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  // Fit the whole graph into view once the initial force layout settles.
  const fittedRef = useRef(false);

  // ---- lookup maps ---------------------------------------------------------
  const nodeMap = useMemo<Map<string, BrainNode>>(() => {
    const m = new Map<string, BrainNode>();
    for (const n of localNodes) m.set(n.id, n);
    return m;
  }, [localNodes]);

  // ---- kinds/tiers present in data ----------------------------------------
  const presentKinds = useMemo(() => [...new Set(nodes.map((n) => n.kind))].sort(), [nodes]);
  const presentTiers = useMemo(() => [...new Set(nodes.map((n) => n.trustTier))].sort(), [nodes]);

  // ---- filtered node ids ---------------------------------------------------
  const filteredNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of localNodes) {
      const kindOk = activeKinds.size === 0 || activeKinds.has(n.kind);
      const tierOk = activeTiers.size === 0 || activeTiers.has(n.trustTier);
      if (kindOk && tierOk) ids.add(n.id);
    }
    return ids;
  }, [localNodes, activeKinds, activeTiers]);

  // ---- graphData (memoized, fresh copy each time to avoid mutation issues) --
  const graphData = useMemo(() => {
    const filteredNodes = localNodes
      .filter((n) => filteredNodeIds.has(n.id))
      .map((n) => ({ ...n } as Record<string, unknown>));

    const filteredLinks = edges
      .filter((e) => filteredNodeIds.has(e.fromNodeId) && filteredNodeIds.has(e.toNodeId))
      .map((e): GraphLink => ({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        relation: e.relation,
        weight: e.weight,
        trustTier: e.trustTier,
      }))
      .map((l) => ({ ...l } as Record<string, unknown>));

    return { nodes: filteredNodes, links: filteredLinks };
  }, [localNodes, edges, filteredNodeIds]);

  // ---- node canvas draw ----------------------------------------------------
  const nodeCanvasObject = useCallback(
    (rawNode: RFGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as unknown as BrainNode & { x?: number; y?: number };
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = 5;

      // fill circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = kindColor(node.kind);
      ctx.fill();

      // trust-tier ring
      if (node.trustTier === "trusted") {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = kindColor(node.kind);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.stroke();
      } else if (node.trustTier === "proposed") {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f59e0b"; // amber
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // observed — faint ring
        ctx.beginPath();
        ctx.arc(x, y, r + 1, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(180,180,180,0.25)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // selected highlight
      const isSelected = selected?.id === node.id;
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // label (show when zoomed in or selected)
      if (globalScale > 3 || isSelected) {
        const label = node.label ?? "";
        const fontSize = Math.max(8 / globalScale, 3);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(240,240,240,0.92)";
        ctx.fillText(label, x + r + 2, y + fontSize / 3);
      }
    },
    [selected],
  );

  const nodePointerAreaPaint = useCallback(
    (rawNode: RFGNode, paintColor: string, ctx: CanvasRenderingContext2D) => {
      const node = rawNode as unknown as { x?: number; y?: number };
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = paintColor;
      ctx.fill();
    },
    [],
  );

  // ---- click handler -------------------------------------------------------
  const handleNodeClick = useCallback(
    (rawNode: RFGNode) => {
      const node = rawNode as unknown as BrainNode;
      setSelected(node.id === selected?.id ? null : (nodeMap.get(node.id) ?? null));
    },
    [selected, nodeMap],
  );

  // ---- search submit -------------------------------------------------------
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const query = search.toLowerCase();
    const match = localNodes.find(
      (n) => filteredNodeIds.has(n.id) && n.label.toLowerCase().includes(query),
    );
    if (match) {
      setSelected(match);
      const rfgNode = graphData.nodes.find((n) => (n as unknown as { id: string }).id === match.id) as
        | (Record<string, unknown> & { x?: number; y?: number })
        | undefined;
      if (rfgNode && graphRef.current) {
        graphRef.current.centerAt(rfgNode.x ?? 0, rfgNode.y ?? 0, 600);
        graphRef.current.zoom(4, 600);
      }
    }
  }

  // ---- toggle filter helpers -----------------------------------------------
  function toggleKind(kind: string) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function toggleTier(tier: string) {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  // ---- approval actions ----------------------------------------------------
  function handleApprove(nodeId: string) {
    startTransition(async () => {
      const result = await approveNodeAction(nodeId);
      if (result.ok) {
        setTierOverrides((prev) => new Map(prev).set(nodeId, "trusted"));
        setSelected((prev) => (prev?.id === nodeId ? { ...prev, trustTier: "trusted" } : prev));
      }
    });
  }

  function handleReject(nodeId: string) {
    startTransition(async () => {
      const result = await rejectNodeAction(nodeId);
      if (result.ok) {
        setTierOverrides((prev) => new Map(prev).set(nodeId, "rejected"));
        setSelected((prev) => (prev?.id === nodeId ? null : prev));
      }
    });
  }

  // ---- neighbor list -------------------------------------------------------
  const neighbors = useMemo<BrainNode[]>(() => {
    if (!selected) return [];
    const neighborIds = edges
      .filter((e) => e.fromNodeId === selected.id || e.toNodeId === selected.id)
      .map((e) => (e.fromNodeId === selected.id ? e.toNodeId : e.fromNodeId));
    return [...new Set(neighborIds)]
      .map((id) => nodeMap.get(id))
      .filter((n): n is BrainNode => n !== undefined);
  }, [selected, edges, nodeMap]);

  // ---- empty state ---------------------------------------------------------
  if (nodes.length === 0) {
    return (
      <Panel>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          The brain is empty — run{" "}
          <code className="rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono text-xs text-[var(--text-primary)]">
            pnpm seed:brain
          </code>{" "}
          or let Mark populate it.
        </p>
      </Panel>
    );
  }

  // ---- link accessors (stable refs not needed — simple values) -------------
  const linkWidth = (l: RFGLink) => Math.max(1, ((l as unknown as GraphLink).weight ?? 1));
  const linkLabel = (l: RFGLink) => (l as unknown as GraphLink).relation ?? "";
  const linkColor = () => "rgba(160,160,160,0.25)";

  // ---- render --------------------------------------------------------------
  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className={theme.control.input + " h-9 min-h-0 w-44 text-xs"}
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            Find
          </button>
        </form>

        {/* Kind filter chips */}
        {presentKinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Kind</span>
            {presentKinds.map((kind) => {
              const active = activeKinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className={
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition " +
                    (active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]")
                  }
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: kindColor(kind) }}
                  />
                  {kind.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        )}

        {/* Trust-tier filter chips */}
        {presentTiers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Trust</span>
            {presentTiers.map((tier) => {
              const active = activeTiers.has(tier);
              const toneMap: Record<string, string> = {
                trusted: "green",
                proposed: "amber",
                observed: "blue",
                rejected: "red",
                archived: "gray",
              };
              const tone = toneMap[tier] ?? "gray";
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition " +
                    (active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]")
                  }
                >
                  <StatusPill tone={tone as import("@/app/_components/theme").ThemeTone}>{tier}</StatusPill>
                </button>
              );
            })}
          </div>
        )}

        {/* Download */}
        <button
          type="button"
          onClick={() => downloadGraphJson(nodes, edges)}
          className="ml-auto inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]"
        >
          Download graph.json
        </button>
      </div>

      {/* Canvas + detail side-by-side */}
      <div className="flex min-h-0 gap-4">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="h-[70vh] flex-1 overflow-hidden rounded-xl border border-[var(--border-hairline)]"
          style={{ minWidth: 0 }}
        >
          {canvasSize.width > 0 && (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={canvasSize.width}
              height={canvasSize.height}
              backgroundColor="#18181b"
              nodeId="id"
              nodeLabel="label"
              nodeCanvasObject={nodeCanvasObject}
              nodeCanvasObjectMode={() => "replace"}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkLabel={linkLabel}
              linkWidth={linkWidth}
              linkColor={linkColor}
              onNodeClick={handleNodeClick}
              onEngineStop={() => {
                if (fittedRef.current) return;
                fittedRef.current = true;
                graphRef.current?.zoomToFit(500, 60);
              }}
            />
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {selected.kind.replace(/_/g, " ")}
                </span>
                <StatusPill
                  tone={
                    ({ trusted: "green", proposed: "amber", observed: "blue", rejected: "red", archived: "gray" } as Record<string, import("@/app/_components/theme").ThemeTone>)[selected.trustTier] ?? "gray"
                  }
                >
                  {selected.trustTier}
                </StatusPill>
              </div>

              <h2 className="mt-2 font-semibold text-[var(--text-primary)]">{selected.label}</h2>

              {selected.body ? (
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selected.body}</p>
              ) : null}

              {selected.persona ? (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  <span className="font-semibold">Persona:</span> {selected.persona}
                </p>
              ) : null}

              {selected.refTable && selected.refId ? (
                <Link
                  href={`/crm/${selected.refTable}/${selected.refId}`}
                  className="mt-2 inline-flex text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  View linked record
                </Link>
              ) : null}

              {/* Approve / Reject for proposed */}
              {selected.trustTier === "proposed" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleApprove(selected.id)}
                    className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)] disabled:pointer-events-none disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleReject(selected.id)}
                    className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] disabled:pointer-events-none disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            {/* Neighbors */}
            {neighbors.length > 0 && (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Neighbors ({neighbors.length})
                </h3>
                <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
                  {neighbors.map((n) => (
                    <li
                      key={n.id}
                      className="flex cursor-pointer items-center gap-2 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      onClick={() => setSelected(n)}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: kindColor(n.kind) }}
                      />
                      <span className="min-w-0 truncate">{n.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
