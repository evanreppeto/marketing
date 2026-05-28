"use client";

import { useEffect, useRef, useState } from "react";

type CountUpProps = {
  value: number;
  durationMs?: number;
  className?: string;
};

// Animates from 0 to `value` once when the component mounts, then settles.
// Respects prefers-reduced-motion by jumping straight to the final value.
export function CountUp({ value, durationMs = 900, className }: CountUpProps) {
  const [current, setCurrent] = useState(value);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      setCurrent(value);
      return;
    }
    startedRef.current = true;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setCurrent(value);
      return;
    }

    setCurrent(0);
    const start = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(value * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={className}>{current.toLocaleString()}</span>;
}
