import { Bell, Command, Plus, Search, SlidersHorizontal } from "lucide-react";

import { cx } from "./theme";

export function WorkbenchFrame({
  actions,
  aside,
  children,
  description,
  eyebrow,
  tabs,
  title,
}: {
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  tabs?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <div className="min-h-full min-w-0">
      <div className="mb-5 hidden min-h-12 items-center gap-3 rounded-[12px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-sidebar)_76%,transparent)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl lg:flex">
        <div className="flex min-w-[15rem] items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <SlidersHorizontal aria-hidden className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
          <span>Growth ops workspace</span>
        </div>
        <div className="flex h-8 min-w-[18rem] flex-1 items-center gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_72%,transparent)] px-3 text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <Search aria-hidden className="h-4 w-4" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate text-sm">Arc command</span>
          <span className="rounded border border-[var(--border-hairline)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">Ctrl K</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
          {!actions ? (
            <button
              aria-label="New"
              className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-contrast)] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] active:scale-[0.98]"
              type="button"
            >
              <Plus aria-hidden className="h-4 w-4" strokeWidth={1.7} />
            </button>
          ) : null}
          <button
            aria-label="Notifications"
            className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[var(--text-primary)] active:scale-[0.98]"
            type="button"
          >
            <Bell aria-hidden className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <header className="mb-4 border-b border-[var(--border-hairline)] pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            {eyebrow ? <div className="signal-eyebrow mb-2">{eyebrow}</div> : null}
            <h1 className="font-display text-[clamp(1.85rem,2.2vw,2.45rem)] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-[82ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:hidden">{actions}</div> : null}
        </div>
        {tabs ? <div className="mt-5">{tabs}</div> : null}
      </header>
      <div className={cx("grid min-w-0 gap-4", aside ? "xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px]" : "")}>
        <div className="min-w-0">{children}</div>
        {aside ? <aside className="min-w-0">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function MetricBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(9.5rem,100%),1fr))] overflow-hidden rounded-[10px] border border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--surface-panel)_84%,var(--canvas))] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),var(--elev-panel)]">
      {children}
    </section>
  );
}

export function MetricCell({
  delta,
  label,
  tone = "neutral",
  value,
}: {
  delta?: React.ReactNode;
  label: React.ReactNode;
  tone?: "neutral" | "accent" | "ok" | "risk";
  value: React.ReactNode;
}) {
  const valueClass =
    tone === "ok"
      ? "text-[var(--ok-text)]"
      : tone === "risk"
        ? "text-[var(--priority-text)]"
        : tone === "accent"
          ? "text-[var(--accent-contrast)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="min-w-0 border-b border-r border-[var(--border-hairline)] px-4 py-3 last:border-r-0 xl:border-b-0">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">{label}</div>
      <div className={cx("mt-1 font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]", valueClass)}>
        {value}
      </div>
      {delta ? <div className="mt-1 text-xs text-[var(--text-muted)]">{delta}</div> : null}
    </div>
  );
}

export function DossierPanel({ children, title }: { children: React.ReactNode; title: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--surface-panel)_88%,var(--canvas))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_24px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
      <div className="overflow-hidden rounded-[9px] border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_48%,transparent)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <Command aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.6} />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </section>
  );
}
