import { SettingRow } from "./setting-row";
import { SettingsSection } from "./settings-section";

const env = (name: string) => process.env[name]?.trim() || null;

/** Read-only workspace + deployment info. Values are managed via environment vars. */
export function GeneralSettings() {
  const gateEnabled = Boolean(env("OPERATOR_ACCESS_TOKEN"));

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Workspace and deployment details. These are managed via environment variables."
      title="General"
    >
      <div className="divide-y divide-[var(--border-hairline)]">
        <SettingRow label="Workspace" value="Big Shoulders Restoration M&P" />
        <SettingRow label="Support email" value={env("OPERATOR_SUPPORT_EMAIL") ?? "Not set"} />
        <SettingRow label="Operator email" value={env("OPERATOR_EMAIL") ?? "Not set"} />
        <SettingRow label="Environment" value={process.env.NODE_ENV ?? "development"} />
        <SettingRow
          detail="When enabled, every page route requires operator sign-in."
          label="Operator access gate"
          pill={gateEnabled ? { tone: "green", text: "Enabled" } : { tone: "amber", text: "Open (dev)" }}
        />
      </div>
    </SettingsSection>
  );
}
