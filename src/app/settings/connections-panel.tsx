import { getConnections } from "@/lib/connections/read-model";

import { Panel, StatusPill } from "../_components/page-header";
import { ResendConnectionControls } from "./connection-controls";

/**
 * Connections section of Settings. Resend gets live controls (enable/disable,
 * test, send test email); social providers are placeholders until Spec 2 wires
 * OAuth + transport. Secrets live in env vars — this surface only shows status
 * and operator controls, never a raw key.
 */
export async function ConnectionsPanel() {
  const connections = await getConnections();
  const email = connections.filter((connection) => connection.kind === "email");
  const social = connections.filter((connection) => connection.kind === "social");

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-col gap-1 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Connections</div>
        <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Outbound integrations</h2>
        <p className="max-w-[74ch] text-sm leading-6 text-[var(--text-secondary)]">
          Secrets stay in environment variables; these controls only flip the operator switch and record test/use
          telemetry. A real send happens only when an approved dispatch is executed.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {email.map((connection) => (
          <ResendConnectionControls key={connection.provider} connection={connection} />
        ))}
      </ul>

      <div className="border-t border-[var(--border-hairline)] px-5 py-4">
        <div className="signal-eyebrow mb-2">Social — coming in a later release</div>
        <div className="flex flex-wrap gap-2">
          {social.map((connection) => (
            <span
              key={connection.provider}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-1.5"
            >
              <span className="text-sm font-semibold text-[var(--text-secondary)]">{connection.label}</span>
              <StatusPill tone="gray">Not configured</StatusPill>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
          Social posting (OAuth + per-platform transport) is executed by Mark/Hermes and ships in a later spec.
        </p>
      </div>
    </Panel>
  );
}
