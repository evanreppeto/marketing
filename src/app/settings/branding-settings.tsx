import { getAppSettings } from "@/lib/settings/store";

import { BrandingSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function BrandingSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="The product label and assistant name shown across the app. Your workspaces and team live under Workspaces and Team; company brand lives in Brand."
      title="Product"
    >
      <BrandingSettingsForm
        initialWorkspaceProfile={settings.workspaceProfile}
        initialProductLabel={settings.productLabel}
        initialAssistantName={settings.assistantName}
      />
    </SettingsSection>
  );
}
