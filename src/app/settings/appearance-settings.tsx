import { getAppSettings } from "@/lib/settings/store";

import { AppearanceSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function AppearanceSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Change how the console feels across every page. Changes save automatically."
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
