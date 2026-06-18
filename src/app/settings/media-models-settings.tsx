import { getAppSettings } from "@/lib/settings/store";

import { MediaModelsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function MediaModelsSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Choose the image and video models Arc generates with. Auto inherits the deployment's env default; explicit picks override it."
      title="Media models"
    >
      <MediaModelsForm initialImageModel={settings.imageModel} initialVideoModel={settings.videoModel} />
    </SettingsSection>
  );
}
