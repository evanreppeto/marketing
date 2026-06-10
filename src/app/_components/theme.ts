export type ThemeTone = "amber" | "green" | "red" | "blue" | "gray" | "dark";
export type ButtonVariant = "primary" | "priority" | "ghost" | "approve" | "decline" | "archive" | "revision";
export type ButtonSize = "sm" | "md";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const theme = {
  shell: {
    canvas:
      "chicago-dark min-h-screen w-full overflow-x-hidden bg-[var(--canvas)] text-[var(--text-primary)] lg:h-screen lg:overflow-hidden",
    layout: "min-h-screen lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]",
    sidebar:
      "border-b border-[var(--border-panel)] bg-[var(--surface-sidebar)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5",
    content: "min-w-0 px-4 py-4 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10",
    overlay: "fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm",
  },
  surface: {
    panel: "signal-panel",
    inset: "signal-inset",
    soft: "signal-soft",
    media: "bg-[var(--media-void)]",
    pageHeader:
      "module-rise relative mb-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-5 shadow-[var(--elev-panel)]",
    workspaceHeader:
      "module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]",
    workspacePanel: "signal-panel module-rise overflow-hidden",
    operatorCard:
      "overflow-hidden rounded-2xl border border-[var(--accent-border)] bg-[var(--surface-operator)] shadow-[var(--elev-panel)]",
    divider: "border-[var(--border-hairline)]",
    dashedEmpty: "rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)]",
  },
  text: {
    eyebrow: "signal-eyebrow",
    title: "font-display font-bold tracking-[-0.04em] text-[var(--text-primary)]",
    titleCompact: "font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]",
    body: "text-sm leading-6 text-[var(--text-secondary)]",
    muted: "text-[var(--text-muted)]",
    accent: "text-[var(--accent)]",
    priority: "text-[var(--priority-bright)]",
    onAccent: "text-[var(--on-accent)]",
    onPriority: "text-[var(--on-priority)]",
  },
  control: {
    focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
    input:
      "min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
    tabBase: "rounded-lg border px-4 py-3 transition duration-200 active:translate-y-px",
    tabActive: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]",
    tabIdle:
      "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
    cardInteractive:
      "transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
    kbd: "rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono",
    tabBadge: "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)]",
    backLink:
      "mb-3 inline-flex min-h-9 items-center gap-2 self-start rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]",
  },
  button: {
    base:
      "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold transition duration-200 ease-out active:translate-y-px focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      md: "min-h-11 px-4 text-sm",
      sm: "min-h-9 px-3 text-xs",
    } satisfies Record<ButtonSize, string>,
    variants: {
      primary: "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)]",
      priority: "bg-[var(--priority-solid)] text-[var(--on-priority)] hover:bg-[var(--priority-hover)]",
      ghost:
        "border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)]",
      approve: "border border-[var(--ok-border)] bg-[var(--ok-solid)] text-[var(--on-ok)] hover:bg-[var(--ok-hover)]",
      decline:
        "border border-[var(--priority-border)] bg-[var(--priority-solid)] text-[var(--on-priority)] hover:bg-[var(--priority-bright)]",
      archive:
        "border border-[var(--neutral-border)] bg-[var(--neutral-solid)] text-[var(--neutral-on)] hover:bg-[var(--neutral-hover)]",
      revision: "border border-[var(--warn-border)] bg-[var(--warn-solid)] text-[var(--on-warn)] hover:bg-[var(--warn-hover)]",
    } satisfies Record<ButtonVariant, string>,
  },
  pill: {
    amber: "text-[var(--warn-text)] border-[var(--warn-border-soft)] bg-[var(--warn-soft)]",
    green: "text-[var(--ok-text)] border-[var(--ok-border-soft)] bg-[var(--ok-soft)]",
    red: "text-[var(--priority-text)] border-[var(--priority-border-soft)] bg-[var(--priority-soft)]",
    gray: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
    blue: "text-[var(--accent-contrast)] border-[var(--accent-border-strong)] bg-[var(--accent-soft)]",
    dark: "text-[var(--on-accent)] border-transparent bg-[var(--accent)]",
  } satisfies Record<ThemeTone, string>,
};

export function toneLabel(tone: ThemeTone) {
  if (tone === "green") return "Clear";
  if (tone === "amber") return "Watch";
  if (tone === "red") return "Risk";
  if (tone === "blue" || tone === "dark") return "Live";
  return "Info";
}

export function toneTextClass(tone: ThemeTone) {
  if (tone === "green") return "text-[var(--ok)]";
  if (tone === "amber") return "text-[var(--warn)]";
  if (tone === "red") return "text-[var(--priority-bright)]";
  if (tone === "blue" || tone === "dark") return "text-[var(--accent)]";
  return "text-[var(--text-muted)]";
}
