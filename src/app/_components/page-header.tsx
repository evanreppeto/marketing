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
  eyebrow: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function PageHeader({ eyebrow, title, description, aside, backHref, backLabel }: PageHeaderProps) {
  return (
    <header className={theme.surface.pageHeader}>
      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-full">
          {backHref ? <BackLink href={backHref} label={backLabel ?? "back"} /> : null}
          <p className={cx("flex items-center gap-2.5", theme.text.eyebrow)}>
            <span aria-hidden="true" className="h-2.5 w-0.5 rounded-full bg-[var(--accent)]" />
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[clamp(1.65rem,3vw,2.25rem)] font-bold leading-[1.06] tracking-[-0.03em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description ? (
            <p className={cx("mt-2 max-w-[62ch]", theme.text.body)}>{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </header>
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
}: {
  children: React.ReactNode;
  tone?: ThemeTone;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em]",
        theme.pill[tone],
      )}
    >
      {icon ? <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span> : null}
      {children}
    </span>
  );
}
