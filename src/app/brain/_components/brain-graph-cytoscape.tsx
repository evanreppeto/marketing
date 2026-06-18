"use client";

import { useEffect, useRef } from "react";

import type { BrainEdge, BrainNode } from "@/lib/knowledge-graph/read-model";

type Props = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  /** Currently selected node id (controlled by the workspace). */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/** Resolve a CSS custom property to a concrete color so Cytoscape (canvas) can use it. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Interactive knowledge graph rendered with Cytoscape, tuned to feel like
 * Obsidian's graph view: a force web that settles in on load, draggable nodes,
 * gold "glow" underlays, labels that ride on small chips for legibility, and a
 * focus/hover mode that lifts a node's neighborhood while the rest recedes.
 */
let colaRegistered = false;

export function BrainGraphCytoscape({ nodes, edges, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cytoscape core instance, dynamically imported
  const cyRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let cy: import("cytoscape").Core | null = null;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!colaRegistered) {
        const cola = (await import("cytoscape-cola")).default;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extension has no bundled types
        cytoscape.use(cola as any);
        colaRegistered = true;
      }
      if (cancelled || !containerRef.current) return;

      const palette = {
        accent: cssVar("--accent", "#c8a24a"),
        accentStrong: cssVar("--accent-strong", "#d8b65e"),
        ok: cssVar("--ok", "#7fb89a"),
        muted: cssVar("--text-muted", "#86868e"),
        ivory: cssVar("--text-primary", "#f1ede2"),
        secondary: cssVar("--text-secondary", "#b9b9c0"),
        edge: cssVar("--border-strong", "#3a3a42"),
        chip: cssVar("--canvas-deep", "#101013"),
      };

      // Degree drives node size + label visibility, so the hub and well-connected
      // facts read as anchors and the long tail stays quiet.
      const degree = new Map<string, number>();
      for (const e of edges) {
        degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1);
        degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1);
      }
      const maxDeg = Math.max(1, ...degree.values());

      const tierColor = (n: BrainNode) =>
        n.kind === "arc" || n.kind === "hub"
          ? palette.accent
          : n.trustTier === "trusted"
            ? palette.ok
            : n.trustTier === "observed"
              ? palette.accent
              : palette.muted;

      const elements = [
        ...nodes.map((n) => {
          const isHub = n.kind === "arc" || n.kind === "hub";
          const deg = degree.get(n.id) ?? 0;
          const size = isHub ? 86 : 26 + (deg / maxDeg) * 42;
          return {
            data: {
              id: n.id,
              label: n.label,
              isHub: isHub ? 1 : 0,
              color: tierColor(n),
              size,
              // Show labels for the hub + connected nodes; isolated tails stay clean.
              showLabel: isHub || deg >= 1 ? n.label : "",
              proposed: n.trustTier === "proposed" ? 1 : 0,
            },
          };
        }),
        ...edges.map((e) => ({
          data: { id: e.id, source: e.fromNodeId, target: e.toNodeId },
        })),
      ];

      cy = cytoscape({
        container: containerRef.current,
        elements,
        minZoom: 0.25,
        maxZoom: 3,
        wheelSensitivity: 0.22,
        style: [
          {
            selector: "node",
            style: {
              width: "data(size)",
              height: "data(size)",
              "background-color": "data(color)",
              "background-opacity": 0.95,
              "border-width": 1.5,
              "border-color": palette.chip,
              "underlay-color": "data(color)",
              "underlay-opacity": 0.18,
              "underlay-padding": 5,
              "underlay-shape": "ellipse",
              label: "data(showLabel)",
              color: palette.secondary,
              "font-size": 11,
              "font-family": "var(--ff-body), system-ui, sans-serif",
              "font-weight": 500,
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 6,
              "text-max-width": "130px",
              "text-wrap": "ellipsis",
              "text-background-color": palette.chip,
              "text-background-opacity": 0.55,
              "text-background-padding": "3px",
              "text-background-shape": "roundrectangle",
              "min-zoomed-font-size": 6,
              "transition-property": "background-opacity, border-color, underlay-opacity, opacity, color",
              "transition-duration": 90,
            },
          },
          {
            selector: 'node[isHub = 1]',
            style: {
              "background-color": palette.accent,
              "border-width": 3,
              "border-color": palette.accentStrong,
              "underlay-opacity": 0.3,
              "underlay-padding": 10,
              color: palette.ivory,
              "font-size": 15,
              "font-weight": 700,
              "text-margin-y": 8,
              "z-index": 30,
            },
          },
          {
            selector: 'node[proposed = 1]',
            style: { "border-color": palette.muted, "border-style": "dashed", "background-opacity": 0.45, "underlay-opacity": 0.08 },
          },
          {
            selector: "edge",
            style: {
              width: 1,
              "line-color": palette.edge,
              "curve-style": "straight",
              opacity: 0.38,
              "transition-property": "opacity, line-color, width",
              "transition-duration": 90,
            },
          },
          // Selection focus (click) — persistent dim of everything else.
          { selector: "node.faded", style: { opacity: 0.1 } },
          { selector: "edge.faded", style: { opacity: 0.04 } },
          {
            selector: "node.focus",
            style: { "border-width": 3, "border-color": palette.accentStrong, "underlay-opacity": 0.4, "underlay-padding": 9, color: palette.ivory },
          },
          { selector: "node.neighbor", style: { "background-opacity": 1, color: palette.ivory } },
          { selector: "edge.lit", style: { "line-color": palette.accent, opacity: 0.8, width: 1.8 } },
          // Hover glow (transient) — layered on top of selection.
          { selector: "node.hglow", style: { "underlay-opacity": 0.42, "underlay-padding": 9, "border-color": palette.accentStrong, color: palette.ivory } },
          { selector: "node.hnbr", style: { "background-opacity": 1, color: palette.ivory } },
          { selector: "edge.hlit", style: { "line-color": palette.accent, opacity: 0.85, width: 1.8 } },
        ],
        layout: {
          name: "cola",
          // Continuous physics — like Obsidian: drag a node and the web springs
          // and settles. Never fully stops, so the graph feels alive and bouncy.
          infinite: true,
          fit: false,
          animate: true,
          centerGraph: true,
          randomize: false,
          handleDisconnected: true,
          avoidOverlap: true,
          nodeSpacing: () => 16,
          edgeLength: () => 132,
          maxSimulationTime: 4000,
          convergenceThreshold: 0.001,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cola options not in cytoscape's narrow layout typings
        } as any,
      });

      cyRef.current = cy;
      // Let the physics spread the web, then frame it once (infinite layout keeps running).
      cy.ready(() => {
        setTimeout(() => cy && !cy.destroyed() && cy.animate({ fit: { eles: cy.elements(), padding: 48 }, duration: 420, easing: "ease-out" }), 700);
      });

      cy.on("tap", "node", (evt) => onSelect(evt.target.id()));
      cy.on("tap", (evt) => {
        if (evt.target === cy) onSelect(null);
      });

      // Obsidian-style hover: lift the hovered node's neighborhood transiently.
      cy.on("mouseover", "node", (evt) => {
        const n = evt.target;
        n.addClass("hglow");
        n.connectedEdges().addClass("hlit");
        n.neighborhood().nodes().addClass("hnbr");
        if (containerRef.current) containerRef.current.style.cursor = "pointer";
      });
      cy.on("mouseout", "node", (evt) => {
        const n = evt.target;
        n.removeClass("hglow");
        n.connectedEdges().removeClass("hlit");
        n.neighborhood().nodes().removeClass("hnbr");
        if (containerRef.current) containerRef.current.style.cursor = "default";
      });
    })();

    return () => {
      cancelled = true;
      cy?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Focus mode: dim everything but the selected node's neighborhood.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("faded focus neighbor lit");
      if (!selectedId) return;
      const node = cy.getElementById(selectedId);
      if (node.empty()) return;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass("faded");
      node.addClass("focus");
      neighborhood.nodes().not(node).addClass("neighbor");
      node.connectedEdges().addClass("lit");
    });
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Knowledge graph" role="img" />;
}
