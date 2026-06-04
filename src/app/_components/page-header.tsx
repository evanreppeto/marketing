type ButtonVariant = "primary" | "priority" | "ghost" | "approve" | "decline" | "archive" | "revision";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-px focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // md meets the 44px touch target; sm is for dense inline toolbars
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-xs",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_0_0_oklch(0.74_0.115_232/0)] hover:bg-[var(--accent-strong)] hover:shadow-[0_0_22px_oklch(0.74_0.115_232/0.34)]",
  priority: "bg-[var(--priority-solid)] text-[var(--on-priority)] shadow-[0_0_0_0_oklch(0.68_0.2_26/0)] hover:bg-[oklch(0.5_0.2_26)] hover:shadow-[0_0_22px_oklch(0.68_0.2_26/0.32)]",
  ghost:
    "border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] shadow-[0_0_0_0_oklch(0.74_0.115_232/0)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--chicago-blue-soft)] hover:shadow-[0_0_18px_oklch(0.74_0.115_232/0.22)]",
  approve:
    "border border-[oklch(0.78_0.14_158/0.55)] bg-[oklch(0.72_0.15_158)] text-[oklch(0.14_0.025_160)] shadow-[0_0_0_0_oklch(0.78_0.14_158/0)] hover:bg-[oklch(0.78_0.16_158)] hover:shadow-[0_0_20px_oklch(0.78_0.14_158/0.3)]",
  decline:
    "border border-[oklch(0.68_0.2_26/0.58)] bg-[oklch(0.56_0.18_26)] text-[oklch(0.98_0.01_26)] shadow-[0_0_0_0_oklch(0.68_0.2_26/0)] hover:bg-[oklch(0.62_0.2_26)] hover:shadow-[0_0_20px_oklch(0.68_0.2_26/0.28)]",
  archive:
    "border border-[oklch(0.62_0.055_245/0.52)] bg-[oklch(0.38_0.045_245)] text-[oklch(0.94_0.015_245)] shadow-[0_0_0_0_oklch(0.62_0.055_245/0)] hover:bg-[oklch(0.44_0.055_245)] hover:shadow-[0_0_18px_oklch(0.62_0.055_245/0.24)]",
  revision:
    "border border-[oklch(0.82_0.13_85/0.58)] bg-[oklch(0.66_0.14_76)] text-[oklch(0.16_0.025_72)] shadow-[0_0_0_0_oklch(0.82_0.13_85/0)] hover:bg-[oklch(0.74_0.15_76)] hover:shadow-[0_0_20px_oklch(0.82_0.13_85/0.26)]",
};

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
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`.trim();
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

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="module-rise relative mb-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-5 shadow-[var(--elev-panel)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-[65%_center] opacity-45"
        style={{ backgroundImage: "url('/brand/signal-command-header.png')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,var(--surface-panel)_0%,oklch(0.16_0.04_250/0.9)_46%,oklch(0.11_0.03_250/0.62)_100%)]"
      />
      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-full">
          <p className="flex items-center gap-2.5 signal-eyebrow">
            <span aria-hidden="true" className="h-2.5 w-0.5 rounded-full bg-[var(--accent)]" />
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[clamp(1.65rem,3vw,2.25rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
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
    <section {...sectionProps} className={`signal-panel min-w-0 p-4 ${className}`}>
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
    <div className="signal-inset module-rise mb-4 rounded-lg border px-4 py-3.5 [animation-delay:40ms]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="signal-eyebrow">Operator task</span>
            <StatusPill tone="gray">{status}</StatusPill>
          </div>
          <div className="mt-1.5 font-semibold text-[var(--text-primary)]">{task}</div>
          <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
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
    <div className="module-rise mb-4 rounded-lg border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--chicago-blue-soft)] [animation-delay:60ms]">
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
    <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-center sm:text-left">
      <div className="font-display text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</div>
      <p className="mx-auto mt-2 max-w-[58ch] text-sm leading-6 text-[var(--text-secondary)] sm:mx-0">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const PILL_TONES = {
  amber: "text-[oklch(0.9_0.09_85)] border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)]",
  green: "text-[oklch(0.88_0.1_158)] border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)]",
  red: "text-[oklch(0.86_0.09_26)] border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.16)]",
  gray: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
  blue: "text-[var(--chicago-blue-soft)] border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)]",
  dark: "text-[oklch(0.18_0.03_248)] border-transparent bg-[var(--accent)]",
} as const;

export function StatusPill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: keyof typeof PILL_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-bold tracking-[0.01em] ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
