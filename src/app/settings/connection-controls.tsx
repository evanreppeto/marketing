"use client";

import Link from "next/link";
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
  envVar: string | null;
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
  connected: "Ready",
  disabled: "Paused",
  error: "Needs attention",
  not_configured: "Needs setup",
};

const PROVIDER_COPY: Record<string, { enables: string; setup: string }> = {
  resend: {
    enables: "Approved email dispatches can leave the app through Resend.",
    setup: "Add RESEND_API_KEY and RESEND_FROM, then test the connection.",
  },
  instagram: {
    enables: "Lets future approved social assets target Instagram once the posting transport ships.",
    setup: "Add the Meta app credentials and page access token.",
  },
  facebook: {
    enables: "Lets future approved social assets target Facebook once the posting transport ships.",
    setup: "Add the Meta app credentials and page access token.",
  },
  linkedin: {
    enables: "Lets future approved social assets target LinkedIn once the posting transport ships.",
    setup: "Add the LinkedIn app token set.",
  },
  x: {
    enables: "Lets future approved social assets target X once the posting transport ships.",
    setup: "Add the X API key, API secret, access token, and access secret.",
  },
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
  return value ? value.replace("T", " ").slice(0, 16) : "Never";
}

function nextStep(connection: ConnectionRowView): string {
  if (connection.status === "connected") return "No action needed. This connection is ready.";
  if (connection.status === "disabled") return "Enable it when you want this integration available again.";
  if (connection.status === "error") return connection.lastTestError ?? "Run a test to see the current error.";
  return PROVIDER_COPY[connection.provider]?.setup ?? "Add the required credentials, then test again.";
}

function ToggleConnection({ connection }: { connection: ConnectionRowView }) {
  const [state, action, pending] = useActionState(setConnectionEnabledAction, null);

  return (
    <div className="grid gap-1">
      <form action={action}>
        <input name="provider" type="hidden" value={connection.provider} />
        <input name="enabled" type="hidden" value={connection.enabled ? "false" : "true"} />
        <Button disabled={pending} size="sm" type="submit" variant={connection.enabled ? "ghost" : "primary"}>
          {connection.enabled ? "Pause" : "Enable"}
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

function TestConnection({ connection }: { connection: ConnectionRowView }) {
  const [state, action, pending] = useActionState(testConnectionAction, null);

  return (
    <div className="grid gap-1">
      <form action={action}>
        <input name="provider" type="hidden" value={connection.provider} />
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          Test
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

function SendTestEmail() {
  const [state, action, pending] = useActionState(sendTestEmailAction, null);

  return (
    <div className="grid gap-1">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">Send test email to</span>
          <input
            className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="to"
            placeholder="operator email"
            type="email"
          />
        </label>
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          Send test
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

export function ConnectionSetupCard({ connection }: { connection: ConnectionRowView }) {
  const copy = PROVIDER_COPY[connection.provider] ?? {
    enables: "Connects this provider to the Growth Engine.",
    setup: "Add credentials, then test the connection.",
  };
  const required = connection.requiredEnvVars.length > 0 ? connection.requiredEnvVars : connection.envVar ? [connection.envVar] : [];

  return (
    <li className="grid gap-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{connection.label}</h3>
            <StatusPill tone={STATUS_TONE[connection.status] ?? "gray"}>
              {STATUS_LABEL[connection.status] ?? connection.status}
            </StatusPill>
          </div>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{copy.enables}</p>
        </div>
        <ToggleConnection connection={connection} />
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Next step</div>
          <p className="mt-1 text-sm leading-6 text-[var(--text-primary)]">{nextStep(connection)}</p>
        </div>
        <TestConnection connection={connection} />
      </div>

      {connection.provider === "resend" ? <SendTestEmail /> : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
        <span>Last tested: {fmt(connection.lastTestedAt)}</span>
        <span>Last used: {fmt(connection.lastUsedAt)}</span>
        {connection.fromEmail ? <span>From: {connection.fromEmail}</span> : null}
      </div>

      <details className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Technical details
        </summary>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--text-secondary)]">
          <span>Provider key: {connection.provider}</span>
          <span>Required env: {required.length > 0 ? required.join(", ") : "None"}</span>
          {connection.lastTestError ? <span className="text-[var(--priority-text)]">Last error: {connection.lastTestError}</span> : null}
        </div>
      </details>
    </li>
  );
}

export function AgentConnectionShortcut() {
  return (
    <li className="grid gap-3 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Mark / Hermes agent</h3>
            <StatusPill tone="blue">Managed in Agent</StatusPill>
          </div>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
            Controls the worker that reads Mark tasks, returns replies, and wakes when an operator sends a chat message.
          </p>
        </div>
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
          href="/settings?section=agent"
        >
          Open Agent
        </Link>
      </div>
    </li>
  );
}
