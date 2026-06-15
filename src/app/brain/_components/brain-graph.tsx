"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone, theme } from "@/app/_components/theme";
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
  brand_fact:       "#d05038", // restoration red
  persona:          "#b08755", // warm sand
  segment:          "#5d8a4f", // muted green
  service:          "#3a72b0", // blue
  proof_point:      "#8a78c0", // slate-purple
  messaging_angle:  "#d08a2c", // amber
  cta:              "#dc6a3a", // burnt orange
  asset_ref:        "#2f93b8", // teal
  learning:         "#4f9a8a", // sage
  signal:           "#b3604a", // rust
  crm_ref:          "#6b7d8f", // steel
  campaign_ref:     "#5878a8", // dusty blue
  other:            "#7a828f", // neutral
};
const KIND_COLOR_DEFAULT = "#8b929c";
const kindColor = (kind: string): string => KIND_COLOR[kind] ?? KIND_COLOR_DEFAULT;

const TIER_DOT: Record<string, string> = {
  trusted: "#4a9d6a",
  proposed: "#d99524",
  observed: "#4276ad",
  rejected: "#b85745",
  archived: "#6b7280",
};
const TIER_TONE: Record<string, ThemeTone> = {
  trusted: "green",
  proposed: "amber",
  observed: "blue",
  rejected: "red",
  archived: "gray",
};
const CANVAS_BG = "#16161a";

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

type RFGNode = NodeObject<Record<string, unknown>>;
type RFGLink = LinkObject<Record<string, unknown>, Record<string, unknown>>;

// rounded-rect path (ctx.roundRect isn't reliably typed across lib targets)
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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
  const [selected, setSelected] = useState<BrainNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Optimistic approve/reject decisions. key = node id, value = "trusted" | "rejected"
  const [tierOverrides, setTierOverrides] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<string>>(new Set());
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

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
      if (entry) setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const fittedRef = useRef(false);

  // ---- lookup maps ---------------------------------------------------------
  const nodeMap = useMemo<Map<string, BrainNode>>(() => {
    const m = new Map<string, BrainNode>();
    for (const n of localNodes) m.set(n.id, n);
    return m;
  }, [localNodes]);

  const degree = useMemo<Map<string, number>>(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.fromNodeId, (d.get(e.fromNodeId) ?? 0) + 1);
      d.set(e.toNodeId, (d.get(e.toNodeId) ?? 0) + 1);
    }
    return d;
  }, [edges]);
  const nodeRadius = useCallback((id: string) => 4 + Math.min(degree.get(id) ?? 0, 8) * 0.55, [degree]);

  const presentKinds = useMemo(() => [...new Set(nodes.map((n) => n.kind))].sort(), [nodes]);
  const presentTiers = useMemo(() => [...new Set(nodes.map((n) => n.trustTier))].sort(), [nodes]);

  const filteredNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of localNodes) {
      const kindOk = activeKinds.size === 0 || activeKinds.has(n.kind);
      const tierOk = activeTiers.size === 0 || activeTiers.has(n.trustTier);
      if (kindOk && tierOk) ids.add(n.id);
    }
    return ids;
  }, [localNodes, activeKinds, activeTiers]);

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

  // ---- focus / highlight ---------------------------------------------------
  const focusId = hovered ?? selected?.id ?? null;
  const { hlNodes, hlLinks } = useMemo(() => {
    const nset = new Set<string>();
    const lset = new Set<string>();
    if (focusId) {
      nset.add(focusId);
      for (const e of edges) {
        if (e.fromNodeId === focusId || e.toNodeId === focusId) {
          lset.add(e.id);
          nset.add(e.fromNodeId);
          nset.add(e.toNodeId);
        }
      }
    }
    return { hlNodes: nset, hlLinks: lset };
  }, [focusId, edges]);

  // ---- node canvas draw ----------------------------------------------------
  const nodeCanvasObject = useCallback(
    (rawNode: RFGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as unknown as BrainNode & { x?: number; y?: number };
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node.id);
      const color = kindColor(node.kind);
      const focused = focusId !== null;
      const lit = !focused || hlNodes.has(node.id);
      const isFocus = node.id === focusId;
      const isSelected = selected?.id === node.id;

      ctx.globalAlpha = lit ? 1 : 0.16;

      // fill
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // trust-tier ring
      if (node.trustTier === "trusted") {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.4, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([]);
        ctx.stroke();
      } else if (node.trustTier === "proposed") {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.6, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f0a52a";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r + 1, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(190,190,200,0.22)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // selection / focus halo
      if (isSelected || isFocus) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.2, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // label — centered below the node, on a dark pill for contrast
      const showLabel = isSelected || isFocus || (focused && hlNodes.has(node.id)) || globalScale > 1.7;
      if (showLabel && lit) {
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        const text = node.label ?? "";
        const tw = ctx.measureText(text).width;
        const padX = 4 / globalScale;
        const padY = 2.5 / globalScale;
        const boxW = tw + padX * 2;
        const boxH = fontSize + padY * 2;
        const top = y + r + 3 / globalScale;
        ctx.fillStyle = "rgba(12,12,15,0.82)";
        roundRectPath(ctx, x - boxW / 2, top, boxW, boxH, 3 / globalScale);
        ctx.fill();
        ctx.fillStyle = "rgba(245,245,247,0.96)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(text, x, top + padY);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    },
    [nodeRadius, focusId, hlNodes, selected],
  );

  const nodePointerAreaPaint = useCallback(
    (rawNode: RFGNode, paintColor: string, ctx: CanvasRenderingContext2D) => {
      const node = rawNode as unknown as { id: string; x?: number; y?: number };
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node.id) + 3, 0, 2 * Math.PI);
      ctx.fillStyle = paintColor;
      ctx.fill();
    },
    [nodeRadius],
  );

  // ---- handlers ------------------------------------------------------------
  const handleNodeClick = useCallback(
    (rawNode: RFGNode) => {
      const node = rawNode as unknown as BrainNode;
      setSelected(node.id === selected?.id ? null : (nodeMap.get(node.id) ?? null));
    },
    [selected, nodeMap],
  );

  const handleNodeHover = useCallback((rawNode: RFGNode | null) => {
    setHovered(rawNode ? (rawNode as unknown as { id: string }).id : null);
  }, []);

  function fitView() {
    graphRef.current?.zoomToFit(400, 60);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const query = search.toLowerCase();
    const match = localNodes.find((n) => filteredNodeIds.has(n.id) && n.label.toLowerCase().includes(query));
    if (match) {
      setSelected(match);
      const rfgNode = graphData.nodes.find((n) => (n as unknown as { id: string }).id === match.id) as
        | (Record<string, unknown> & { x?: number; y?: number })
        | undefined;
      if (rfgNode && graphRef.current) {
        graphRef.current.centerAt(rfgNode.x ?? 0, rfgNode.y ?? 0, 600);
        graphRef.current.zoom(5, 600);
      }
    }
  }

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
  function clearFilters() {
    setActiveKinds(new Set());
    setActiveTiers(new Set());
  }
  const filtersActive = activeKinds.size > 0 || activeTiers.size > 0;

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

  // ---- link accessors ------------------------------------------------------
  const linkLit = (l: RFGLink) => !focusId || hlLinks.has((l as unknown as GraphLink).id);
  const linkLabel = (l: RFGLink) => (l as unknown as GraphLink).relation?.replace(/_/g, " ") ?? "";
  const linkColor = (l: RFGLink) =>
    linkLit(l) ? "rgba(190,192,200,0.42)" : "rgba(120,122,130,0.07)";
  const linkWidth = (l: RFGLink) => (focusId && hlLinks.has((l as unknown as GraphLink).id) ? 2 : 0.8);
  const linkArrowColor = (l: RFGLink) =>
    linkLit(l) ? "rgba(190,192,200,0.5)" : "rgba(120,122,130,0.07)";
  const linkParticles = (l: RFGLink) =>
    focusId && hlLinks.has((l as unknown as GraphLink).id) ? 3 : 0;

  const visibleCount = filteredNodeIds.size;

  // ---- render --------------------------------------------------------------
  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2.5">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the brain…"
            className={theme.control.input + " h-9 min-h-0 w-48 text-xs"}
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--accent)]"
          >
            Find
          </button>
        </form>

        <span className="hidden h-6 w-px bg-[var(--border-hairline)] sm:block" />

        {/* Kind filter / legend */}
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
                  aria-pressed={active}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition " +
                    (active
                      ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]")
                  }
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: kindColor(kind) }}
                  />
                  {kind.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        )}

        {/* Trust filter */}
        {presentTiers.length > 1 && (
          <>
            <span className="hidden h-6 w-px bg-[var(--border-hairline)] sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Trust</span>
              {presentTiers.map((tier) => {
                const active = activeTiers.has(tier);
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => toggleTier(tier)}
                    aria-pressed={active}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition " +
                      (active
                        ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]")
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TIER_DOT[tier] ?? "#6b7280" }}
                    />
                    {tier}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Right group */}
        <div className="ml-auto flex items-center gap-2">
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
            >
              Clear
            </button>
          )}
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
            {filtersActive ? `${visibleCount} of ${nodes.length}` : `${nodes.length}`} nodes · {edges.length} links
          </span>
          <button
            type="button"
            onClick={fitView}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => downloadGraphJson(nodes, edges)}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]"
          >
            Download graph.json
          </button>
        </div>
      </div>

      {/* Canvas + detail side-by-side */}
      <div className="flex min-h-0 gap-4">
        <div
          ref={containerRef}
          className="h-[72vh] flex-1 overflow-hidden rounded-xl border border-[var(--border-hairline)]"
          style={{ minWidth: 0, cursor: hovered ? "pointer" : "default" }}
        >
          {canvasSize.width > 0 && (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={canvasSize.width}
              height={canvasSize.height}
              backgroundColor={CANVAS_BG}
              nodeId="id"
              nodeRelSize={5}
              nodeCanvasObject={nodeCanvasObject}
              nodeCanvasObjectMode={() => "replace"}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkLabel={linkLabel}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={2.6}
              linkDirectionalArrowRelPos={1}
              linkDirectionalArrowColor={linkArrowColor}
              linkDirectionalParticles={linkParticles}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => "#d05038"}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onBackgroundClick={() => setSelected(null)}
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
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: kindColor(selected.kind) }}
                  />
                  {selected.kind.replace(/_/g, " ")}
                </span>
                <StatusPill tone={TIER_TONE[selected.trustTier] ?? "gray"}>{selected.trustTier}</StatusPill>
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

            {neighbors.length > 0 && (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Connected ({neighbors.length})
                </h3>
                <ul className="flex flex-col divide-y divide-[var(--border-hairline)]">
                  {neighbors.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(n)}
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered(null)}
                        className="flex w-full items-center gap-2 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: kindColor(n.kind) }}
                        />
                        <span className="min-w-0 truncate">{n.label}</span>
                      </button>
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
