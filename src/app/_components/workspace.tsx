import Link from "next/link";

import { PageHeader, StatusPill, buttonClasses } from "./page-header";
import { cx, theme, toneLabel, toneTextClass, type ThemeTone } from "./theme";

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  statusTone = "blue",
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  statusTone?: ThemeTone;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {status ? <StatusPill tone={statusTone}>{status}</StatusPill> : null}
          {secondary ? (
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={secondary.href}>
              {secondary.label}
            </Link>
          ) : null}
          {primary ? (
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={primary.href}>
              {primary.label}
            </Link>
          ) : null}
        </div>
      }
    />
  );
}

export function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: React.ReactNode; detail?: string; tone?: ThemeTone; href?: string }>;
}) {
  return (
    <section className="module-rise mb-5 grid overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-[var(--text-muted)]">{metric.label}</div>
              {metric.tone ? <span className={cx("text-[10px] font-medium", toneTextClass(metric.tone))}>{toneLabel(metric.tone)}</span> : null}
            </div>
            <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</div>
            {metric.detail ? <div className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{metric.detail}</div> : null}
          </>
        );

        return metric.href ? (
          <Link className="border-b border-r border-[var(--border-hairline)] p-4 transition hover:bg-[var(--surface-inset)]" href={metric.href} key={metric.label}>
            {body}
          </Link>
        ) : (
          <div className="border-b border-r border-[var(--border-hairline)] p-4" key={metric.label}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

export function WorkspacePanel({
  title,
  eyebrow,
  description,
  aside,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(theme.surface.workspacePanel, className)}>
      {title || eyebrow || description || aside ? (
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {eyebrow ? <div className={theme.text.eyebrow}>{eyebrow}</div> : null}
              {title ? <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2> : null}
            </div>
            {description ? <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function DetailStack({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="divide-y divide-[var(--border-hairline)]">
      {items.map((item) => (
        <div className="grid gap-3 px-5 py-3 sm:grid-cols-[150px_minmax(0,1fr)]" key={item.label}>
          <dt className="text-xs font-medium text-[var(--text-muted)]">{item.label}</dt>
          <dd className="min-w-0 text-sm font-medium leading-6 text-[var(--text-primary)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyWorkspace({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx("m-4 p-6 sm:p-8", theme.surface.dashedEmpty)}>
      <div className="relative flex max-w-2xl gap-4">
        <span className="mt-0.5 h-10 w-px shrink-0 rounded-full bg-[linear-gradient(180deg,var(--accent),color-mix(in_srgb,var(--accent)_18%,transparent))]" />
        <div className="min-w-0">
          <div className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
          {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
