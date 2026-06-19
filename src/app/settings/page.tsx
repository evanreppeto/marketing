import { PageHeader } from "../_components/page-header";
import { AccountSettings } from "./account-settings";
import { AgentBehaviorSettings } from "./agent-behavior-settings";
import { AgentPanel } from "./agent-panel";
import { AppearanceSettings } from "./appearance-settings";
import { BrandingSettings } from "./branding-settings";
import { ConnectionsPanel } from "./connections-panel";
import { GeneralSettings } from "./general-settings";
import { MediaModelsSettings } from "./media-models-settings";
import { NotificationSettings } from "./notification-settings";
import { SettingsShell } from "./settings-shell";
import { SettingsHome } from "./settings-home";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";
import { SystemStatus } from "./system-status";
import { WorkspaceTeamSettings } from "./workspace-team-settings";

function activeSection(value: string | string[] | undefined): SettingsSectionId {
  const section = Array.isArray(value) ? value[0] : value;
  return SETTINGS_SECTIONS.some((item) => item.id === section) ? (section as SettingsSectionId) : SETTINGS_SECTIONS[0].id;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const active = activeSection((await searchParams).section);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="App configuration and integration status. Connections and outbound execution stay locked until configured and approved."
      />

      <div className="mx-auto w-full max-w-[1040px]">
        <SettingsShell
          active={active}
          panels={{
            home: <SettingsHome />,
            general: <GeneralSettings />,
            branding: <BrandingSettings />,
            appearance: <AppearanceSettings />,
            behavior: <AgentBehaviorSettings />,
            media: <MediaModelsSettings />,
            workspace: <WorkspaceTeamSettings />,
            account: <AccountSettings />,
            connections: <ConnectionsPanel />,
            agent: <AgentPanel />,
            notifications: <NotificationSettings />,
            system: <SystemStatus />,
          }}
        />
      </div>
    </>
  );
}
