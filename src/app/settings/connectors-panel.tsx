"use client";

import { useActionState } from "react";

import { EmptyState, StatusPill, Button } from "../_components/page-header";
import type { ThemeTone } from "../_components/theme";
import type { ConnectorView } from "@/lib/connectors/read-model";
import {
  type ConnectorActionState,
  connectConnectorAction,
  setConnectorEnabledAction,
  testConnectorAction,
} from "./connectors-actions";
import { SettingsSection } from "./settings-section";

const STATUS_TONE: Record<string, ThemeTone> = {
  connected: "green",
  error: "red",
  disabled: "gray",
  not_configured: "amber",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Ready",
  disabled: "Paused",
  error: "Needs attention",
  not_configured: "Needs setup",
};

function fmt(value: string | null) {
  return value ? value.replace("T", " ").slice(0, 16) : "Never";
}

function Feedback({ state }: { state: ConnectorActionState }) {
  if (!state) return null;
  return (
    <p className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
      {state.message}
    </p>
  );
}

function ConnectForm({ connector }: { connector: ConnectorView }) {
  const [state, action, pending] = useActionState(connectConnectorAction, null);

  return (
    <div className="grid gap-1">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input name="connectorKey" type="hidden" value={connector.key} />
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">API key</span>
          <input
            className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            name="apiKey"
            placeholder="Paste API key…"
            type="password"
          />
        </label>
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          Connect
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

function ToggleConnector({ connector }: { connector: ConnectorView }) {
  const [state, action, pending] = useActionState(setConnectorEnabledAction, null);
  const nextEnabled = !connector.enabled;

  return (
    <div className="grid justify-items-end gap-1">
      <form action={action}>
        <input name="connectorKey" type="hidden" value={connector.key} />
        <input name="enabled" type="hidden" value={String(nextEnabled)} />
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          {connector.enabled ? "Disable" : "Enable"}
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

function TestConnector({ connector }: { connector: ConnectorView }) {
  const [state, action, pending] = useActionState(testConnectorAction, null);

  return (
    <div className="grid gap-1">
      <form action={action}>
        <input name="connectorKey" type="hidden" value={connector.key} />
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          Test
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

function ConnectorCard({ connector }: { connector: ConnectorView }) {
  return (
    <li className="grid gap-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{connector.label}</h3>
            <StatusPill tone={STATUS_TONE[connector.status] ?? "gray"}>
              {STATUS_LABEL[connector.status] ?? connector.status}
            </StatusPill>
          </div>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{connector.description}</p>
        </div>
        <ToggleConnector connector={connector} />
      </div>

      {connector.authKind === "api_key" ? (
        <ConnectForm connector={connector} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <span>Last tested: {fmt(connector.lastTestedAt)}</span>
          {connector.lastTestError ? (
            <span className="text-[var(--priority-text)]">Error: {connector.lastTestError}</span>
          ) : null}
        </div>
        <TestConnector connector={connector} />
      </div>
    </li>
  );
}

export function ConnectorsPanel({ connectors }: { connectors: ConnectorView[] }) {
  return (
    <SettingsSection
      bodyClassName="p-0"
      description="API integrations used by Arc for research, enrichment, and data access. Keys are stored in the workspace vault. Nothing is called without an active connection."
      id="connectors"
      title="Connectors"
      actions={
        <StatusPill tone={connectors.some((c) => c.status === "connected") ? "green" : "gray"}>
          {connectors.filter((c) => c.status === "connected").length}/{connectors.length} active
        </StatusPill>
      }
    >
      {connectors.length === 0 ? (
        <div className="px-5 py-4">
          <EmptyState
            title="No connectors registered"
            detail="Connectors appear here once the workspace catalog is configured. Check back after completing initial setup."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-hairline)]">
          {connectors.map((connector) => (
            <ConnectorCard connector={connector} key={connector.key} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
