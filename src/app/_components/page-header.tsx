import Link from "next/link";

import { cx, theme, type ButtonSize, type ButtonVariant, type ThemeTone } from "./theme";

/**
 * Canonical button styling. Use `<Button>` for real buttons, or
 * `buttonClasses({...})` on a `<Link>` / form-bound element so the visual
 * language stays identical everywhere. Replaces the per-page inline strings.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cx(theme.button.base, theme.button.sizes[size], theme.button.variants[variant], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ComponentPropsWithoutRef<"button">) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={theme.control.backLink}>
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 5 7 10l5 5" />
        <path d="M8 10h8" />
      </svg>
      Back to {label}
    </Link>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function PageHeader({ eyebrow, title, description, aside, backHref, backLabel }: PageHeaderProps) {
  return (
    <header className={theme.surface.pageHeader}>
      <div aria-hidden="true" className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-[var(--accent-border-strong)] via-[var(--border-hairline)] to-transparent sm:inset-x-5" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-[76ch]">
          {backHref ? <BackLink href={backHref} label={backLabel ?? "back"} /> : null}
          {eyebrow ? <div className={cx("mb-2", theme.text.eyebrow)}>{eyebrow}</div> : null}
          <h1 className="font-serif text-[clamp(1.75rem,2.6vw,2.45rem)] font-semibold leading-[1.02] tracking-[-0.018em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description ? (
            <p className={cx("mt-2 max-w-[72ch] text-[0.95rem] leading-7", theme.text.body)}>{description}</p>
          ) : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1.5 lg:justify-end">{aside}</div> : null}
      </div>
    </header>
  );
}

type StatTone = "neutral" | "accent" | "ok" | "amber" | "red";

const STAT_VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-[var(--text-primary)]",
  accent: "text-[var(--accent-contrast)]",
  ok: "text-[var(--ok-text)]",
  amber: "text-[var(--warn-text)]",
  red: "text-[var(--priority-text)]",
};

export type StatItem = {
  label: string;
  value: React.ReactNode;
  /** Small caption under the value, e.g. "vs last 30d" or a unit. */
  hint?: React.ReactNode;
  /** Trend chip on the right of the value, e.g. "+12%". */
  delta?: string;
  deltaTone?: "ok" | "amber" | "red" | "neutral";
  /** Tints the value to signal status without shouting. */
  tone?: StatTone;
  /** Optional inline glyph (small svg) shown before the label. */
  icon?: React.ReactNode;
  /** Optional sparkline — pass a normalized 0–1 series for a tiny inline chart. */
  spark?: number[];
};

function Sparkline({ points, tone = "accent" }: { points: number[]; tone?: StatTone }) {
  if (points.length < 2) return null;
  const w = 64;
  const h = 20;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stroke =
    tone === "ok" ? "var(--ok)" : tone === "red" ? "var(--priority)" : tone === "amber" ? "var(--warn)" : "var(--accent)";
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 3) - 1.5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className="h-5 w-16 shrink-0" preserveAspectRatio="none" fill="none">
      <path d={d} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/**
 * KPI card used in the stat rows across the product (Campaigns, Activity, CRM,
 * Analytics, Board). Reads like a quiet frontend for a database metric: label,
 * a confident number, and an optional trend chip / sparkline.
 */
export function StatCard({ label, value, hint, delta, deltaTone = "neutral", tone = "neutral", icon, spark }: StatItem) {
  const deltaClass =
    deltaTone === "ok"
      ? "text-[var(--ok-text)]"
      : deltaTone === "amber"
        ? "text-[var(--warn-text)]"
        : deltaTone === "red"
          ? "text-[var(--priority-text)]"
          : "text-[var(--text-muted)]";
  return (
    <div className="min-w-0 border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-panel)_82%,var(--canvas))] px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        {icon ? <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : null}
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className={cx("font-display text-[1.55rem] font-semibold leading-none tracking-[-0.02em]", STAT_VALUE_TONE[tone])}>
          {value}
        </div>
        {spark ? <Sparkline points={spark} tone={tone === "neutral" ? "accent" : tone} /> : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {hint ? <span className="truncate text-[11px] text-[var(--text-muted)]">{hint}</span> : <span />}
        {delta ? <span className={cx("shrink-0 text-[11px] font-semibold tabular-nums", deltaClass)}>{delta}</span> : null}
      </div>
    </div>
  );
}

/** Responsive KPI row. Defaults to an auto-fit grid so 4–6 stats lay out cleanly. */
export function StatStrip({
  items,
  className = "",
  columns,
}: {
  items: StatItem[];
  className?: string;
  /** Force a fixed column count at lg; otherwise auto-fits ~190px cards. */
  columns?: number;
}) {
  const style = {
    gridTemplateColumns: columns
      ? "repeat(auto-fit, minmax(min(170px, 100%), 1fr))"
      : "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
  };
  return (
    <div className={cx("module-rise mb-5 grid gap-3", className)} style={style}>
      {items.map((item, i) => (
        <StatCard key={`${item.label}-${i}`} {...item} />
      ))}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  ...sectionProps
}: {
  children: React.ReactNode;
  className?: string;
} & React.ComponentPropsWithoutRef<"section">) {
  return (
    <section {...sectionProps} className={cx(theme.surface.panel, "min-w-0 p-4", className)}>
      {children}
    </section>
  );
}

export function OperatorBar({
  task,
  detail,
  status = "Active",
  primary,
  secondary,
}: {
  task: string;
  detail: string;
  status?: string;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className={cx(theme.surface.inset, "module-rise mb-4 rounded-lg border px-4 py-3.5 [animation-delay:40ms]")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={theme.text.eyebrow}>Operator task</span>
            <StatusPill tone="gray">{status}</StatusPill>
          </div>
          <div className="mt-1.5 font-semibold text-[var(--text-primary)]">{task}</div>
          <p className={cx("mt-1 max-w-[74ch]", theme.text.body)}>{detail}</p>
        </div>
        {primary || secondary ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {secondary}
            {primary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ActionFeedback({
  action,
  messages,
}: {
  action?: string;
  messages: Record<string, string>;
}) {
  if (!action) return null;

  return (
    <div className="module-rise mb-4 rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-contrast)] [animation-delay:60ms]">
      <span>
        <span className="font-semibold text-[var(--text-primary)]">Update: </span>
        {messages[action] ?? "Action recorded."}
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx(theme.surface.dashedEmpty, "p-6 text-center sm:text-left")}>
      <div className="font-display text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</div>
      <p className={cx("mx-auto mt-2 max-w-[58ch] sm:mx-0", theme.text.body)}>{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "gray",
  icon,
  style,
  className = "",
}: {
  children: React.ReactNode;
  tone?: ThemeTone;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      style={style}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold tracking-[0.01em]",
        theme.pill[tone],
        className,
      )}
    >
      {icon ? <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span> : null}
      {children}
    </span>
  );
}
