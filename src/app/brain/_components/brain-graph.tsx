"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Panel, StatusPill } from "@/app/_components/page-header";
import { type ThemeTone, theme } from "@/app/_components/theme";
import {
  approveNodeAction,
  archiveNodeAction,
  createNodeAction,
  rejectNodeAction,
  setNodeKindAction,
  setNodeTagsAction,
  updateNodeAction,
} from "@/app/brain/actions";
import { NODE_KINDS, normalizeKind, normalizeTags } from "@/domain";
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
// Palette for custom (operator-coined) kinds: a stable color is hashed from the
// kind name so each custom kind reads as visually distinct, not one flat gray.
const KIND_PALETTE = [
  "#c2683f", "#5d8a4f", "#3a72b0", "#8a78c0", "#d08a2c",
  "#2f93b8", "#4f9a8a", "#b3604a", "#6b7d8f", "#5878a8",
  "#9a6cc0", "#3f9d7a", "#c08a3a", "#7a8a9c",
];
function hashKindColor(kind: string): string {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return KIND_PALETTE[h % KIND_PALETTE.length];
}
const kindColor = (kind: string): string => KIND_COLOR[kind] ?? hashKindColor(kind);

// Plain-English description of what each node *kind* represents, shown in the
// detail panel so a node (especially one with no body, like a persona) always
// explains what it is. Custom kinds fall back to a generic line.
const KIND_DESCRIPTION: Record<string, string> = {
  brand_fact: "A verified claim about Big Shoulders that governs how we speak in outbound.",
  persona: "A target audience segment we map leads and campaigns to.",
  segment: "A grouping of personas or accounts targeted together.",
  service: "A restoration service Big Shoulders offers.",
  proof_point: "Evidence — a stat, result, or credential — that backs up a claim.",
  messaging_angle: "A way of framing the pitch for a persona or moment.",
  cta: "A call to action used in outbound.",
  asset_ref: "A creative asset (image, video, doc) we can reuse.",
  learning: "Something learned from performance or operator feedback.",
  signal: "An external trigger — weather, competitor, news — worth acting on.",
  crm_ref: "A link to a CRM record (company, contact, lead, job).",
  campaign_ref: "A link to a campaign package.",
  other: "A general note in the brain.",
};
const kindDescription = (kind: string): string =>
  KIND_DESCRIPTION[kind] ?? "A custom node type you defined.";

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
// Readable phrasing for an edge, oriented from the selected node's point of
// view. `out` = selected is the source; `in` = selected is the target.
// ---------------------------------------------------------------------------
const RELATION_PHRASE: Record<string, { out: string; in: string }> = {
  governs:       { out: "Governs how we speak to", in: "Governed by" },
  responds_to:   { out: "Responds to", in: "Answered by" },
  proves:        { out: "Proves", in: "Proven by" },
  targets:       { out: "Targets", in: "Targeted by" },
  relates_to:    { out: "Relates to", in: "Relates to" },
  learned_from:  { out: "Learned from", in: "Taught us" },
  used_in:       { out: "Used in", in: "Uses" },
  belongs_to:    { out: "Belongs to", in: "Includes" },
  competes_with: { out: "Competes with", in: "Competes with" },
};
function relationPhrase(relation: string, outgoing: boolean): string {
  const entry = RELATION_PHRASE[relation];
  if (entry) return outgoing ? entry.out : entry.in;
  const human = relation.replace(/_/g, " ");
  return outgoing ? human : `${human} (in)`;
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
  const [selected, setSelected] = useState<BrainNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Optimistic approve/reject decisions. key = node id, value = "trusted" | "rejected"
  const [tierOverrides, setTierOverrides] = useState<Map<string, string>>(new Map());
  // Optimistic tag edits. key = node id, value = the node's full tag list.
  const [tagOverrides, setTagOverrides] = useState<Map<string, string[]>>(new Map());
  // Optimistic kind edits. key = node id, value = the node's kind.
  const [kindOverrides, setKindOverrides] = useState<Map<string, string>>(new Map());
  // Optimistic label/body edits. key = node id, value = the changed fields.
  const [editOverrides, setEditOverrides] = useState<Map<string, { label?: string; body?: string | null }>>(new Map());
  // "New node" form state.
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<string>>(new Set());
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [tagDraft, setTagDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const localNodes = useMemo<BrainNode[]>(() => {
    return nodes
      .filter((n) => {
        const o = tierOverrides.get(n.id);
        return o !== "rejected" && o !== "archived";
      })
      .map((n) => {
        let node = n;
        const tier = tierOverrides.get(n.id);
        if (tier) node = { ...node, trustTier: tier as BrainNode["trustTier"] };
        const tags = tagOverrides.get(n.id);
        if (tags) node = { ...node, tags };
        const kind = kindOverrides.get(n.id);
        if (kind) node = { ...node, kind };
        const edit = editOverrides.get(n.id);
        if (edit) node = { ...node, ...edit };
        return node;
      });
  }, [nodes, tierOverrides, tagOverrides, kindOverrides, editOverrides]);

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

  // Uncontrolled editors; remounted per node via `key`, read on submit/blur.
  const kindInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);

  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const fittedRef = useRef(false);
  // Per-frame label boxes, for Obsidian-style overlap avoidance.
  const labelRectsRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);
  // Tracks the last search query + which match we centered on, so repeated
  // Enter on the same query cycles through every hit instead of re-centering one.
  const searchStateRef = useRef<{ query: string; index: number }>({ query: "", index: 0 });

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

  // Counts power the chip badges in the toolbar. Derived from the live slice so
  // they reflect optimistic approvals/rejections, not just the server snapshot.
  const kindCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of localNodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return m;
  }, [localNodes]);
  const tierCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of localNodes) m.set(n.trustTier, (m.get(n.trustTier) ?? 0) + 1);
    return m;
  }, [localNodes]);

  const presentKinds = useMemo(() => [...new Set(localNodes.map((n) => n.kind))].sort(), [localNodes]);
  const presentTiers = useMemo(() => [...new Set(localNodes.map((n) => n.trustTier))].sort(), [localNodes]);
  // Tags present across the brain, most-used first, for the toolbar filter row.
  const presentTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of localNodes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [localNodes]);

  // Built-in kinds plus any custom kinds already in use, for the kind combobox.
  const kindOptions = useMemo(
    () => [...new Set<string>([...NODE_KINDS, ...localNodes.map((n) => n.kind)])].sort(),
    [localNodes],
  );

  const filteredNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of localNodes) {
      const kindOk = activeKinds.size === 0 || activeKinds.has(n.kind);
      const tierOk = activeTiers.size === 0 || activeTiers.has(n.trustTier);
      const tagOk = activeTags.size === 0 || n.tags.some((t) => activeTags.has(t));
      if (kindOk && tierOk && tagOk) ids.add(n.id);
    }
    return ids;
  }, [localNodes, activeKinds, activeTiers, activeTags]);

  const graphData = useMemo(() => {
    const filteredNodes = localNodes
      .filter((n) => filteredNodeIds.has(n.id))
      // draw (and thus label) the most-connected nodes first so hubs win label priority
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
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
  }, [localNodes, edges, filteredNodeIds, degree]);

  // The currently-visible slice — drives both the count readout and the export,
  // so "Download" always matches what's on screen.
  const visibleNodes = useMemo(
    () => localNodes.filter((n) => filteredNodeIds.has(n.id)),
    [localNodes, filteredNodeIds],
  );
  const visibleEdges = useMemo(
    () => edges.filter((e) => filteredNodeIds.has(e.fromNodeId) && filteredNodeIds.has(e.toNodeId)),
    [edges, filteredNodeIds],
  );

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

      ctx.globalAlpha = lit ? 1 : 0.12;

      // filled circle with a subtle dark edge for separation from the background
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.stroke();

      // trust ring — only for states that need attention; "trusted" stays clean
      if (node.trustTier === "proposed") {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f0a52a";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (node.trustTier === "observed") {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.6, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(200,200,210,0.3)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // selection / focus halo
      if (isSelected || isFocus) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.2, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // ---- label: Obsidian-style — no box, dark halo for legibility, and
      // overlapping labels are dropped (hubs drawn first win priority).
      if (!lit) return;
      const inFocusSet = focused && hlNodes.has(node.id);
      const mustShow = isSelected || isFocus || inFocusSet;
      if (!mustShow && globalScale < 1.1) return;

      const text = node.label ?? "";
      if (!text) return;
      const fs = 12 / globalScale;
      ctx.font = `${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      const tw = ctx.measureText(text).width;
      const top = y + r + 3 / globalScale;
      const rect = { x: x - tw / 2, y: top, w: tw, h: fs };

      if (!mustShow) {
        const pad = 1.5 / globalScale;
        const overlaps = labelRectsRef.current.some(
          (o) =>
            rect.x < o.x + o.w + pad &&
            rect.x + rect.w + pad > o.x &&
            rect.y < o.y + o.h + pad &&
            rect.y + rect.h + pad > o.y,
        );
        if (overlaps) return;
      }
      labelRectsRef.current.push(rect);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3 / globalScale;
      ctx.strokeStyle = "rgba(15,15,18,0.92)";
      ctx.strokeText(text, x, top);
      ctx.fillStyle = mustShow ? "rgba(248,248,250,0.98)" : "rgba(212,214,220,0.9)";
      ctx.fillText(text, x, top);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
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
      setCreating(false);
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
    const query = search.trim().toLowerCase();
    if (!query) return;
    const matches = localNodes.filter((n) => filteredNodeIds.has(n.id) && n.label.toLowerCase().includes(query));
    if (matches.length === 0) return;
    // Same query again -> advance to the next hit; new query -> start over.
    const prev = searchStateRef.current;
    const index = prev.query === query ? (prev.index + 1) % matches.length : 0;
    searchStateRef.current = { query, index };
    const match = matches[index];
    setSelected(match);
    const rfgNode = graphData.nodes.find((n) => (n as unknown as { id: string }).id === match.id) as
      | (Record<string, unknown> & { x?: number; y?: number })
      | undefined;
    if (rfgNode && graphRef.current) {
      graphRef.current.centerAt(rfgNode.x ?? 0, rfgNode.y ?? 0, 600);
      graphRef.current.zoom(5, 600);
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
  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }
  function clearFilters() {
    setActiveKinds(new Set());
    setActiveTiers(new Set());
    setActiveTags(new Set());
  }
  const filtersActive = activeKinds.size > 0 || activeTiers.size > 0 || activeTags.size > 0;

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
  function handleArchive(nodeId: string) {
    startTransition(async () => {
      const result = await archiveNodeAction(nodeId);
      if (result.ok) {
        setTierOverrides((prev) => new Map(prev).set(nodeId, "archived"));
        setSelected((prev) => (prev?.id === nodeId ? null : prev));
      }
    });
  }

  // Persist a node's full tag list, optimistically updating both the override
  // map (so the graph/filters react) and the selected snapshot (so the panel does).
  function commitTags(nodeId: string, tags: string[]) {
    startTransition(async () => {
      const result = await setNodeTagsAction(nodeId, tags);
      if (result.ok) {
        setTagOverrides((prev) => new Map(prev).set(nodeId, tags));
        setSelected((prev) => (prev?.id === nodeId ? { ...prev, tags } : prev));
      }
    });
  }
  function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const next = normalizeTags([...selected.tags, tagDraft]);
    setTagDraft("");
    if (next.length !== selected.tags.length) commitTags(selected.id, next);
  }
  function removeTag(tag: string) {
    if (!selected) return;
    commitTags(
      selected.id,
      selected.tags.filter((t) => t !== tag),
    );
  }

  function commitKind(nodeId: string, kind: string) {
    startTransition(async () => {
      const result = await setNodeKindAction(nodeId, kind);
      if (result.ok) {
        setKindOverrides((prev) => new Map(prev).set(nodeId, kind));
        setSelected((prev) => (prev?.id === nodeId ? { ...prev, kind } : prev));
      }
    });
  }
  function submitKind(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!selected) return;
    const next = normalizeKind(kindInputRef.current?.value ?? "");
    // Reflect the normalized value (or revert an unusable entry) in the field.
    if (kindInputRef.current) kindInputRef.current.value = next || selected.kind;
    if (next && next !== selected.kind) commitKind(selected.id, next);
  }

  function commitEdit(nodeId: string, fields: { label?: string; body?: string | null }) {
    startTransition(async () => {
      const result = await updateNodeAction(nodeId, fields);
      if (result.ok) {
        setEditOverrides((prev) => new Map(prev).set(nodeId, { ...prev.get(nodeId), ...fields }));
        setSelected((prev) => (prev?.id === nodeId ? { ...prev, ...fields } : prev));
      }
    });
  }
  function submitLabel() {
    if (!selected) return;
    const label = (labelInputRef.current?.value ?? "").trim();
    if (!label) {
      if (labelInputRef.current) labelInputRef.current.value = selected.label; // revert empty
      return;
    }
    if (label !== selected.label) commitEdit(selected.id, { label });
  }
  function submitBody() {
    if (!selected) return;
    const body = (bodyInputRef.current?.value ?? "").trim() || null;
    if (body !== (selected.body ?? null)) commitEdit(selected.id, { body });
  }
  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tags = String(fd.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const input = {
      kind: String(fd.get("kind") ?? ""),
      label: String(fd.get("label") ?? ""),
      body: String(fd.get("body") ?? "") || undefined,
      persona: String(fd.get("persona") ?? "") || undefined,
      tags,
    };
    setCreateError(null);
    startTransition(async () => {
      const result = await createNodeAction(input);
      if (result.ok) {
        form.reset();
        setCreating(false);
      } else {
        setCreateError(result.error);
      }
    });
  }

  const neighbors = useMemo<Array<{ node: BrainNode; relation: string; outgoing: boolean }>>(() => {
    if (!selected) return [];
    const out: Array<{ node: BrainNode; relation: string; outgoing: boolean }> = [];
    const seen = new Set<string>();
    for (const e of edges) {
      const outgoing = e.fromNodeId === selected.id;
      const incoming = e.toNodeId === selected.id;
      if (!outgoing && !incoming) continue;
      const otherId = outgoing ? e.toNodeId : e.fromNodeId;
      const node = nodeMap.get(otherId);
      if (!node) continue;
      const key = `${otherId}:${e.relation}:${outgoing ? "o" : "i"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ node, relation: e.relation, outgoing });
    }
    return out;
  }, [selected, edges, nodeMap]);

  // Group connections under a readable phrase ("Governs how we speak to") so the
  // panel explains *why* nodes are linked, Obsidian-backlink style.
  const connectionGroups = useMemo(() => {
    const groups = new Map<string, { phrase: string; items: BrainNode[] }>();
    for (const c of neighbors) {
      const phrase = relationPhrase(c.relation, c.outgoing);
      const group = groups.get(phrase) ?? { phrase, items: [] };
      group.items.push(c.node);
      groups.set(phrase, group);
    }
    return [...groups.values()];
  }, [neighbors]);

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
      {/* Shared kind options for the detail editor and the new-node form. */}
      <datalist id="brain-kind-options">
        {kindOptions.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

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
                  <span className="tabular-nums text-[var(--text-muted)]">{kindCounts.get(kind) ?? 0}</span>
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
                    <span className="tabular-nums text-[var(--text-muted)]">{tierCounts.get(tier) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Tag filter */}
        {presentTags.length > 0 && (
          <>
            <span className="hidden h-6 w-px bg-[var(--border-hairline)] sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Tags</span>
              {presentTags.map(([tag, count]) => {
                const active = activeTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition " +
                      (active
                        ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]")
                    }
                  >
                    <span aria-hidden="true" className="text-[var(--text-muted)]">#</span>
                    {tag}
                    <span className="tabular-nums text-[var(--text-muted)]">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Right group */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setCreateError(null);
              setCreating(true);
            }}
            className="inline-flex h-9 items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--surface-raised)]"
          >
            + New node
          </button>
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
            {filtersActive ? `${visibleCount} of ${nodes.length}` : `${nodes.length}`} nodes ·{" "}
            {filtersActive ? visibleEdges.length : edges.length} links
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
            onClick={() => downloadGraphJson(visibleNodes, visibleEdges)}
            title={filtersActive ? "Exports the filtered view shown on screen" : "Exports the full brain"}
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
          {canvasSize.width > 0 && visibleCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">No nodes match these filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-[var(--accent)] underline-offset-2 transition hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : canvasSize.width > 0 ? (
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
              onRenderFramePre={() => {
                labelRectsRef.current = [];
              }}
              onEngineStop={() => {
                if (fittedRef.current) return;
                fittedRef.current = true;
                graphRef.current?.zoomToFit(500, 60);
              }}
            />
          ) : null}
        </div>

        {/* New-node form */}
        {creating && (
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
            <form
              onSubmit={submitCreate}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[var(--text-primary)]">New node</h2>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="text-xs text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
                >
                  Cancel
                </button>
              </div>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Kind
                <input
                  name="kind"
                  list="brain-kind-options"
                  required
                  placeholder="persona, brand_fact, or your own…"
                  className={theme.control.input + " h-8 min-h-0 w-full text-xs normal-case"}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Label
                <input
                  name="label"
                  required
                  placeholder="Short title"
                  className={theme.control.input + " h-8 min-h-0 w-full text-xs normal-case"}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Description
                <textarea
                  name="body"
                  rows={3}
                  placeholder="What is this?"
                  className={theme.control.input + " min-h-0 w-full resize-y py-1 text-xs normal-case"}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Persona (optional)
                <input
                  name="persona"
                  placeholder="persona_…"
                  className={theme.control.input + " h-8 min-h-0 w-full text-xs normal-case"}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Tags (comma-separated)
                <input
                  name="tags"
                  placeholder="emergency, homeowner"
                  className={theme.control.input + " h-8 min-h-0 w-full text-xs normal-case"}
                />
              </label>

              {createError ? <p className="text-xs text-[var(--accent)]">{createError}</p> : null}

              <button
                type="submit"
                disabled={isPending}
                className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)] disabled:pointer-events-none disabled:opacity-50"
              >
                Create node
              </button>
            </form>
          </aside>
        )}

        {/* Detail panel */}
        {!creating && selected && (
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

              {/* Editable label — reads as a heading, edits on focus. */}
              <input
                ref={labelInputRef}
                key={`label-${selected.id}`}
                defaultValue={selected.label}
                onBlur={submitLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={isPending}
                aria-label="Node label"
                className="mt-2 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold text-[var(--text-primary)] outline-none transition hover:border-[var(--border-hairline)] focus:border-[var(--accent-border-strong)] focus:bg-[var(--surface-inset)]"
              />

              {/* What this kind of node is — always shown, so even body-less
                  nodes (e.g. personas) explain themselves. */}
              <p className="mt-1.5 px-1 text-xs leading-5 text-[var(--text-muted)]">{kindDescription(selected.kind)}</p>

              {selected.summary && selected.summary !== selected.body ? (
                <p className="mt-2 px-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">{selected.summary}</p>
              ) : null}

              {/* Editable description (body). Always present so a body-less node
                  can have one added. */}
              <textarea
                ref={bodyInputRef}
                key={`body-${selected.id}`}
                defaultValue={selected.body ?? ""}
                onBlur={submitBody}
                disabled={isPending}
                rows={3}
                placeholder="Add a description…"
                aria-label="Node description"
                className="mt-2 w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-1 text-sm leading-6 text-[var(--text-secondary)] outline-none transition hover:border-[var(--border-hairline)] focus:border-[var(--accent-border-strong)] focus:bg-[var(--surface-inset)]"
              />

              {selected.persona ? (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  <span className="font-semibold">Persona:</span> {selected.persona}
                </p>
              ) : null}

              {selected.confidence != null || selected.source ? (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {selected.confidence != null ? `${selected.confidence}% confidence` : null}
                  {selected.confidence != null && selected.source ? " · " : null}
                  {selected.source ? `source: ${selected.source}` : null}
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

              {/* Kind — editable; pick a built-in or coin a custom one inline. */}
              <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Kind
                </h3>
                <form onSubmit={submitKind} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: kindColor(selected.kind) }}
                  />
                  <input
                    ref={kindInputRef}
                    key={selected.id}
                    list="brain-kind-options"
                    defaultValue={selected.kind}
                    onBlur={submitKind}
                    disabled={isPending}
                    placeholder="Pick or type a kind…"
                    aria-label="Node kind"
                    className={theme.control.input + " h-8 min-h-0 w-full text-xs"}
                  />
                </form>
              </div>

              {/* Tags — operator-authored, freeform metadata (not gated). */}
              <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-0.5 pl-2 pr-1 text-[11px] text-[var(--text-secondary)]"
                    >
                      <span aria-hidden="true" className="text-[var(--text-muted)]">#</span>
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        disabled={isPending}
                        aria-label={`Remove tag ${tag}`}
                        className="grid h-4 w-4 place-items-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--accent)] disabled:opacity-50"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {selected.tags.length === 0 && (
                    <span className="text-[11px] text-[var(--text-muted)]">No tags yet</span>
                  )}
                </div>
                <form onSubmit={addTag} className="mt-2">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="Add a tag, press Enter…"
                    disabled={isPending}
                    className={theme.control.input + " h-8 min-h-0 w-full text-xs"}
                  />
                </form>
              </div>

              {/* Archive — soft delete; drops the node from the brain view
                  (recoverable via the API). */}
              <div className="mt-4 flex justify-end border-t border-[var(--border-hairline)] pt-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleArchive(selected.id)}
                  className="text-[11px] font-medium text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--accent)] hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  Archive node
                </button>
              </div>
            </div>

            {connectionGroups.length > 0 && (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Connected ({neighbors.length})
                </h3>
                <div className="flex flex-col gap-3">
                  {connectionGroups.map((group) => (
                    <div key={group.phrase}>
                      <p className="mb-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{group.phrase}</p>
                      <ul className="flex flex-col">
                        {group.items.map((n, i) => (
                          <li key={`${n.id}-${i}`}>
                            <button
                              type="button"
                              onClick={() => setSelected(n)}
                              onMouseEnter={() => setHovered(n.id)}
                              onMouseLeave={() => setHovered(null)}
                              className="flex w-full items-center gap-2 py-1 text-left text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
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
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
