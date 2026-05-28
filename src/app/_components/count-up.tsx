"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CountUpProps = {
  // A raw number (animated directly) OR a string like "$182,400", "26.8%",
  // "18m" — the leading numeric portion is parsed, animated, and re-rendered
  // with the original prefix/suffix preserved.
  value: number | string;
  durationMs?: number;
  className?: string;
};

type Parsed = {
  prefix: string;
  numeric: number;
  suffix: string;
  decimals: number;
  withCommas: boolean;
};

function parseValue(value: number | string): Parsed | null {
  if (typeof value === "number") {
    return { prefix: "", numeric: value, suffix: "", decimals: 0, withCommas: true };
  }
  const match = value.match(/^([^\d.-]*)([-+]?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const [, prefix, numericStr, suffix] = match;
  const numeric = parseFloat(numericStr.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const decimals = numericStr.includes(".") ? numericStr.split(".")[1].length : 0;
  const withCommas = numericStr.includes(",");
  return { prefix, numeric, suffix, decimals, withCommas };
}

function format(n: number, decimals: number, withCommas: boolean): string {
  if (withCommas) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return n.toFixed(decimals);
}

export function CountUp({ value, durationMs = 900, className }: CountUpProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const target = parsed?.numeric ?? 0;
  const [current, setCurrent] = useState(target);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!parsed) return;
    let raf = 0;

    if (startedRef.current) {
      raf = requestAnimationFrame(() => setCurrent(target));
      return () => cancelAnimationFrame(raf);
    }
    startedRef.current = true;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      raf = requestAnimationFrame(() => setCurrent(target));
      return () => cancelAnimationFrame(raf);
    }

    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCurrent(target * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame((now) => {
      setCurrent(0);
      step(now);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, parsed]);

  if (!parsed) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={className}>
      {parsed.prefix}
      {format(current, parsed.decimals, parsed.withCommas)}
      {parsed.suffix}
    </span>
  );
}
