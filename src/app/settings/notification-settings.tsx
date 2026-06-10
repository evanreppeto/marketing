import { getAppSettings } from "@/lib/settings/store";

import { SettingRow } from "./setting-row";
import { WebhookToggle } from "./settings-forms";
import { SettingsSection } from "./settings-section";

function webhookHost(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).host;
  } catch {
    return "Invalid URL";
  }
}

/** How the app wakes Mark on new operator messages. The URL/secret are env-managed;
 *  the on/off switch is an editable app setting consumed by the notify path. */
export async function NotificationSettings() {
  const settings = await getAppSettings();
  const url = process.env.MARK_RUNNER_URL ?? process.env.MARK_WEBHOOK_URL;
  const host = webhookHost(url);
  const signed = Boolean(process.env.MARK_WEBHOOK_SECRET?.trim());
  const live = Boolean(host) && settings.markWebhookEnabled;

  return (
    <SettingsSection
      description="How the app notifies Mark when an operator sends a chat message."
      title="Notifications"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Mark wake webhook</div>
          <p className="mt-1 max-w-[60ch] text-xs leading-5 text-[var(--text-muted)]">
            {host
              ? settings.markWebhookEnabled
                ? "Active — each new operator message is pushed so Mark wakes immediately."
                : "Paused — Mark falls back to polling the inbox until you re-enable it."
              : "No webhook URL configured (set MARK_RUNNER_URL); Mark polls the inbox."}
          </p>
        </div>
        {host ? <WebhookToggle enabled={settings.markWebhookEnabled} /> : null}
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
