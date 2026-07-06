"use client";

import React, { useId, type CSSProperties } from "react";

// Adapted + performance-tuned for this codebase:
// - mask + noise self-hosted under /public/effects (no Framer CDN at runtime)
// - the demo <h1> is removed; pass your own content via `children`
// - PERF: the original animated an SVG displacement filter (feTurbulence +
//   feDisplacementMap) via a JS/SMIL loop — that recomputes an expensive filter
//   every frame and janks. Here the haze is a masked, soft-blurred shape (a
//   static, cacheable layer) and only its `transform` animates, so the GPU
//   composites it cheaply. Smooth + dynamic, no per-frame filter recompute.
//   Intentionally always animates (does not honor prefers-reduced-motion) — it's
//   an opt-in brand background the product owner asked to keep moving.

interface AnimationConfig {
  scale: number;
  speed: number;
}

interface NoiseConfig {
  opacity: number;
  scale: number;
}

interface EtherealShadowProps {
  sizing?: "fill" | "stretch";
  color?: string;
  animation?: AnimationConfig;
  noise?: NoiseConfig;
  style?: CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
  if (fromLow === fromHigh) return toLow;
  const percentage = (value - fromLow) / (fromHigh - fromLow);
  return toLow + percentage * (toHigh - toLow);
}

const useInstanceId = (): string => {
  const id = useId();
  return `shadowoverlay-${id.replace(/:/g, "")}`;
};

const MASK_URL = "/effects/ethereal-mask.png";
const NOISE_URL = "/effects/ethereal-noise.png";

export function EtherealShadow({
  sizing = "fill",
  color = "rgba(128, 128, 128, 1)",
  animation,
  noise,
  style,
  className,
  children,
}: EtherealShadowProps) {
  const id = useInstanceId();
  const animationEnabled = !!animation && animation.scale > 0;
  // scale → softness (blur); speed → drift loop time (seconds).
  const blurPx = animation ? mapRange(animation.scale, 1, 100, 6, 22) : 8;
  const driftDuration = animation ? mapRange(animation.speed, 1, 100, 34, 14) : 22;
  const driftKeyframes = `ethereal-drift-${id}`;

  return (
    <div
      className={className}
      style={{ overflow: "hidden", position: "relative", width: "100%", height: "100%", ...style }}
    >
      {animationEnabled && (
        <style>{`
@keyframes ${driftKeyframes} {
  0%   { transform: translate3d(-3%, 2%, 0) scale(1.08) rotate(0deg); }
  25%  { transform: translate3d(3%, -3%, 0) scale(1.26) rotate(90deg); }
  50%  { transform: translate3d(5%, 2%, 0) scale(1.12) rotate(180deg); }
  75%  { transform: translate3d(-2%, 4%, 0) scale(1.24) rotate(270deg); }
  100% { transform: translate3d(-3%, 2%, 0) scale(1.08) rotate(360deg); }
}
`}</style>
      )}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          filter: `blur(${blurPx}px)`,
          animation: animationEnabled ? `${driftKeyframes} ${driftDuration}s linear infinite` : undefined,
          willChange: animationEnabled ? "transform" : undefined,
        }}
      >
        <div
          style={{
            backgroundColor: color,
            maskImage: `url('${MASK_URL}')`,
            WebkitMaskImage: `url('${MASK_URL}')`,
            maskSize: sizing === "stretch" ? "100% 100%" : "cover",
            WebkitMaskSize: sizing === "stretch" ? "100% 100%" : "cover",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {noise && noise.opacity > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${NOISE_URL}")`,
            backgroundSize: noise.scale * 200,
            backgroundRepeat: "repeat",
            opacity: noise.opacity / 2,
          }}
        />
      )}

      {children != null && <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>{children}</div>}
    </div>
  );
}

export default EtherealShadow;
