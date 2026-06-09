"use client";

import { useActionState } from "react";

import { Button, StatusPill } from "../_components/page-header";
import { type ThemeTone } from "../_components/theme";
import {
  type ConnectionActionState,
  sendTestEmailAction,
  setConnectionEnabledAction,
  testConnectionAction,
} from "./connections-actions";

export type ConnectionRowView = {
  provider: string;
  kind: string;
  label: string;
  /** Legacy single-var display hint (used by the Resend row). */
  envVar: string | null;
  /** Authoritative list of all env vars a provider needs — drives the social row + status. */
  requiredEnvVars: string[];
  enabled: boolean;
  status: string;
  fromEmail: string | null;
  lastTestedAt: string | null;
  lastTestError: string | null;
  lastUsedAt: string | null;
};

const STATUS_TONE: Record<string, ThemeTone> = {
  connected: "green",
  disabled: "gray",
  error: "red",
  not_configured: "amber",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  disabled: "Disabled",
  error: "Error",
  not_configured: "Not configured",
};

function Feedback({ state }: { state: ConnectionActionState }) {
  if (!state) return null;
  return (
    <p className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
      {state.message}
    </p>
  );
}

function fmt(value: string | null) {
  return value ? value.replace("T", " ").slice(0, 16) : "—";
}

export function ResendConnectionControls({ connection }: { connection: ConnectionRowView }) {
  const [toggleState, toggleAction, togglePending] = useActionState(setConnectionEnabledAction, null);
  const [testState, testAction, testPending] = useActionState(testConnectionAction, null);
  const [sendState, sendAction, sendPending] = useActionState(sendTestEmailAction, null);

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-black text-[var(--text-primary)]">{connection.label}</span>
            <StatusPill tone={STATUS_TONE[connection.status] ?? "gray"}>
              {STATUS_LABEL[connection.status] ?? connection.status}
            </StatusPill>
          </div>
          <div className="mt-1 font-mono text-[11px] font-semibold text-[var(--text-muted)]">
            {connection.envVar ?? "—"}
            {connection.fromEmail ? ` · from ${connection.fromEmail}` : ""}
          </div>
        </div>

        <form action={toggleAction}>
          <input type="hidden" name="provider" value={connection.provider} />
          <input type="hidden" name="enabled" value={connection.enabled ? "false" : "true"} />
          <Button disabled={togglePending} size="sm" type="submit" variant={connection.enabled ? "ghost" : "primary"}>
            {connection.enabled ? "Disable" : "Enable"}
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form action={testAction}>
          <input type="hidden" name="provider" value={connection.provider} />
          <Button disabled={testPending} size="sm" type="submit" variant="ghost">
            Test connection
          </Button>
        </form>

        <form action={sendAction} className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">Send test to</span>
            <input
              className="min-h-9 w-56 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              name="to"
              placeholder="defaults to OPERATOR_EMAIL"
              type="email"
            />
          </label>
          <Button disabled={sendPending} size="sm" type="submit" variant="ghost">
            Send test email
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
        <span>Last tested: {fmt(connection.lastTestedAt)}</span>
        <span>Last used: {fmt(connection.lastUsedAt)}</span>
        {connection.lastTestError ? <span className="text-[var(--priority-text)]">{connection.lastTestError}</span> : null}
      </div>

      <Feedback state={toggleState} />
      <Feedback state={testState} />
      <Feedback state={sendState} />
    </li>
  );
}

export function SocialConnectionControls({ connection }: { connection: ConnectionRowView }) {
  const [toggleState, toggleAction, togglePending] = useActionState(setConnectionEnabledAction, null);
  const [testState, testAction, testPending] = useActionState(testConnectionAction, null);

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-black text-[var(--text-primary)]">{connection.label}</span>
            <StatusPill tone={STATUS_TONE[connection.status] ?? "gray"}>
              {STATUS_LABEL[connection.status] ?? connection.status}
            </StatusPill>
          </div>
          <div className="mt-1 font-mono text-[11px] font-semibold text-[var(--text-muted)]">
            {connection.requiredEnvVars.join(" · ") || "—"}
          </div>
        </div>

        <form action={toggleAction}>
          <input type="hidden" name="provider" value={connection.provider} />
          <input type="hidden" name="enabled" value={connection.enabled ? "false" : "true"} />
          <Button disabled={togglePending} size="sm" type="submit" variant={connection.enabled ? "ghost" : "primary"}>
            {connection.enabled ? "Disable" : "Enable"}
          </Button>
        </form>
      </div>

      <form action={testAction}>
        <input type="hidden" name="provider" value={connection.provider} />
        <Button disabled={testPending} size="sm" type="submit" variant="ghost">
          Test connection
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
        <span>Last tested: {fmt(connection.lastTestedAt)}</span>
        <span>Last used: {fmt(connection.lastUsedAt)}</span>
        {connection.lastTestError ? <span className="text-[var(--priority-text)]">{connection.lastTestError}</span> : null}
      </div>

      <Feedback state={toggleState} />
      <Feedback state={testState} />
    </li>
  );
}
