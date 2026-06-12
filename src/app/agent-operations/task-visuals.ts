import type { CSSProperties } from "react";

export type TaskVisualAppearance = {
  label: string;
  accent: string;
  soft: string;
  border: string;
  text: string;
};

export function statusAppearance(status: string): TaskVisualAppearance {
  if (status === "running") {
    return {
      label: "Working",
      accent: "oklch(0.72 0.13 235)",
      soft: "oklch(0.72 0.13 235 / 0.12)",
      border: "oklch(0.72 0.13 235 / 0.42)",
      text: "oklch(0.84 0.08 235)",
    };
  }
  if (status === "blocked") {
    return {
      label: "Blocked",
      accent: "oklch(0.70 0.16 25)",
      soft: "oklch(0.70 0.16 25 / 0.13)",
      border: "oklch(0.70 0.16 25 / 0.46)",
      text: "oklch(0.82 0.09 25)",
    };
  }
  if (status === "needs_approval") {
    return {
      label: "Review",
      accent: "oklch(0.78 0.13 80)",
      soft: "oklch(0.78 0.13 80 / 0.15)",
      border: "oklch(0.78 0.13 80 / 0.46)",
      text: "oklch(0.88 0.09 80)",
    };
  }
  if (status === "completed") {
    return {
      label: "Done",
      accent: "oklch(0.74 0.12 150)",
      soft: "oklch(0.74 0.12 150 / 0.12)",
      border: "oklch(0.74 0.12 150 / 0.42)",
      text: "oklch(0.84 0.08 150)",
    };
  }
  return {
    label: "Waiting",
    accent: "oklch(0.72 0.02 260)",
    soft: "oklch(0.72 0.02 260 / 0.10)",
    border: "oklch(0.72 0.02 260 / 0.30)",
    text: "oklch(0.82 0.02 260)",
  };
}

export function priorityAppearance(priority: string): TaskVisualAppearance {
  if (/urgent/i.test(priority)) {
    return {
      label: "Urgent",
      accent: "oklch(0.70 0.16 25)",
      soft: "oklch(0.70 0.16 25 / 0.13)",
      border: "oklch(0.70 0.16 25 / 0.46)",
      text: "oklch(0.84 0.09 25)",
    };
  }
  if (/high/i.test(priority)) {
    return {
      label: "High",
      accent: "oklch(0.78 0.13 80)",
      soft: "oklch(0.78 0.13 80 / 0.15)",
      border: "oklch(0.78 0.13 80 / 0.46)",
      text: "oklch(0.88 0.09 80)",
    };
  }
  if (/medium/i.test(priority)) {
    return {
      label: "Medium",
      accent: "oklch(0.72 0.13 235)",
      soft: "oklch(0.72 0.13 235 / 0.12)",
      border: "oklch(0.72 0.13 235 / 0.42)",
      text: "oklch(0.84 0.08 235)",
    };
  }
  return {
    label: "Low",
    accent: "oklch(0.72 0.02 260)",
    soft: "oklch(0.72 0.02 260 / 0.10)",
    border: "oklch(0.72 0.02 260 / 0.30)",
    text: "oklch(0.82 0.02 260)",
  };
}

export function badgeStyle(appearance: TaskVisualAppearance): CSSProperties {
  return {
    background: appearance.soft,
    borderColor: appearance.border,
    color: appearance.text,
  };
}

export function laneStyle(appearance: TaskVisualAppearance): CSSProperties {
  return {
    "--lane-accent": appearance.accent,
    "--lane-soft": appearance.soft,
    "--lane-border": appearance.border,
    "--lane-text": appearance.text,
  } as CSSProperties;
}
