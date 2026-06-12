import { getAppSettings } from "@/lib/settings/store";

import { AppearanceSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function AppearanceSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Change how the console feels across every page. These preferences are saved and applied by the app layout."
      title="Appearance"
    >
      <AppearanceSettingsForm
        initialAccent={settings.appearanceAccent}
        initialDensity={settings.appearanceDensity}
        initialMotion={settings.appearanceMotion}
      />
    </SettingsSection>
  );
}
