import { resolveAgentConnection } from "@/lib/agent/connection";

import { SettingRow } from "./setting-row";
import { SettingsSection } from "./settings-section";

function webhookHost(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).host;
  } catch {
    return "Invalid URL";
  }
}

export async function NotificationSettings() {
  const connection = await resolveAgentConnection();
  const host = webhookHost(connection.webhookUrl);
  const signed = Boolean(process.env.ARC_WEBHOOK_SECRET?.trim() || connection.webhookSecretRef);
  const live = Boolean(host) && connection.enabled;

  return (
    <SettingsSection
      description="How the app notifies the connected agent when an operator sends a chat message. Manage the URL, secret, and switch in the Agent tab."
      title="Notifications"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Agent wake webhook</div>
          <p className="mt-1 max-w-[60ch] text-xs leading-5 text-[var(--text-muted)]">
            {host
              ? live
                ? "Active: each new operator message is pushed so the agent wakes immediately."
                : "Paused: the agent falls back to polling the inbox until you re-enable it."
              : "No webhook URL configured; the agent polls the inbox."}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border-hairline)]">
        <div className="-mx-5 divide-y divide-[var(--border-hairline)]">
          <SettingRow
            label="Webhook URL"
            pill={live ? { tone: "green", text: "Active" } : { tone: "gray", text: "Off" }}
            value={host ?? "Not configured"}
          />
          <SettingRow
            detail="Body is signed with HMAC-SHA256 (X-Webhook-Signature) when a secret is set."
            label="Webhook signing"
            pill={signed ? { tone: "green", text: "Signed" } : { tone: "amber", text: "Unsigned" }}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
