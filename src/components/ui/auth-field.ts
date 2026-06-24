// Shared class strings for auth-screen form controls, so sign-in, sign-up, welcome,
// and /start render identical fields under the AuthShell editorial layout.

export const AUTH_FIELD_SHELL =
  "auth-field-shell mt-2 flex h-12 items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_82%,transparent)] px-3.5 transition focus-within:border-[var(--accent-border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]";

export const AUTH_FIELD_INPUT =
  "h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";

export const AUTH_LABEL = "text-[13px] font-medium text-[var(--text-secondary)]";

export const AUTH_FORM_HEADING =
  "font-editorial text-[1.75rem] font-normal leading-[1.05] tracking-[-0.01em] text-[var(--text-primary)]";

export const AUTH_ERROR_BOX =
  "mt-4 rounded-lg border border-[var(--priority-border-soft)] bg-[var(--priority-soft)] px-3 py-2 text-sm leading-5 text-[var(--priority-text)]";
