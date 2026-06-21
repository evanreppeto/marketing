import { getAppSettings } from "@/lib/settings/store";

import { MediaModelsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function MediaModelsSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Advanced — pin a specific image or video model. Overrides your Arc level; leave on Auto to follow it. Changes save automatically."
      title="Media models"
    >
      <MediaModelsForm initialImageModel={settings.imageModel} initialVideoModel={settings.videoModel} />
    </SettingsSection>
  );
}
