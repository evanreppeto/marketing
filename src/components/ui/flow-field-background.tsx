"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type FlowFieldBackgroundProps = {
  className?: string;
  color?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
  interactive?: boolean;
};

type ParticleState = {
  age: number;
  life: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const FALLBACK_ACCENT = "#c8a24a";
const FALLBACK_CANVAS = "#16161a";

function resolveToken(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexToRgb(value: string) {
  const hex = value.replace("#", "").trim();
  if (hex.length !== 6) return null;

  const parsed = Number.parseInt(hex, 16);
  if (Number.isNaN(parsed)) return null;

  return {
    b: parsed & 255,
    g: (parsed >> 8) & 255,
    r: (parsed >> 16) & 255,
  };
}

function alphaFill(color: string, alpha: number) {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(22, 22, 26, ${alpha})`;
}

export default function FlowFieldBackground({
  className,
  color,
  trailOpacity = 0.16,
  particleCount = 320,
  speed = 0.68,
  interactive = false,
}: FlowFieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const prefersReducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "reduced";

    const particleColor = color ?? resolveToken("--accent", FALLBACK_ACCENT);
    const canvasColor = resolveToken("--canvas", FALLBACK_CANVAS);
    const fadeFill = alphaFill(canvasColor, trailOpacity);
    const initialFill = alphaFill(canvasColor, 0.96);
    const particleTotal = prefersReducedMotion ? Math.min(140, particleCount) : particleCount;

    let width = 1;
    let height = 1;
    let animationFrameId = 0;
    let particles: ParticleState[] = [];
    const mouse = { x: -1000, y: -1000 };

    const resetParticle = (particle: ParticleState) => {
      particle.x = Math.random() * width;
      particle.y = Math.random() * height;
      particle.vx = 0;
      particle.vy = 0;
      particle.age = 0;
      particle.life = Math.random() * 220 + 120;
    };

    const createParticle = (): ParticleState => {
      const particle = { age: 0, life: 0, vx: 0, vy: 0, x: 0, y: 0 };
      resetParticle(particle);
      return particle;
    };

    const sizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = initialFill;
      context.fillRect(0, 0, width, height);

      particles = Array.from({ length: particleTotal }, createParticle);
    };

    const updateParticle = (particle: ParticleState) => {
      const angle =
        Math.cos(particle.x * 0.0042 + particle.y * 0.0014) * Math.PI +
        Math.sin(particle.y * 0.0048) * 0.58;

      particle.vx += Math.cos(angle) * 0.16 * speed;
      particle.vy += Math.sin(angle) * 0.16 * speed;

      if (interactive) {
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.hypot(dx, dy);
        const interactionRadius = 160;

        if (distance < interactionRadius) {
          const force = (interactionRadius - distance) / interactionRadius;
          particle.vx -= dx * force * 0.035;
          particle.vy -= dy * force * 0.035;
        }
      }

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.955;
      particle.vy *= 0.955;
      particle.age += 1;

      if (particle.age > particle.life) resetParticle(particle);
      if (particle.x < 0) particle.x = width;
      if (particle.x > width) particle.x = 0;
      if (particle.y < 0) particle.y = height;
      if (particle.y > height) particle.y = 0;
    };

    const drawParticle = (particle: ParticleState) => {
      const alpha = 1 - Math.abs(particle.age / particle.life - 0.5) * 2;
      context.globalAlpha = Math.max(0.06, alpha * 0.34);
      context.fillStyle = particleColor;
      context.fillRect(particle.x, particle.y, 1.35, 1.35);
    };

    const renderFrame = () => {
      context.globalAlpha = 1;
      context.fillStyle = fadeFill;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        if (!prefersReducedMotion) updateParticle(particle);
        drawParticle(particle);
      }

      context.globalAlpha = 1;
    };

    const animate = () => {
      renderFrame();
      animationFrameId = window.requestAnimationFrame(animate);
    };

    const stop = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    };

    const start = () => {
      if (!animationFrameId) animate();
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else if (!prefersReducedMotion) start();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const resizeObserver = new ResizeObserver(sizeCanvas);
    resizeObserver.observe(container);
    sizeCanvas();

    if (prefersReducedMotion) {
      renderFrame();
    } else {
      document.addEventListener("visibilitychange", handleVisibility);
      start();
    }

    if (interactive) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      stop();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [color, interactive, particleCount, speed, trailOpacity]);

  return (
    <div ref={containerRef} aria-hidden className={cn("relative h-full w-full overflow-hidden bg-[var(--canvas)]", className)}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
