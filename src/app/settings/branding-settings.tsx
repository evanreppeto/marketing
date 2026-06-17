import { getAppSettings } from "@/lib/settings/store";

import { BrandingSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function BrandingSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Product label, assistant name, and workspace type. Brand identity (name, logo) lives in Brand Kit."
      title="Workspace &amp; product"
    >
      <BrandingSettingsForm
        initialWorkspaceProfile={settings.workspaceProfile}
        initialProductLabel={settings.productLabel}
        initialAssistantName={settings.assistantName}
      />
    </SettingsSection>
  );
}
