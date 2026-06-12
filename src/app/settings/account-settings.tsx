import Link from "next/link";

import { getConfiguredOperatorCredentials, isOperatorGateEnabled } from "@/lib/auth/operator-shared";
import { getAppSettings, getSupportContactEmail } from "@/lib/settings/store";

import { Button, StatusPill } from "../_components/page-header";
import { SettingRow } from "./setting-row";
import { SettingsSection } from "./settings-section";

function initials(email: string | null): string {
  if (!email) return "OP";
  const name = email.split("@")[0] ?? email;
  const parts = name.split(/[.\-_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "O") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "P")).toUpperCase();
}

function maskEmail(email: string | null): string {
  if (!email) return "Local operator";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.length <= 2 ? name : `${name.slice(0, 2)}...`;
  return `${visible}@${domain}`;
}

/** Operator identity, session actions, and auth status. Identity is env-managed;
 *  editable app-level contact/support settings live in General. */
export async function AccountSettings() {
  const settings = await getAppSettings();
  const email = process.env.OPERATOR_EMAIL?.trim() || null;
  const supportEmail = getSupportContactEmail(settings);
  const gateEnabled = isOperatorGateEnabled();
  const passwordConfigured = Boolean(getConfiguredOperatorCredentials());

  return (
    <div className="space-y-5">
      <SettingsSection
        description="Who is using this console and how access is currently protected."
        title="Account"
        actions={<StatusPill tone={gateEnabled ? "green" : "amber"}>{gateEnabled ? "Protected" : "Open dev"}</StatusPill>}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] font-display text-lg font-black text-[var(--accent-contrast)]">
              {initials(email)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-[var(--text-primary)]">{maskEmail(email)}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-[var(--text-muted)]">
                <span>Role: Operator</span>
                <span>Auth: environment-managed</span>
              </div>
            </div>
          </div>

          <form action="/api/auth/sign-out" method="post">
            <Button size="sm" type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>

        <div className="mt-5 border-t border-[var(--border-hairline)]">
          <div className="-mx-5 divide-y divide-[var(--border-hairline)]">
            <SettingRow
              detail={gateEnabled ? "A valid operator session cookie is required before the app opens." : "This local environment opens without sign-in."}
              label="Access gate"
              pill={gateEnabled ? { tone: "green", text: "Enabled" } : { tone: "amber", text: "Open" }}
            />
            <SettingRow
              detail={passwordConfigured ? "Email/password sign-in can create the operator session." : "Set OPERATOR_EMAIL and OPERATOR_PASSWORD to enable password sign-in."}
              label="Password sign-in"
              pill={passwordConfigured ? { tone: "green", text: "Configured" } : { tone: "gray", text: "Not configured" }}
            />
            <SettingRow
              detail="The passkey route exists but intentionally redirects until a real provider is configured."
              label="Passkey sign-in"
              pill={{ tone: "gray", text: "Not configured" }}
            />
            <SettingRow
              detail="Used by Account and the reset-access screen. Edit it in General."
              label="Support contact"
              value={supportEmail}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection description="Useful shortcuts for access and support workflows." title="Account actions">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]" href="/forgot-password">
            Open reset access
            <span className="mt-1 block text-xs font-normal leading-5 text-[var(--text-muted)]">See exactly where reset requests go.</span>
          </Link>
          <Link className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]" href="/settings?section=general">
            Edit support email
            <span className="mt-1 block text-xs font-normal leading-5 text-[var(--text-muted)]">Updates Account and reset access.</span>
          </Link>
          <form action="/api/auth/sign-out" method="post">
            <button className="h-full w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-left text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]" type="submit">
              Clear local session
              <span className="mt-1 block text-xs font-normal leading-5 text-[var(--text-muted)]">Removes the operator cookie on this browser.</span>
            </button>
          </form>
        </div>
      </SettingsSection>
    </div>
  );
}
