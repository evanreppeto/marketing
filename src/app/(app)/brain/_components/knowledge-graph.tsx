"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type GraphNode = {
  id: string;
  kind: string;
  kindLabel: string;
  kindColor: string;
  label: string;
  summary: string;
  tier: string;
  confidence: number | null;
  source: string;
  learnedBy: string;
};
export type GraphEdge = { from: string; to: string; rel: string };

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number; anchored?: boolean; ax?: number; ay?: number; el?: SVGGElement };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function kindGroup(k: string): string {
  return k.startsWith("crm_") ? "crm" : k;
}
function tierClass(t: string): string {
  const s = (t || "").toLowerCase();
  return s === "trusted" || s === "core" ? "trusted" : s === "proposed" ? "proposed" : "observed";
}

export function KnowledgeGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const api = useRef<{ select: (id: string) => void; filter: (k: string) => void; search: (q: string) => void; zoom: (z: string) => void } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState("all");

  const nmap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) { d.set(e.from, (d.get(e.from) ?? 0) + 1); d.set(e.to, (d.get(e.to) ?? 0) + 1); }
    return d;
  }, [edges]);

  // Kind chips present in the data (plus a grouped CRM chip when relevant).
  const kindChips = useMemo(() => {
    const seen = new Map<string, { key: string; label: string }>();
    for (const n of nodes) {
      const g = kindGroup(n.kind);
      if (!seen.has(g)) seen.set(g, { key: g, label: g === "crm" ? "CRM" : n.kindLabel });
    }
    return [...seen.values()];
  }, [nodes]);
  const legend = useMemo(() => {
    const seen = new Map<string, { color: string; label: string }>();
    for (const n of nodes) if (!seen.has(n.kind)) seen.set(n.kind, { color: n.kindColor, label: n.kindLabel });
    return [...seen.values()];
  }, [nodes]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || nodes.length === 0) return;

    const N: SimNode[] = nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
    const M = new Map(N.map((n) => [n.id, n]));
    const E = edges.filter((e) => M.has(e.from) && M.has(e.to));
    const maxDeg = Math.max(1, ...N.map((n) => degree.get(n.id) ?? 0));
    const nodeR = (n: SimNode) => (n.kind === "arc" ? 22 : 8 + ((degree.get(n.id) ?? 0) / maxDeg) * 12);

    // ── motion feel — weighty drag, springy settle, eases to rest (tune these) ──
    const DAMP = 0.9, COOL = 0.96, FREEZE = 0.01;   // node damping (higher = jigglier) · cooling · stop threshold
    const CENTER_PULL = 0.0022;                     // gentle homing — composed, but no snap back to origin
    const THROW = 0.85, THROW_MAX = 22;             // drag momentum carried on release (glide, not dead-stop)
    const ANCHOR = 0.14;                            // a dropped node remembers where you left it
    const CX = 430, CY = 300;

    let gview: SVGGElement;
    let edgeEls: SVGLineElement[] = [];
    const pan = { x: 0, y: 0, z: 1 };
    let dragNode: SimNode | null = null;
    let isPanning = false;
    let lastView: DOMPoint | null = null;
    let alpha = 0;
    let rafId: number | null = null;

    N.forEach((n, i) => { const a = i * 2.3998277, rr = 26 + i * 8.5; n.x = CX + Math.cos(a) * rr; n.y = CY + Math.sin(a) * rr; });

    const eh = E.map((_, i) => `<line class="gedge" data-i="${i}"/>`).join("");
    const nh = N.map((n) => {
      const r = nodeR(n), c = n.kindColor || "#7f8694", hub = n.kind === "arc";
      const dash = tierClass(n.tier) === "proposed" ? ' stroke-dasharray="3 2"' : "";
      return `<g class="gnode${hub ? " hub" : ""}" data-id="${esc(n.id)}" data-kind="${esc(n.kind)}">`
        + (hub ? `<circle class="hubring" r="${(r + 7).toFixed(1)}" fill="none" stroke="${c}" stroke-width="1" opacity="0.3"/>` : "")
        + `<circle r="${r.toFixed(1)}" fill="${c}2e" stroke="${c}" stroke-width="1.6"${dash}/>`
        + (hub ? `<text class="hublbl" y="3.5" text-anchor="middle" fill="${c}" font-size="9" font-weight="600">ARC</text>` : "")
        + `<text class="nlbl" y="${(r + 10).toFixed(1)}" text-anchor="middle">${esc(n.label)}</text></g>`;
    }).join("");
    svgEl.innerHTML = `<g class="gview">${eh}${nh}</g>`;
    gview = svgEl.querySelector(".gview") as SVGGElement;
    edgeEls = E.map((_, i) => gview.querySelector(`.gedge[data-i="${i}"]`) as SVGLineElement);
    N.forEach((n) => { n.el = gview.querySelector(`.gnode[data-id="${CSS.escape(n.id)}"]`) as SVGGElement; });

    const tick = (k = 1, cool = 1) => {
      const F = N.map(() => ({ fx: 0, fy: 0 }));
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        const a = N[i], b = N[j]; let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy; if (d2 < 144) d2 = 144;
        const d = Math.sqrt(d2), f = 5200 / d2; F[i].fx += dx / d * f; F[i].fy += dy / d * f; F[j].fx -= dx / d * f; F[j].fy -= dy / d * f;
      }
      E.forEach((e) => { const a = M.get(e.from)!, b = M.get(e.to)!; const ia = N.indexOf(a), ib = N.indexOf(b); const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; const diff = (d - 84) / d * 0.03; F[ia].fx += dx * diff; F[ia].fy += dy * diff; F[ib].fx -= dx * diff; F[ib].fy -= dy * diff; });
      N.forEach((a, i) => { const w = a.kind === "arc" ? 0.02 : CENTER_PULL; F[i].fx += (CX - a.x) * w; F[i].fy += (CY - a.y) * w; if (a.anchored) { F[i].fx += ((a.ax ?? a.x) - a.x) * ANCHOR; F[i].fy += ((a.ay ?? a.y) - a.y) * ANCHOR; } });
      N.forEach((a, i) => { if (a === dragNode) return; a.vx = (a.vx + F[i].fx * cool) * DAMP; a.vy = (a.vy + F[i].fy * cool) * DAMP; a.x += a.vx * k; a.y += a.vy * k; if (!isFinite(a.x) || !isFinite(a.y)) { a.x = CX; a.y = CY; a.vx = 0; a.vy = 0; } a.x = Math.max(28, Math.min(832, a.x)); a.y = Math.max(26, Math.min(574, a.y)); });
    };
    const render = () => {
      gview.setAttribute("transform", `translate(${pan.x.toFixed(2)},${pan.y.toFixed(2)}) scale(${pan.z.toFixed(3)})`);
      edgeEls.forEach((l, i) => { const a = M.get(E[i].from)!, b = M.get(E[i].to)!; l.setAttribute("x1", a.x.toFixed(1)); l.setAttribute("y1", a.y.toFixed(1)); l.setAttribute("x2", b.x.toFixed(1)); l.setAttribute("y2", b.y.toFixed(1)); });
      N.forEach((n) => n.el!.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
    };
    const fitLayout = () => {
      const xs = N.map((n) => n.x), ys = N.map((n) => n.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1;
      const tx0 = 66, tx1 = 794, ty0 = 52, ty1 = 548;
      const s = Math.min((tx1 - tx0) / bw, (ty1 - ty0) / bh);
      const ox = (tx0 + tx1) / 2 - (minX + maxX) / 2 * s, oy = (ty0 + ty1) / 2 - (minY + maxY) / 2 * s;
      N.forEach((n) => { n.x = n.x * s + ox; n.y = n.y * s + oy; n.vx = 0; n.vy = 0; });
    };
    for (let s = 0; s < 460; s++) tick(0.5); // pre-settle the layout (kept modest to avoid blocking mount)
    fitLayout();
    N.forEach((n) => { if (n.kind === "arc" || (degree.get(n.id) ?? 0) >= 5) n.el!.classList.add("major"); });
    render();

    const loop = () => {
      try { if (dragNode && alpha < 0.55) alpha = 0.55; tick(0.65, alpha); render(); } catch { /* never let one bad frame kill the sim */ }
      alpha *= COOL;
      rafId = alpha > FREEZE || dragNode ? requestAnimationFrame(loop) : null;
    };
    const reheat = () => { if (alpha < 0.6) alpha = 0.6; if (rafId === null) rafId = requestAnimationFrame(loop); };

    const clientToView = (e: { clientX: number; clientY: number }) => { const p = svgEl.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svgEl.getScreenCTM()!.inverse()); };
    const clientToGraph = (e: { clientX: number; clientY: number }) => { const m = gview.getScreenCTM(); if (!m) return null; const p = svgEl.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m.inverse()); };
    const zoomAround = (vx: number, vy: number, f: number) => { const nz = Math.max(0.45, Math.min(3, pan.z * f)); f = nz / pan.z; pan.x = vx - f * (vx - pan.x); pan.y = vy - f * (vy - pan.y); pan.z = nz; render(); };

    const neighbors = (id: string) => { const s = new Set<string>(); E.forEach((e) => { if (e.from === id) s.add(e.to); if (e.to === id) s.add(e.from); }); return s; };
    const clearHi = () => { N.forEach((n) => n.el!.classList.remove("dim", "lit")); edgeEls.forEach((l) => l.classList.remove("hot", "dim")); };
    const spotlight = (id: string) => { const nb = neighbors(id); nb.add(id); N.forEach((n) => { const on = nb.has(n.id); n.el!.classList.toggle("dim", !on); n.el!.classList.toggle("lit", on); }); edgeEls.forEach((l, i) => { const hot = E[i].from === id || E[i].to === id; l.classList.toggle("hot", hot); l.classList.toggle("dim", !hot); }); };
    const select = (id: string) => { N.forEach((n) => n.el!.classList.toggle("sel", n.id === id)); setSelectedId(id); };
    const search = (q: string) => { q = (q || "").trim().toLowerCase(); if (!q) { clearHi(); return; } const hit: Record<string, boolean> = {}; N.forEach((n) => { const m = `${n.label} ${n.summary} ${n.kindLabel}`.toLowerCase().includes(q); hit[n.id] = m; n.el!.classList.toggle("dim", !m); n.el!.classList.toggle("lit", m); }); edgeEls.forEach((l, i) => { const on = hit[E[i].from] || hit[E[i].to]; l.classList.remove("hot"); l.classList.toggle("dim", !on); }); };
    const filter = (k: string) => { N.forEach((n) => { const on = k === "all" || kindGroup(n.kind) === k; n.el!.classList.toggle("dim", !on); n.el!.classList.toggle("lit", on && k !== "all"); }); edgeEls.forEach((l) => l.classList.toggle("dim", k !== "all")); };

    api.current = { select, filter, search, zoom: (z) => { if (z === "fit") { pan.x = 0; pan.y = 0; pan.z = 1; render(); } else zoomAround(360, 270, z === "in" ? 1.2 : 0.83); } };

    N.forEach((n) => {
      n.el!.addEventListener("mousedown", (ev) => { ev.stopPropagation(); dragNode = n; select(n.id); reheat(); });
      n.el!.addEventListener("mouseenter", () => { if (!dragNode) spotlight(n.id); });
      n.el!.addEventListener("mouseleave", () => { if (!dragNode) clearHi(); });
    });
    const onSvgDown = (ev: MouseEvent) => { if ((ev.target as Element).closest(".gnode")) return; isPanning = true; svgEl.classList.add("panning"); lastView = clientToView(ev); };
    const onMove = (ev: MouseEvent) => {
      if (dragNode) { const p = clientToGraph(ev); if (p) { dragNode.vx = p.x - dragNode.x; dragNode.vy = p.y - dragNode.y; dragNode.x = p.x; dragNode.y = p.y; reheat(); render(); } }
      else if (isPanning && lastView) { const v = clientToView(ev); pan.x += v.x - lastView.x; pan.y += v.y - lastView.y; lastView = v; render(); }
    };
    const onUp = () => {
      if (dragNode) { dragNode.anchored = true; dragNode.ax = dragNode.x; dragNode.ay = dragNode.y; const m = Math.hypot(dragNode.vx, dragNode.vy) || 1, s = Math.min(THROW, THROW_MAX / m); dragNode.vx *= s; dragNode.vy *= s; reheat(); }
      dragNode = null; isPanning = false; svgEl.classList.remove("panning");
    };
    const onWheel = (ev: WheelEvent) => { ev.preventDefault(); const v = clientToView(ev); zoomAround(v.x, v.y, ev.deltaY < 0 ? 1.12 : 0.89); };
    svgEl.addEventListener("mousedown", onSvgDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    svgEl.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      svgEl.removeEventListener("wheel", onWheel);
      svgEl.removeEventListener("mousedown", onSvgDown);
      api.current = null;
    };
  }, [nodes, edges, degree]);

  const selected = selectedId ? nmap.get(selectedId) : null;
  const connections = useMemo(() => {
    if (!selectedId) return [];
    return edges
      .filter((e) => e.from === selectedId || e.to === selectedId)
      .map((e) => ({ rel: e.rel, other: nmap.get(e.from === selectedId ? e.to : e.from) }))
      .filter((c) => c.other);
  }, [selectedId, edges, nmap]);

  return (
    <div className="web">
      <div className="graphwrap">
        <div className="graphtools">
          <span className="gsearch">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <input placeholder="Find a node…" onChange={(e) => api.current?.search(e.target.value)} />
          </span>
          <button type="button" className={`gchip${activeKind === "all" ? " on" : ""}`} onClick={() => { setActiveKind("all"); api.current?.filter("all"); }}>All</button>
          {kindChips.map((k) => (
            <button type="button" key={k.key} className={`gchip${activeKind === k.key ? " on" : ""}`} onClick={() => { setActiveKind(k.key); api.current?.filter(k.key); }}>{k.label}</button>
          ))}
        </div>
        <svg ref={svgRef} className="gsvg" viewBox="0 0 860 600" preserveAspectRatio="xMidYMid meet" />
        <div className="glegend">
          {legend.map((l) => <span className="lg" key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}
        </div>
        <div className="ghint">drag nodes · scroll to zoom · drag canvas to pan</div>
        <div className="gzoom">
          <button type="button" onClick={() => api.current?.zoom("in")} title="Zoom in">+</button>
          <button type="button" onClick={() => api.current?.zoom("out")} title="Zoom out">−</button>
          <button type="button" onClick={() => api.current?.zoom("fit")} title="Reset view">⤢</button>
        </div>
      </div>
      <aside className="inspector">
        {!selected ? (
          <div className="inempty">Select a node to see what Arc knows and how it&apos;s connected.</div>
        ) : (
          <>
            <div className="inh"><span className="ik" style={{ background: selected.kindColor }} /><span className="ikl">{selected.kindLabel}</span></div>
            <div className="innm">{selected.label}</div>
            {selected.summary && <div className="insum">{selected.summary}</div>}
            <div className="inrow"><span className="il">Trust</span><span className="iv"><span className={`tier ${tierClass(selected.tier)}`}><span className="td" />{selected.tier}</span></span></div>
            {selected.confidence !== null && (
              <div className="inrow"><span className="il">Confidence</span><span className="iv"><span className="conf"><span className="cbar"><i style={{ width: `${selected.confidence}%` }} /></span>{selected.confidence}%</span></span></div>
            )}
            <div className="inrow"><span className="il">Learned by</span><span className="iv">{selected.learnedBy}</span></div>
            <div className="inrow"><span className="il">Source</span><span className="iv" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)" }}>{selected.source || "—"}</span></div>
            <div className="insec">Connections · {connections.length}</div>
            {connections.map((c, i) => (
              <button type="button" className="conn" key={i} onClick={() => api.current?.select(c.other!.id)}>
                <span className="cd" style={{ background: c.other!.kindColor }} />
                <span className="crel">{c.rel.replace(/_/g, " ")}</span>
                <span className="cnm">{c.other!.label}</span>
              </button>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
