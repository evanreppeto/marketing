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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
/** Blend toward black by `amt` (0–1) — used for a node's subtle rim. */
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}

// Category colours (flat, Obsidian-style) keyed by node kind. Restrained, cohesive.
const CATEGORY_COLOR: Record<string, string> = {
  brand_fact: "#c47055",
  service: "#5a90b8",
  persona: "#9a8fc4",
  proof_point: "#6faa84",
  campaign_ref: "#6a86bd",
  campaign: "#6a86bd",
  messaging_angle: "#ca9a50",
  objection: "#ca9a50",
  cta: "#cd7d54",
  channel: "#cd7d54",
  learning: "#5aa597",
  signal: "#bd6a58",
  segment: "#8d92a0",
};

/**
 * The marketing brain rendered like Obsidian's graph view: flat coloured dots on a
 * near-black canvas, faint grey links, a few anchor labels at rest with the rest
 * revealed on hover, and LIVE spring physics — fCoSE untangles the dense web into a
 * clean layout, then a continuous force sim (cola) keeps it alive so dragging a node
 * springs the whole web and it drifts gently at rest. Hover spotlights a node's
 * neighbourhood; selection lights the chosen fact without dimming the rest.
 */
let extsRegistered = false;

export function BrainGraphCytoscape({ nodes, edges, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cytoscape core instance, dynamically imported
  const cyRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let cy: import("cytoscape").Core | null = null;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!extsRegistered) {
        const fcose = (await import("cytoscape-fcose")).default;
        const cola = (await import("cytoscape-cola")).default;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensions ship no types
        cytoscape.use(fcose as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensions ship no types
        cytoscape.use(cola as any);
        extsRegistered = true;
      }
      if (cancelled || !containerRef.current) return;

      const accent = cssVar("--accent", "#c8a24a");
      const accentStrong = cssVar("--accent-strong", "#d8b65e");
      const ivory = cssVar("--text-primary", "#f1ede2");
      const labelRest = "#b3aea2";
      const edgeRest = "#41414c";
      const ink = "#0d0d10";

      const degree = new Map<string, number>();
      for (const e of edges) {
        degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1);
        degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1);
      }
      const maxDeg = Math.max(1, ...degree.values());

      const nodeColor = (n: BrainNode) =>
        n.kind === "arc" || n.kind === "hub" ? accentStrong : CATEGORY_COLOR[n.kind] ?? "#8d92a0";

      const elements = [
        ...nodes.map((n) => {
          const isHub = n.kind === "arc" || n.kind === "hub";
          const deg = degree.get(n.id) ?? 0;
          const sz = isHub ? 50 : 12 + (deg / maxDeg) * 30;
          const base = nodeColor(n);
          return {
            data: {
              id: n.id,
              label: n.label,
              isHub: isHub ? 1 : 0,
              base,
              ring: darken(base, 0.38),
              sz,
              szh: Math.round(sz * 1.28),
              // Anchor labels at rest: the hub + most-connected facts. The rest
              // appear on hover/selection so the resting web stays calm.
              showLabel: isHub || deg >= 6 ? n.label : "",
              proposed: n.trustTier === "proposed" ? 1 : 0,
            },
          };
        }),
        ...edges.map((e) => ({ data: { id: e.id, source: e.fromNodeId, target: e.toNodeId } })),
      ];

      cy = cytoscape({
        container: containerRef.current,
        elements,
        minZoom: 0.3,
        maxZoom: 2.5,
        // Scroll-to-zoom, but gentle (the default is jumpy). Pan by dragging the bg.
        userZoomingEnabled: true,
        wheelSensitivity: 0.15,
        style: [
          {
            selector: "node",
            style: {
              width: "data(sz)",
              height: "data(sz)",
              "background-color": "data(base)",
              "border-width": 1,
              "border-color": "data(ring)",
              label: "data(showLabel)",
              color: labelRest,
              "font-size": 10.5,
              "font-family": "system-ui, -apple-system, sans-serif",
              "font-weight": 500,
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 5,
              "text-max-width": "120px",
              "text-wrap": "ellipsis",
              "text-outline-color": ink,
              "text-outline-width": 3,
              "text-outline-opacity": 0.92,
              "min-zoomed-font-size": 6,
              "transition-property": "opacity, border-color, color, width, height",
              "transition-duration": 130,
            },
          },
          {
            selector: "node[isHub = 1]",
            style: { "border-width": 2, "border-color": accentStrong, color: ivory, "font-size": 14, "font-weight": 700, "text-margin-y": 8 },
          },
          { selector: "node[proposed = 1]", style: { "border-style": "dashed", "background-opacity": 0.5, "border-color": "#8d92a0" } },
          {
            selector: "edge",
            style: {
              width: 0.8,
              "line-color": edgeRest,
              "curve-style": "bezier",
              "control-point-step-size": 24,
              opacity: 0.42,
              "transition-property": "opacity, line-color, width",
              "transition-duration": 130,
            },
          },
          // Selection — light the chosen fact + its links, WITHOUT dimming the web.
          { selector: "node.focus", style: { "border-width": 2, "border-color": accentStrong, color: ivory, label: "data(label)", "z-index": 30 } },
          { selector: "node.neighbor", style: { color: ivory, label: "data(label)" } },
          { selector: "edge.lit", style: { "line-color": accent, opacity: 0.85, width: 1.4 } },
          // Hover — transient spotlight: grow the node, light its neighbourhood, recede the rest.
          { selector: "node.dim", style: { opacity: 0.2 } },
          { selector: "edge.dim", style: { opacity: 0.06 } },
          { selector: "node.hot", style: { width: "data(szh)", height: "data(szh)", "border-width": 2, "border-color": accentStrong, color: ivory, label: "data(label)", "z-index": 40 } },
          { selector: "node.near", style: { color: ivory, label: "data(label)" } },
          { selector: "edge.hlit", style: { "line-color": accent, opacity: 0.9, width: 1.5 } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gradient/extension style props aren't in cytoscape's narrow typings
        ] as any,
        layout: {
          // fCoSE seeds a clean, well-separated layout; cola (started on stop) keeps
          // it alive with springs.
          name: "fcose",
          quality: "proof",
          randomize: true,
          animate: true,
          animationDuration: 600,
          fit: false,
          padding: 50,
          nodeRepulsion: 11000,
          idealEdgeLength: 120,
          edgeElasticity: 0.4,
          gravity: 0.25,
          numIter: 2600,
          tile: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fcose options not in cytoscape's narrow layout typings
        } as any,
      });

      cyRef.current = cy;

      const frame = () => cy && !cy.destroyed() && cy.animate({ fit: { eles: cy.elements(), padding: 56 }, duration: 500, easing: "ease-out" });
      // Hand off to live spring physics once the clean layout settles.
      const startPhysics = () => {
        if (!cy || cy.destroyed()) return;
        cy.layout({
          name: "cola",
          infinite: true,
          fit: false,
          randomize: false,
          animate: true,
          handleDisconnected: true,
          avoidOverlap: true,
          nodeSpacing: () => 14,
          edgeLength: 120,
          convergenceThreshold: 0.001,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cola options not in cytoscape's narrow layout typings
        } as any).run();
      };
      cy.one("layoutstop", () => {
        setTimeout(frame, 40);
        setTimeout(startPhysics, 120);
      });
      cy.ready(() => setTimeout(frame, 1600));

      cy.on("tap", "node", (evt) => onSelect(evt.target.id()));
      cy.on("tap", (evt) => {
        if (evt.target === cy) onSelect(null);
      });

      cy.on("mouseover", "node", (evt) => {
        const n = evt.target;
        cy!.elements().addClass("dim");
        const nb = n.closedNeighborhood();
        nb.removeClass("dim");
        n.addClass("hot");
        nb.nodes().not(n).addClass("near");
        n.connectedEdges().removeClass("dim").addClass("hlit");
        if (containerRef.current) containerRef.current.style.cursor = "grab";
      });
      cy.on("mouseout", "node", () => {
        cy!.elements().removeClass("dim hot near hlit");
        if (containerRef.current) containerRef.current.style.cursor = "default";
      });
      cy.on("grab", "node", () => {
        if (containerRef.current) containerRef.current.style.cursor = "grabbing";
      });
    })();

    return () => {
      cancelled = true;
      cy?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Selection: light the chosen fact + its links. No dimming — the whole web stays visible.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("focus neighbor lit");
      if (!selectedId) return;
      const node = cy.getElementById(selectedId);
      if (node.empty()) return;
      node.addClass("focus");
      node.neighborhood().nodes().addClass("neighbor");
      node.connectedEdges().addClass("lit");
    });
  }, [selectedId]);

  const adjustZoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const cont = containerRef.current;
    const center = { x: (cont?.clientWidth ?? 0) / 2, y: (cont?.clientHeight ?? 0) / 2 };
    const level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    cy.zoom({ level, renderedPosition: center });
  };
  const fitAll = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.animate({ fit: { eles: cy.elements(), padding: 56 } }, { duration: 280, easing: "ease-out" });
  };

  const zoomBtn = "flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)]/85 text-[var(--text-secondary)] backdrop-blur transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] active:translate-y-px";

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Knowledge graph" role="img" />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => adjustZoom(1.25)} aria-label="Zoom in" className={zoomBtn}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M10 5v10M5 10h10" /></svg>
        </button>
        <button type="button" onClick={() => adjustZoom(0.8)} aria-label="Zoom out" className={zoomBtn}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 10h10" /></svg>
        </button>
        <button type="button" onClick={fitAll} aria-label="Fit graph to view" className={zoomBtn}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h3M16 7V4h-3M4 13v3h3M16 13v3h-3" /></svg>
        </button>
      </div>
    </div>
  );
}
