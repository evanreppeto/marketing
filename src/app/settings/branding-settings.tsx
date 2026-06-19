import { getAppSettings } from "@/lib/settings/store";

import { BrandingSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function BrandingSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Product label, assistant name, and workspace type. Company brand, logo, voice, proof, and source knowledge live in Brand."
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
