"use client";

import { useEffect, useState } from "react";

export type ChartTheme = {
  accent: string;
  ok: string;
  warn: string;
  priority: string;
  textPrimary: string;
  textMuted: string;
  grid: string;
  surface: string;
};

/** Fallbacks match globals.css :root (gold theme) so SSR/first paint is sane before resolution. */
const FALLBACK: ChartTheme = {
  accent: "#c8a24a",
  ok: "#7fb89a",
  warn: "#d8b65e",
  priority: "#cc6666",
  textPrimary: "#f1ede2",
  textMuted: "#86868e",
  grid: "#2c2c33",
  surface: "#202027",
};

function read(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/** Resolves live CSS tokens to concrete colors so Recharts (which needs real color strings) tracks the active theme. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme({
      accent: read("--accent", FALLBACK.accent),
      ok: read("--ok", FALLBACK.ok),
      warn: read("--warn", FALLBACK.warn),
      priority: read("--priority", FALLBACK.priority),
      textPrimary: read("--text-primary", FALLBACK.textPrimary),
      textMuted: read("--text-muted", FALLBACK.textMuted),
      grid: read("--border-hairline", FALLBACK.grid),
      surface: read("--surface-inset", FALLBACK.surface),
    });
  }, []);

  return theme;
}
