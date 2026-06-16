import { getAppSettings } from "@/lib/settings/store";

import { AgentBehaviorSettingsForm } from "./settings-forms";
import { SettingsSection } from "./settings-section";

export async function AgentBehaviorSettings() {
  const settings = await getAppSettings();

  return (
    <SettingsSection
      description="Set how the chat agent behaves when new messages are queued. These values travel with new agent tasks."
      title="Agent behavior"
    >
      <AgentBehaviorSettingsForm
        assistantName={settings.assistantName}
        initialApprovalStrictness={settings.approvalStrictness}
        initialMode={settings.arcDefaultMode}
        initialResponseStyle={settings.assistantResponseStyle}
        initialRoute={settings.arcDefaultRoute}
        initialTone={settings.assistantTone}
      />
    </SettingsSection>
  );
}
