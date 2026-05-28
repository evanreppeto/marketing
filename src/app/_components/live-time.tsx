"use client";

import { useEffect, useState } from "react";

// Parse "Just now" / "Now" / "X min ago" / "X hr ago" into minutes elapsed.
// Returns null if the string doesn't match a known shape, in which case the
// component renders the raw text unchanged.
function parseAgoToMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (/^(now|just\s+now)$/i.test(trimmed)) return 0;
  const minMatch = trimmed.match(/^(\d+)\s*min(?:ute)?s?\s+ago$/i);
  if (minMatch) return parseInt(minMatch[1], 10);
  const hrMatch = trimmed.match(/^(\d+)\s*(?:hr|hour)s?\s+ago$/i);
  if (hrMatch) return parseInt(hrMatch[1], 10) * 60;
  return null;
}

function formatMinutesAgo(mins: number): string {
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}

function formatDuration(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0 ? `${hrs} hr` : `${hrs} hr ${remainder} min`;
}

type LiveTimeProps = {
  baseline: string;
  // When true, output reads as a duration ("2 min") rather than a
  // relative timestamp ("2 min ago"). Useful inside sentences like
  // "Waiting <LiveTime compact /> for a routing decision."
  compact?: boolean;
};

export function LiveTime({ baseline, compact = false }: LiveTimeProps) {
  const initialMinutes = parseAgoToMinutes(baseline);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (initialMinutes === null) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [initialMinutes]);

  if (initialMinutes === null) {
    return <>{baseline}</>;
  }

  const minutes = initialMinutes + Math.floor(elapsedMs / 60_000);
  return <>{compact ? formatDuration(minutes) : formatMinutesAgo(minutes)}</>;
}
