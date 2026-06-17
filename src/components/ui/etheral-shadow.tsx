"use client";

import React, { type CSSProperties, useId } from "react";

type ShadowOverlayProps = {
  color?: string;
  accentColor?: string;
  sizing?: "fill" | "stretch";
  animation?: {
    scale: number;
    speed: number;
  };
  noise?: {
    opacity: number;
    scale: number;
  };
  style?: CSSProperties;
  className?: string;
};

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number) {
  if (fromLow === fromHigh) return toLow;
  const percentage = (value - fromLow) / (fromHigh - fromLow);
  return toLow + percentage * (toHigh - toLow);
}

export function Component({
  color = "rgba(200, 162, 74, 0.54)",
  accentColor = "rgba(241, 237, 226, 0.18)",
  animation = { scale: 100, speed: 90 },
  noise = { opacity: 0.64, scale: 1.14 },
  style,
  className,
}: ShadowOverlayProps) {
  const reactId = useId();
  const id = `shadowoverlay-${reactId.replace(/:/g, "")}`;
  const displacementScale = mapRange(animation.scale, 1, 100, 18, 72);
  const duration = `${mapRange(animation.speed, 1, 100, 28, 10)}s`;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        isolation: "isolate",
        background:
          "radial-gradient(120% 120% at 18% 8%, rgba(241,237,226,0.1), transparent 34%), linear-gradient(145deg, #101013 0%, #1c1c21 54%, #0e0e10 100%)",
        ...style,
      }}
    >
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <filter id={id}>
            <feTurbulence
              baseFrequency={`${mapRange(animation.scale, 0, 100, 0.0025, 0.0007)},${mapRange(animation.scale, 0, 100, 0.006, 0.0022)}`}
              numOctaves="2"
              result="undulation"
              seed="3"
              type="turbulence"
            />
            <feDisplacementMap in="SourceGraphic" in2="undulation" result="output" scale={displacementScale} />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className="auth-shadow-field"
        style={
          {
            "--auth-shadow-filter": `url(#${id})`,
            "--auth-shadow-duration": duration,
            "--auth-shadow-color": color,
            "--auth-shadow-accent": accentColor,
            "--auth-shadow-inset": `-${displacementScale}px`,
          } as CSSProperties
        }
      />

      {noise.opacity > 0 ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[2] mix-blend-soft-light"
          style={{
            opacity: noise.opacity,
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.08) 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.055) 0 1px, transparent 1px)",
            backgroundSize: `${Math.max(90, noise.scale * 150)}px ${Math.max(90, noise.scale * 150)}px`,
          }}
        />
      ) : null}
    </div>
  );
}

export { Component as EtheralShadow };
