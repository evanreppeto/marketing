import { getConnections } from "@/lib/connections/read-model";

import { ResendConnectionControls, SocialConnectionControls } from "./connection-controls";
import { SettingsSection } from "./settings-section";

/**
 * Connections section of Settings. Resend has live controls (enable/disable, test, send
 * test email). Social providers have env-var-backed status + enable/disable + a
 * presence "test"; real posting transport (OAuth + per-platform send) ships in the
 * transport spec. Secrets live in env vars — this surface only shows status and operator
 * controls, never a raw key.
 */
export async function ConnectionsPanel() {
  const connections = await getConnections();
  const email = connections.filter((connection) => connection.kind === "email");
  const social = connections.filter((connection) => connection.kind === "social");

  return (
    <SettingsSection
      title="Connections"
      description="Secrets stay in environment variables; these controls only flip the operator switch and record test/use telemetry. A real send happens only when an approved dispatch is executed."
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-[var(--border-hairline)]">
        {email.map((connection) => (
          <ResendConnectionControls key={connection.provider} connection={connection} />
        ))}
      </ul>

      {social.length > 0 ? (
        <>
          <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3">
            <div className="signal-eyebrow">Social</div>
          </div>

          <ul className="divide-y divide-[var(--border-hairline)]">
            {social.map((connection) => (
              <SocialConnectionControls key={connection.provider} connection={connection} />
            ))}
          </ul>

          <p className="border-t border-[var(--border-hairline)] px-5 py-3 text-xs leading-5 text-[var(--text-muted)]">
            Posting transport (OAuth + per-platform send) ships in the transport spec. &ldquo;Test connection&rdquo; here
            only verifies the credentials are present in the environment — it does not post.
          </p>
        </>
      ) : null}
    </SettingsSection>
  );
}
