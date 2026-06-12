import { getAppSettings } from "@/lib/settings/store";

import { SettingRow } from "./setting-row";
import { GeneralSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

const env = (name: string) => process.env[name]?.trim() || null;

/** Editable support prefs (persisted) + read-only deployment info (from env). */
export async function GeneralSettings() {
  const settings = await getAppSettings();
  const gateEnabled = Boolean(env("OPERATOR_ACCESS_TOKEN"));

  return (
    <>
      <SettingsSection
        description="Support contact and deployment basics. Names, logos, and chat identity live in Branding."
        title="General"
      >
        <GeneralSettingsForm initialSupportEmail={settings.supportEmail} initialWorkspaceName={settings.workspaceName} />

        <div className="mt-5 border-t border-[var(--border-hairline)]">
          <div className="-mx-5 divide-y divide-[var(--border-hairline)]">
            <SettingRow label="Operator email" value={env("OPERATOR_EMAIL") ?? "Not set"} />
            <SettingRow label="Environment" value={process.env.NODE_ENV ?? "development"} />
            <SettingRow
              detail="When enabled, every page route requires operator sign-in."
              label="Operator access gate"
              pill={gateEnabled ? { tone: "green", text: "Enabled" } : { tone: "amber", text: "Open (dev)" }}
            />
          </div>
        </div>
      </SettingsSection>
    </>
  );
}
