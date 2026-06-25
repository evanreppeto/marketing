import Link from "next/link";

import { cx } from "./theme";

/**
 * Small source / evidence chip — the citation cue used across Opportunities,
 * the Home focal card, Arc replies, and Brand facts. Optional leading index
 * (rendered as [n]) and an optional confidence read; links out when `href` is
 * set. Presentational and server-renderable (no hooks).
 */
export function EvidenceChip({
  index,
  label,
  confidence,
  href,
  className = "",
}: {
  /** Optional citation number, rendered as [n]. */
  index?: number;
  /** Source name, e.g. "NOAA" or "TechCrunch". */
  label: string;
  /** Optional 0–1 confidence; rendered as a percentage. */
  confidence?: number;
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      {typeof index === "number" ? (
        <span className="font-mono text-[10px] text-[var(--accent)]">[{index}]</span>
      ) : null}
      <span className="truncate">{label}</span>
      {typeof confidence === "number" ? (
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {Math.round(confidence * 100)}%
        </span>
      ) : null}
    </>
  );

  const classes = cx(
    "inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition",
    href ? "hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]" : "",
    className,
  );

  if (href) {
    const external = href.startsWith("http");
    return (
      <Link
        href={href}
        className={classes}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {inner}
      </Link>
    );
  }
  return <span className={classes}>{inner}</span>;
}
