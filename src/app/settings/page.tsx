import type React from "react";
import { DossierPanel, MetricBand, MetricCell, WorkbenchFrame } from "../_components/workbench";
import { AccountSettings } from "./account-settings";
import { AgentBehaviorSettings } from "./agent-behavior-settings";
import { AgentPanel } from "./agent-panel";
import { AppearanceSettings } from "./appearance-settings";
import { BrandingSettings } from "./branding-settings";
import { ConnectionsPanel } from "./connections-panel";
import { ConnectorsPanel } from "./connectors-panel";
import { GeneralSettings } from "./general-settings";
import { MediaModelsSettings } from "./media-models-settings";
import { NotificationSettings } from "./notification-settings";
import { SettingsShell } from "./settings-shell";
import { SettingsHome } from "./settings-home";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";
import { SystemStatus } from "./system-status";
import { WorkspacesSettings } from "./workspaces-settings";
import { WorkspaceTeamSettings } from "./workspace-team-settings";
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Settings" };

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
  const activeLabel = SETTINGS_SECTIONS.find((section) => section.id === active)?.label ?? "Settings";

  const ctx = isSupabaseAdminConfigured() ? await getCurrentWorkspaceContext().catch(() => null) : null;
  const connectors = ctx?.workspaceId
    ? await listWorkspaceConnectors(getSupabaseAdminClient(), ctx.workspaceId)
    : [];

  return (
    <WorkbenchFrame
      eyebrow="Settings"
        title="Settings"
      description="Everything that configures this workspace, in one place. Connections and outbound execution stay locked until configured and approved."
      aside={<SettingsAdminDossier activeLabel={activeLabel} />}
    >
      <MetricBand>
        <MetricCell label="Sections" value={SETTINGS_SECTIONS.length} />
        <MetricCell label="Active" value={activeLabel} tone="accent" />
        <MetricCell label="Outbound locks" value="On" tone="ok" />
      </MetricBand>
      <div className="w-full">
        <SettingsShell
          active={active}
          panels={{
            home: <SettingsHome />,
            general: <GeneralSettings />,
            workspaces: <WorkspacesSettings />,
            branding: <BrandingSettings />,
            appearance: <AppearanceSettings />,
            behavior: <AgentBehaviorSettings />,
            media: <MediaModelsSettings />,
            workspace: <WorkspaceTeamSettings />,
            account: <AccountSettings />,
            connections: (
              <>
                <ConnectionsPanel />
                <ConnectorsPanel connectors={connectors} />
              </>
            ),
            agent: <AgentPanel />,
            notifications: <NotificationSettings />,
            system: <SystemStatus />,
          }}
        />
      </div>
    </WorkbenchFrame>
  );
}

function SettingsAdminDossier({ activeLabel }: { activeLabel: string }) {
  return (
    <DossierPanel title="Admin posture">
      <div className="space-y-4">
        <div>
          <div className="signal-eyebrow">Current section</div>
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{activeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DossierStat label="Sections" value={SETTINGS_SECTIONS.length} />
          <DossierStat label="Locks" value="On" tone="ok" />
        </div>
        <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="signal-eyebrow">Operating rule</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">
            Keep outbound execution gated until the relevant connection and operator approval are both present.
          </p>
        </div>
        <div className="rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
          <div className="signal-eyebrow text-[var(--accent-contrast)]">Next best action</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">
            Review system status after changing tokens, workspace branding, or Arc behavior.
          </p>
        </div>
      </div>
    </DossierPanel>
  );
}

function DossierStat({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "ok";
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className={`font-display text-xl font-semibold tabular-nums ${tone === "ok" ? "text-[var(--ok-text)]" : "text-[var(--text-primary)]"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
