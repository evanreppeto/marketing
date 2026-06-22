import { getAppSettings } from "@/lib/settings/store";

import { AgentBehaviorSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function AgentBehaviorSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="How the chat agent sounds and behaves. Changes save automatically and travel with new agent tasks."
      title="Agent behavior"
    >
      <AgentBehaviorSettingsForm
        assistantName={settings.assistantName}
        initialApprovalStrictness={settings.approvalStrictness}
        initialMode={settings.markDefaultMode}
        initialResponseStyle={settings.assistantResponseStyle}
        initialRoute={settings.markDefaultRoute}
        initialTone={settings.assistantTone}
      />
    </SettingsSection>
  );
}
