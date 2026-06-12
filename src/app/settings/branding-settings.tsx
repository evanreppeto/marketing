import { getAppSettings } from "@/lib/settings/store";

import { BrandingSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function BrandingSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Make the console fit an individual operator, a team, or a company. These settings update the app shell and chat labels."
      title="Branding"
    >
      <BrandingSettingsForm
        initialWorkspaceName={settings.workspaceName}
        initialWorkspaceProfile={settings.workspaceProfile}
        initialProductLabel={settings.productLabel}
        initialAssistantName={settings.assistantName}
        initialBrandShortName={settings.brandShortName}
        initialBrandLogoUrl={settings.brandLogoUrl}
        initialBrandFaviconUrl={settings.brandFaviconUrl}
      />
    </SettingsSection>
  );
}
