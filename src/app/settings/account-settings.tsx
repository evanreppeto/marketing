import { Button } from "../_components/page-header";
import { SettingsSection } from "./settings-section";

function initials(email: string | null): string {
  if (!email) return "OP";
  const name = email.split("@")[0] ?? email;
  const parts = name.split(/[.\-_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "O") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "P")).toUpperCase();
}

/** The operator identity for this console, plus a real sign-out (clears the session
 *  cookie via the existing auth route). */
export function AccountSettings() {
  const email = process.env.OPERATOR_EMAIL?.trim() || null;
  const gateEnabled = Boolean(process.env.OPERATOR_ACCESS_TOKEN?.trim());

  return (
    <SettingsSection description="The operator identity signed in to this console." title="Account">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--surface-inset)] font-display text-sm font-black text-[var(--accent)]">
            {initials(email)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[var(--text-primary)]">{email ?? "Local operator"}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Operator</div>
          </div>
        </div>

        <form action="/api/auth/sign-out" method="post">
          <Button size="sm" type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>

      {gateEnabled ? null : (
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          The operator gate is open in this environment, so pages don&rsquo;t require sign-in. Sign out still clears the
          local session cookie.
        </p>
      )}
    </SettingsSection>
  );
}
