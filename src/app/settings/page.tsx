import { PageHeader } from "../_components/page-header";
import { AccountSettings } from "./account-settings";
import { ConnectionsPanel } from "./connections-panel";
import { GeneralSettings } from "./general-settings";
import { NotificationSettings } from "./notification-settings";
import { SettingsShell } from "./settings-shell";
import { SystemStatus } from "./system-status";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="App configuration and integration status. Connections and outbound execution stay locked until configured and approved."
      />

      <div className="mx-auto w-full max-w-[1040px]">
        <SettingsShell
          panels={{
            general: <GeneralSettings />,
            account: <AccountSettings />,
            connections: <ConnectionsPanel />,
            notifications: <NotificationSettings />,
            system: <SystemStatus />,
          }}
        />
      </div>
    </>
  );
}
