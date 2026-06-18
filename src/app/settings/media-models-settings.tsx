import { getAppSettings } from "@/lib/settings/store";

import { MediaModelsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function MediaModelsSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Advanced — pin a specific image or video model. This overrides your Arc level (Swift/Studio); leave on Auto to follow the level."
      title="Media models (Advanced)"
    >
      <MediaModelsForm initialImageModel={settings.imageModel} initialVideoModel={settings.videoModel} />
    </SettingsSection>
  );
}
