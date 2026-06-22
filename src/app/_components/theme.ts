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
    layout: "min-h-screen lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[244px_minmax(0,1fr)]",
    sidebar:
      "relative isolate overflow-hidden border-b border-[var(--border-panel)] bg-[var(--surface-sidebar)] px-4 py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-3.5 lg:py-5",
    content: "min-w-0 px-4 py-4 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-5 xl:px-10",
    overlay: "fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm",
  },
  surface: {
    panel: "signal-panel rounded-[10px]",
    inset: "signal-inset rounded-[8px]",
    soft: "signal-soft rounded-[8px]",
    media: "bg-[var(--media-void)]",
    pageHeader:
      "module-rise relative mb-5 border-b border-[var(--border-hairline)] px-0 pb-5 pt-1",
    workspaceHeader:
      "module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]",
    workspacePanel: "signal-panel module-rise overflow-hidden",
    operatorCard:
      "overflow-hidden rounded-2xl border border-[var(--accent-border)] bg-[var(--surface-operator)] shadow-[var(--elev-panel)]",
    divider: "border-[var(--border-hairline)]",
    dashedEmpty:
      "relative isolate overflow-hidden rounded-[10px] border border-[var(--border-panel)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-panel)_84%,transparent),color-mix(in_srgb,var(--surface-inset)_82%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_54px_rgba(0,0,0,0.18)] before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_52%,transparent),transparent)] before:content-[''] after:pointer-events-none after:absolute after:-right-12 after:-top-16 after:h-40 after:w-40 after:rounded-full after:bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_68%)] after:content-['']",
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
    tabList: "module-rise border-b border-[var(--border-hairline)] pb-3",
    tabBase:
      "group relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[8px] px-3.5 py-2 text-sm font-semibold transition duration-200 ease-out hover:bg-[color-mix(in_srgb,var(--surface-inset)_46%,transparent)] active:translate-y-px",
    tabActive: "text-[var(--text-primary)]",
    tabIdle: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    tabIcon: "h-4 w-4 shrink-0 transition-colors",
    tabMarker:
      "pointer-events-none absolute inset-x-2 bottom-[-0.75rem] h-px rounded-full bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_92%,transparent),transparent)] shadow-[0_0_16px_rgba(211,170,75,0.34)] after:absolute after:inset-x-3 after:top-[-3px] after:h-[7px] after:rounded-full after:bg-[radial-gradient(ellipse_at_center,rgba(211,170,75,0.20),transparent_70%)] after:content-['']",
    cardInteractive:
      "transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
    kbd: "rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 font-mono",
    tabBadge: "font-mono text-xs font-semibold tabular-nums text-[var(--text-muted)]",
    backLink:
      "mb-3 inline-flex min-h-9 items-center gap-2 self-start rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]",
  },
  button: {
    base:
      "relative isolate inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[8px] border font-semibold tracking-[-0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_24px_rgba(0,0,0,0.22)] transition duration-200 ease-out before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)] before:content-[''] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_16px_34px_rgba(0,0,0,0.30)] active:translate-y-px active:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:translate-y-0",
    sizes: {
      md: "min-h-11 px-4 text-sm",
      sm: "min-h-10 px-3.5 text-xs",
    } satisfies Record<ButtonSize, string>,
    variants: {
      primary:
        "border-[color-mix(in_srgb,var(--accent)_66%,#fff_8%)] bg-[linear-gradient(180deg,var(--accent-hover),var(--accent)_56%,var(--accent-active))] text-[#11110e] hover:border-[var(--accent-hover)] hover:brightness-[1.03] active:brightness-95",
      priority:
        "border-[var(--priority-border)] bg-[linear-gradient(180deg,var(--priority-hover),var(--priority-solid))] text-[var(--on-priority)] hover:border-[var(--priority-bright)]",
      ghost:
        "border-[var(--border-hairline)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_62%,transparent),color-mix(in_srgb,var(--surface-inset)_86%,transparent))] text-[var(--text-primary)] hover:border-[var(--accent-border-strong)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_86%,transparent),color-mix(in_srgb,var(--surface-inset)_94%,transparent))] hover:text-[var(--accent-contrast)]",
      approve:
        "border-[var(--ok-border)] bg-[linear-gradient(180deg,var(--ok-hover),var(--ok-solid))] text-[var(--on-ok)] hover:border-[var(--ok-hover)]",
      decline:
        "border-[var(--priority-border)] bg-[linear-gradient(180deg,var(--priority-hover),var(--priority-solid))] text-[var(--on-priority)] hover:border-[var(--priority-bright)]",
      archive:
        "border-[var(--neutral-border)] bg-[linear-gradient(180deg,var(--neutral-hover),var(--neutral-solid))] text-[var(--neutral-on)] hover:border-[var(--border-strong)]",
      revision:
        "border-[var(--warn-border)] bg-[linear-gradient(180deg,var(--warn-hover),var(--warn-solid))] text-[var(--on-warn)] hover:border-[var(--warn-hover)]",
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
