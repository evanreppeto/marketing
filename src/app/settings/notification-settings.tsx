import { SettingRow } from "./setting-row";
import { SettingsSection } from "./settings-section";

function webhookHost(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).host;
  } catch {
    return "Invalid URL";
  }
}

/** Status of how the app wakes Mark on new operator chat messages. Read-only — the
 *  webhook is configured via environment variables. */
export function NotificationSettings() {
  const host = webhookHost(process.env.MARK_WEBHOOK_URL);
  const signed = Boolean(process.env.MARK_WEBHOOK_SECRET?.trim());

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="How the app notifies Mark when an operator sends a chat message."
      title="Notifications"
    >
      <div className="divide-y divide-[var(--border-hairline)]">
        <SettingRow
          detail={
            host
              ? "Event-driven: the app POSTs each new operator message so Mark wakes immediately."
              : "Unset — Mark falls back to polling the inbox for new messages."
          }
          label="Mark webhook"
          pill={host ? { tone: "green", text: "Configured" } : { tone: "gray", text: "Off" }}
          value={host ?? "Not configured"}
        />
        <SettingRow
          detail="Webhook body is signed with HMAC-SHA256 (X-Webhook-Signature) when a secret is set."
          label="Webhook signing"
          pill={signed ? { tone: "green", text: "Signed" } : { tone: "amber", text: "Unsigned" }}
        />
      </div>
    </SettingsSection>
  );
}
