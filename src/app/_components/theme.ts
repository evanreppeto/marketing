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
    title: "font-display font-black tracking-[-0.04em] text-[var(--text-primary)]",
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
      "min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
    tabBase: "rounded-lg border px-4 py-3 transition duration-200 hover:-translate-y-0.5 active:translate-y-px",
    tabActive: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[var(--accent-shadow)]",
    tabIdle:
      "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
    cardInteractive:
      "transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
    kbd: "rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono",
    tabBadge: "rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-contrast)]",
    backLink:
      "mb-3 inline-flex min-h-9 items-center gap-2 self-start rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]",
  },
  button: {
    base:
      "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-px focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
    sizes: {
      md: "min-h-11 px-4 text-sm",
      sm: "min-h-9 px-3 text-xs",
    } satisfies Record<ButtonSize, string>,
    variants: {
      primary:
        "bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_0_0_oklch(0.74_0.115_232/0)] hover:bg-[var(--accent-strong)] hover:shadow-[var(--accent-glow)]",
      priority:
        "bg-[var(--priority-solid)] text-[var(--on-priority)] shadow-[0_0_0_0_oklch(0.68_0.2_26/0)] hover:bg-[var(--priority-hover)] hover:shadow-[var(--priority-glow)]",
      ghost:
        "border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] shadow-[0_0_0_0_oklch(0.74_0.115_232/0)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-contrast)] hover:shadow-[var(--accent-soft-glow)]",
      approve:
        "border border-[var(--ok-border)] bg-[var(--ok-solid)] text-[var(--on-ok)] shadow-[0_0_0_0_oklch(0.78_0.14_158/0)] hover:bg-[var(--ok-hover)] hover:shadow-[var(--ok-glow)]",
      decline:
        "border border-[var(--priority-border)] bg-[var(--priority-solid)] text-[var(--on-priority)] shadow-[0_0_0_0_oklch(0.68_0.2_26/0)] hover:bg-[var(--priority-bright)] hover:shadow-[var(--priority-glow)]",
      archive:
        "border border-[var(--neutral-border)] bg-[var(--neutral-solid)] text-[var(--neutral-on)] shadow-[0_0_0_0_oklch(0.62_0.055_245/0)] hover:bg-[var(--neutral-hover)] hover:shadow-[var(--neutral-glow)]",
      revision:
        "border border-[var(--warn-border)] bg-[var(--warn-solid)] text-[var(--on-warn)] shadow-[0_0_0_0_oklch(0.82_0.13_85/0)] hover:bg-[var(--warn-hover)] hover:shadow-[var(--warn-glow)]",
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
