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

// ── Small colour helpers so each node can render as a lit orb (radial gradient)
//    rather than a flat disc — the single biggest lift toward a premium feel.
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
/** Blend toward white by `amt` (0–1). */
function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
/** Blend toward black by `amt` (0–1). */
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
/** Mix two hex colours, `t` toward `b`. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * Interactive knowledge graph rendered with Cytoscape, tuned to feel like
 * Obsidian's graph view: a force web that settles in on load, draggable nodes,
 * gold "glow" underlays, labels that ride on small chips for legibility, and a
 * focus/hover mode that lifts a node's neighborhood while the rest recedes.
 */
let fcoseRegistered = false;

export function BrainGraphCytoscape({ nodes, edges, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cytoscape core instance, dynamically imported
  const cyRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let cy: import("cytoscape").Core | null = null;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!fcoseRegistered) {
        const fcose = (await import("cytoscape-fcose")).default;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extension has no bundled types
        cytoscape.use(fcose as any);
        fcoseRegistered = true;
      }
      if (cancelled || !containerRef.current) return;

      const accent = cssVar("--accent", "#c8a24a");
      const chip = cssVar("--canvas-deep", "#101013");
      const palette = {
        accent,
        accentStrong: cssVar("--accent-strong", "#d8b65e"),
        // A touch deeper/less minty than --ok so the orb gradient supplies the light.
        ok: mix(cssVar("--ok", "#7fb89a"), "#5d8270", 0.22),
        muted: mix(cssVar("--text-muted", "#86868e"), chip, 0.18),
        ivory: cssVar("--text-primary", "#f1ede2"),
        secondary: cssVar("--text-secondary", "#b9b9c0"),
        // Warm edge tone (gold pulled toward canvas) — cohesive with obsidian+gold,
        // not the cold grey of a default force graph. Kept bright enough to read.
        edge: mix(accent, chip, 0.42),
        chip,
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
          const size = isHub ? 76 : 24 + (deg / maxDeg) * 40;
          const base = tierColor(n);
          // Lit-orb gradient: bright crown → base → shaded rim, for depth.
          const grad = `${lighten(base, isHub ? 0.5 : 0.42)} ${base} ${darken(base, 0.26)}`;
          return {
            data: {
              id: n.id,
              label: n.label,
              isHub: isHub ? 1 : 0,
              color: base,
              grad,
              ring: darken(base, 0.42),
              size,
              // Labels are hidden by default and revealed on hover / selection
              // (Obsidian behaviour) so the resting web reads calm, not crowded.
              // Only the hub keeps a permanent label as the anchor.
              showLabel: isHub ? n.label : "",
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
        // Don't hijack the mouse wheel — the page should scroll normally over the
        // graph. Users still drag the background to pan and drag nodes to arrange.
        userZoomingEnabled: false,
        style: [
          {
            selector: "node",
            style: {
              width: "data(size)",
              height: "data(size)",
              // Lit-orb: radial gradient gives each node real depth vs. a flat disc.
              "background-color": "data(color)",
              "background-fill": "radial-gradient",
              "background-gradient-stop-colors": "data(grad)",
              "background-gradient-stop-positions": "0 52 100",
              "background-opacity": 1,
              // A thin, colour-matched rim (not a hard black outline) reads refined.
              "border-width": 1,
              "border-color": "data(ring)",
              "border-opacity": 0.9,
              // Soft outer bloom — a calm Obsidian-style halo around every node.
              "underlay-color": "data(color)",
              "underlay-opacity": 0.14,
              "underlay-padding": 10,
              "underlay-shape": "ellipse",
              label: "data(showLabel)",
              color: palette.secondary,
              "font-size": 11,
              "font-family": "var(--ff-body), system-ui, sans-serif",
              "font-weight": 500,
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 7,
              "text-max-width": "132px",
              "text-wrap": "ellipsis",
              // Clean label legibility via a soft ink outline instead of a boxed chip.
              "text-outline-color": palette.chip,
              "text-outline-width": 3,
              "text-outline-opacity": 0.85,
              "min-zoomed-font-size": 7,
              "transition-property": "background-opacity, border-color, underlay-opacity, opacity, color",
              "transition-duration": 140,
            },
          },
          {
            selector: 'node[isHub = 1]',
            style: {
              // Focal hub: a brighter gold ring + a wider warm bloom anchors the web.
              "border-width": 2.5,
              "border-color": palette.accentStrong,
              "border-opacity": 1,
              "underlay-color": palette.accent,
              "underlay-opacity": 0.3,
              "underlay-padding": 20,
              color: palette.ivory,
              "font-size": 15,
              "font-weight": 700,
              "text-margin-y": 10,
              "z-index": 30,
            },
          },
          {
            selector: 'node[proposed = 1]',
            style: { "border-color": palette.muted, "border-style": "dashed", "background-opacity": 0.4, "underlay-opacity": 0.06 },
          },
          {
            selector: "edge",
            style: {
              width: 1,
              "line-color": palette.edge,
              // Gentle curve gives the web an organic, premium settle (vs. rigid spokes).
              "curve-style": "bezier",
              "control-point-step-size": 30,
              // Visible quiet threads at rest; selection/hover lights them gold.
              opacity: 0.5,
              "transition-property": "opacity, line-color, width",
              "transition-duration": 140,
            },
          },
          // Selection focus (click) — gently recede everything else so the selected
          // fact's neighborhood reads as a lit constellation, but the whole web
          // stays visible (no blacking-out).
          { selector: "node.faded", style: { opacity: 0.32 } },
          { selector: "edge.faded", style: { opacity: 0.14 } },
          {
            selector: "node.focus",
            style: { "border-width": 3, "border-color": palette.accentStrong, "underlay-opacity": 0.46, "underlay-padding": 13, color: palette.ivory, label: "data(label)" },
          },
          { selector: "node.neighbor", style: { "background-opacity": 1, color: palette.ivory, label: "data(label)" } },
          { selector: "edge.lit", style: { "line-color": palette.accent, opacity: 0.85, width: 2 } },
          // Hover glow (transient) — layered on top of selection; reveals labels.
          { selector: "node.hglow", style: { "underlay-opacity": 0.46, "underlay-padding": 13, "border-color": palette.accentStrong, color: palette.ivory, label: "data(label)" } },
          { selector: "node.hnbr", style: { "background-opacity": 1, color: palette.ivory, label: "data(label)" } },
          { selector: "edge.hlit", style: { "line-color": palette.accent, opacity: 0.88, width: 2 } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gradient stop-colors via data() mapper aren't in cytoscape's narrow style typings
        ] as any,
        layout: {
          // fCoSE — the high-quality force layout professional graph products use.
          // It untangles dense, cross-linked graphs into well-separated clusters
          // with far fewer crossings than a plain force sim, then rests (no bounce).
          name: "fcose",
          quality: "proof",
          randomize: true,
          animate: true,
          animationDuration: 700,
          animationEasing: "ease-out",
          fit: false,
          padding: 60,
          nodeDimensionsIncludeLabels: false,
          uniformNodeDimensions: false,
          packComponents: true,
          // Strong repulsion + generous edge length spread the hub's spokes and
          // the persona chain into legible arcs instead of a knot.
          nodeRepulsion: 9000,
          idealEdgeLength: 125,
          edgeElasticity: 0.4,
          nestingFactor: 0.1,
          gravity: 0.28,
          gravityRange: 3.6,
          numIter: 2600,
          tile: true,
          tilingPaddingVertical: 24,
          tilingPaddingHorizontal: 24,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fcose options not in cytoscape's narrow layout typings
        } as any,
      });

      cyRef.current = cy;
      // Frame the web once it settles (and a safety fit shortly after, in case the
      // layout converges before emitting layoutstop).
      const frame = () => cy && !cy.destroyed() && cy.animate({ fit: { eles: cy.elements(), padding: 52 }, duration: 480, easing: "ease-out" });
      cy.one("layoutstop", () => setTimeout(frame, 60));
      cy.ready(() => setTimeout(frame, 1400));

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
