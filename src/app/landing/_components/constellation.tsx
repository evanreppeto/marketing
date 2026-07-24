"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  bright: boolean;
  phase: number;
};

const NODE_COUNT = 44;
const LINK_DIST = 0.17; // as a fraction of canvas diagonal

// Seeded PRNG so the field renders the same on every visit (and stays
// deterministic for tests/screenshots).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNodes(): Node[] {
  const rand = mulberry32(20260723);
  return Array.from({ length: NODE_COUNT }, () => ({
    x: rand(),
    y: rand(),
    vx: (rand() - 0.5) * 0.012,
    vy: (rand() - 0.5) * 0.012,
    r: 1.1 + rand() * 1.7,
    bright: rand() > 0.82,
    phase: rand() * Math.PI * 2,
  }));
}

// The floating persona-intelligence chips that anchor the abstract field to
// what it actually powers.
const CHIPS = [
  { label: "Persona match", value: "0.86", top: "16%", left: "58%", delay: 0.15 },
  { label: "Stage", value: "Nurture", top: "56%", left: "12%", delay: 0.3 },
  { label: "Next best action", value: "Seasonal checklist", top: "74%", left: "52%", delay: 0.45 },
];

// A live gold constellation: nodes drift slowly, hairline links form and fade
// with proximity, bright nodes breathe. Canvas pauses offscreen; reduced motion
// gets the pre-rendered Higgsfield still instead.
export function Constellation() {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = makeNodes();
    let raf = 0;
    let running = false;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { width: w, height: h } = canvas;
      const diag = Math.hypot(w, h);
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.x = (n.x + n.vx * dt + 1) % 1;
        n.y = (n.y + n.vy * dt + 1) % 1;
        n.phase += dt * 0.9;
      }

      // Links first, under the nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const d = Math.hypot(dx, dy);
          const max = diag * LINK_DIST;
          if (d < max) {
            const alpha = (1 - d / max) * 0.28;
            ctx.strokeStyle = `rgba(200, 162, 74, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const breathe = n.bright ? 0.65 + 0.35 * Math.sin(n.phase) : 1;
        const r = n.r * (window.devicePixelRatio > 1 ? 2 : 1) * breathe;
        if (n.bright) {
          const glow = ctx.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, r * 6);
          glow.addColorStop(0, "rgba(241, 237, 226, 0.5)");
          glow.addColorStop(1, "rgba(241, 237, 226, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x * w, n.y * h, r * 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(241, 237, 226, 0.95)";
        } else {
          ctx.fillStyle = "rgba(200, 162, 74, 0.8)";
        }
        ctx.beginPath();
        ctx.arc(n.x * w, n.y * h, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    // Only animate while on screen.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [reduced]);

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-[color:var(--border-panel)] bg-[#101014]">
      {/* Soft top-light so the field has depth, echoing the Higgsfield still */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 35% 0%, rgba(200,162,74,0.10) 0%, rgba(16,16,20,0) 55%)",
        }}
        aria-hidden
      />
      {reduced ? (
        <img
          src="/brand/landing/intelligence-constellation.jpg"
          alt="A constellation of gold nodes connected by fine threads"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      )}

      {CHIPS.map((chip) => (
        <motion.div
          key={chip.label}
          className="absolute"
          style={{ top: chip.top, left: chip.left }}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: chip.delay, duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <motion.div
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 6 + chip.delay * 4, repeat: Infinity, ease: "easeInOut" }}
            className="flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-panel)_82%,transparent)] py-1.5 pl-2.5 pr-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            <span className="font-[family-name:var(--font-mono)] text-[0.65rem] text-[var(--text-muted)]">
              {chip.label}
            </span>
            <span className="text-[0.72rem] font-semibold text-[var(--text-primary)]">{chip.value}</span>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
