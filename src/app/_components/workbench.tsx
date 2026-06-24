import { Command } from "lucide-react";

import { cx } from "./theme";
import { WorkbenchTopBar } from "./workbench-top-bar";

export function WorkbenchFrame({
  actions,
  aside,
  children,
  description,
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
      <WorkbenchTopBar actions={actions} />

      <header className="mb-4 border-b border-[var(--border-hairline)] pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="font-editorial text-[clamp(1.9rem,2.9vw,2.6rem)] font-medium leading-[1.03] tracking-[-0.02em] text-[var(--text-primary)]">
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
      <div className="truncate text-[11px] font-medium text-[var(--text-muted)]">{label}</div>
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
