"use client";

import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/** Mark's ambient silk backdrop — the 21st.dev `MeshGradient` shader, recolored
 *  to Signal (obsidian with a warm gold glint) instead of the demo's silver.
 *  Sits behind the chat; a soft scrim keeps message text readable. WebGL canvas,
 *  frozen (speed 0) under prefers-reduced-motion. */
export function MarkBackdrop() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#101013", "#1a1a1e", "#2a2a31", "#b88a2e"]}
        distortion={0.85}
        swirl={0.6}
        speed={reduced ? 0 : 0.3}
      />
      {/* Readability scrim: warm vignette toward the canvas tone so the silk reads
          as atmosphere, not noise, behind the message column. */}
      <div className="absolute inset-0 bg-[radial-gradient(130%_90%_at_50%_28%,transparent,var(--canvas)_88%)]" />
      <div className="absolute inset-0 bg-[var(--canvas)] opacity-30" />
    </div>
  );
}
