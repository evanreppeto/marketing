import { resolveAgentConnection } from "@/lib/agent/connection";
import { hasActiveAgentTokens } from "@/lib/agent/tokens";
import { getConnections } from "@/lib/connections/read-model";
import { getAgentName } from "@/lib/settings/agent-name";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type ThemeTone } from "../_components/theme";
import { SettingRow } from "./setting-row";
import { SettingsSection } from "./settings-section";

const isSet = (name: string) => Boolean(process.env[name]?.trim());

function pill(ok: boolean, onText = "Connected", offText = "Not configured"): { tone: ThemeTone; text: string } {
  return ok ? { tone: "green", text: onText } : { tone: "gray", text: offText };
}

/**
 * Read-only health dashboard for the app's integrations. Reflects env presence and
 * computed connection state — the "is everything connected and working" view. No
 * persistence; nothing here changes state.
 */
export async function SystemStatus() {
  const connections = await getConnections();
  const agentConnection = await resolveAgentConnection();
  const agentName = await getAgentName();
  const resend = connections.find((connection) => connection.provider === "resend");
  const social = connections.filter((connection) => connection.kind === "social");
  const socialConnected = social.filter((connection) => connection.status === "connected").length;
  const webhookLive = Boolean(agentConnection.webhookUrl) && agentConnection.enabled;
  const dbTokenConfigured = isSupabaseAdminConfigured() ? await hasActiveAgentTokens(getSupabaseAdminClient()).catch(() => false) : false;
  const agentApiConfigured = isSet("ARC_AGENT_API_TOKEN") || dbTokenConfigured;

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Live configuration and connection health across the app's integrations."
      title="System status"
    >
      <div className="divide-y divide-[var(--border-hairline)]">
        <SettingRow
          detail="Persistence for CRM, campaigns, approvals, and connections."
          label="Database (Supabase)"
          pill={pill(isSupabaseAdminConfigured(), "Configured")}
        />
        <SettingRow
          detail={`Bearer token ${agentName} uses to reach the /api/v1/arc/* control-plane API.`}
          label={`${agentName} agent API`}
          pill={pill(agentApiConfigured, "Configured")}
        />
        <SettingRow
          detail={`Event-driven wake for ${agentName} chat — URL configured and the operator switch on.`}
          label={`${agentName} webhook`}
          pill={pill(webhookLive, "Active", "Off")}
        />
        <SettingRow
          detail={resend?.status === "connected" ? "Enabled and ready to send." : "Set RESEND_API_KEY and enable in Connections."}
          label="Email (Resend)"
          pill={pill(resend?.status === "connected", "Connected")}
        />
        <SettingRow
          detail="Social providers with all required credentials present and enabled."
          label="Social providers"
          pill={
            socialConnected > 0
              ? { tone: "green", text: `${socialConnected}/${social.length} connected` }
              : { tone: "gray", text: `0/${social.length} connected` }
          }
        />
        <SettingRow
          detail="Requires operator sign-in on every page route when enabled."
          label="Operator access gate"
          pill={isSet("OPERATOR_ACCESS_TOKEN") ? { tone: "green", text: "Enabled" } : { tone: "amber", text: "Open (dev)" }}
        />
      </div>
    </SettingsSection>
  );
}
