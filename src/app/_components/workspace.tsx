import Link from "next/link";

import { StatusPill, buttonClasses } from "./page-header";

type Tone = "amber" | "green" | "red" | "blue" | "gray" | "dark";

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
  statusTone?: Tone;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <header className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="grid min-h-[190px] lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="relative px-5 py-5 sm:px-6 sm:py-6">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,oklch(0.74_0.115_232/0.16),transparent_34%),linear-gradient(135deg,oklch(0.98_0.01_240/0.045),transparent_52%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">{eyebrow}</span>
              {status ? <StatusPill tone={statusTone}>{status}</StatusPill> : null}
            </div>
            <h1 className="mt-5 max-w-4xl text-[clamp(2rem,4vw,4.3rem)] font-black leading-[0.94] tracking-[-0.055em] text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-4 max-w-[68ch] text-base leading-7 text-[var(--text-secondary)]">{description}</p>
            {primary || secondary ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {primary ? (
                  <Link className={buttonClasses({ variant: "primary" })} href={primary.href}>
                    {primary.label}
                  </Link>
                ) : null}
                {secondary ? (
                  <Link className={buttonClasses({ variant: "ghost" })} href={secondary.href}>
                    {secondary.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5 lg:border-l lg:border-t-0">
          <div className="signal-eyebrow">Operating rule</div>
          <div className="mt-5 space-y-3">
            {[
              ["Human gate", "On"],
              ["Outbound", "Locked"],
              ["Source", "Supabase"],
            ].map(([label, value]) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5" key={label}>
                <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
                <span className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </header>
  );
}

export function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: React.ReactNode; detail?: string; tone?: Tone; href?: string }>;
}) {
  return (
    <section className="module-rise mb-5 grid overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{metric.label}</div>
              {metric.tone ? <span className={`h-2 w-2 rounded-full ${dotClass(metric.tone)}`} /> : null}
            </div>
            <div className="mt-3 font-display text-3xl font-black tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</div>
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
    <section className={`signal-panel module-rise overflow-hidden ${className}`}>
      {title || eyebrow || description || aside ? (
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow ? <div className="signal-eyebrow">{eyebrow}</div> : null}
            {title ? <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">{title}</h2> : null}
            {description ? <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
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
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.label}</dt>
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
    <div className="m-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-8">
      <div className="max-w-xl">
        <div className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

function dotClass(tone: Tone) {
  if (tone === "green") return "bg-[var(--ok)]";
  if (tone === "amber") return "bg-[var(--warn)]";
  if (tone === "red") return "bg-[var(--priority)]";
  if (tone === "blue" || tone === "dark") return "bg-[var(--accent)]";
  return "bg-[var(--text-muted)]";
}
