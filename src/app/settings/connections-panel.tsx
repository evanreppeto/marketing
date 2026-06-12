import { getConnections } from "@/lib/connections/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { StatusPill } from "../_components/page-header";
import { AgentConnectionShortcut, ConnectionSetupCard } from "./connection-controls";
import { SettingsSection } from "./settings-section";

function summaryTone(ok: boolean) {
  return ok ? "green" : "amber";
}

/**
 * Operator-friendly integration setup. The low-level env names are still
 * available under Technical details, but the default view explains what each
 * connection enables and what the next human action is.
 */
export async function ConnectionsPanel() {
  const connections = await getConnections();
  const email = connections.filter((connection) => connection.kind === "email");
  const social = connections.filter((connection) => connection.kind === "social");
  const emailReady = email.some((connection) => connection.status === "connected");
  const socialReady = social.filter((connection) => connection.status === "connected").length;

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Plain-English setup for the services this app can use. Nothing sends publicly unless the matching connection is ready and the approval gate allows it."
      id="connections"
      title="Connections"
      actions={<StatusPill tone={summaryTone(emailReady || socialReady > 0)}>Guided setup</StatusPill>}
    >
      <div className="grid gap-3 border-b border-[var(--border-hairline)] px-5 py-4 sm:grid-cols-4">
        <SummaryTile label="Database" ready={isSupabaseAdminConfigured()} value={isSupabaseAdminConfigured() ? "Ready" : "Needs setup"} />
        <SummaryTile label="Email" ready={emailReady} value={emailReady ? "Ready" : "Needs setup"} />
        <SummaryTile label="Agent" ready value="Agent tab" />
        <SummaryTile label="Social" ready={socialReady > 0} value={`${socialReady}/${social.length} ready`} />
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {email.map((connection) => (
          <ConnectionSetupCard connection={connection} key={connection.provider} />
        ))}
        <AgentConnectionShortcut />
      </ul>

      {social.length > 0 ? (
        <>
          <div className="border-y border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
            <div className="signal-eyebrow">Social channels</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              These prepare future approved social posting. Testing checks whether the required credentials are present; it does not post.
            </p>
          </div>

          <ul className="divide-y divide-[var(--border-hairline)]">
            {social.map((connection) => (
              <ConnectionSetupCard connection={connection} key={connection.provider} />
            ))}
          </ul>
        </>
      ) : null}
    </SettingsSection>
  );
}

function SummaryTile({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-1 text-sm font-bold ${ready ? "text-[var(--ok-text)]" : "text-[var(--warn-text)]"}`}>{value}</div>
    </div>
  );
}
