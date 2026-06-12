import { headers } from "next/headers";

import { resolveAgentConnection, type FieldSource } from "@/lib/agent/connection";
import { getCreativeToolRecommendations, getMarketingPromptTemplates } from "@/lib/agent/marketing-guidance";
import { listAgentTokens, type AgentTokenSummary } from "@/lib/agent/tokens";
import { resolveAppBaseUrl } from "@/lib/deployment/app-url";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { Button, StatusPill } from "../_components/page-header";
import { testAgentConnectionAction } from "../mark/actions";
import { AgentSetupBundle, AgentTestButton, AgentTokenIssue, CopyPromptButton } from "./agent-panel.client";
import {
  type GenerateSetupBundleResult,
  generateAgentSetupBundleAction,
  issueAgentTokenAction,
  revokeAgentTokenAction,
  saveAgentConnectionAction,
  setWebhookSecretAction,
} from "./agent-actions";
import { SettingsSection } from "./settings-section";

const FIELD =
  "min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

function fmt(value: string | null) {
  return value ? value.replace("T", " ").slice(0, 16) : "Never";
}

function EnvBadge({ source }: { source: FieldSource }) {
  return source === "env" ? (
    <span className="ml-2 rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
      overridden by env
    </span>
  ) : null;
}

function AfterSetupGuidance() {
  const prompts = getMarketingPromptTemplates();
  const creativeTools = getCreativeToolRecommendations();

  return (
    <div className="grid gap-4 px-5 py-4">
      <div className="grid gap-2">
        <div className="text-sm font-bold text-[var(--text-primary)]">After Hermes is connected</div>
        <p className="max-w-[78ch] text-xs leading-5 text-[var(--text-muted)]">
          The setup bundle already gives Hermes the main marketing instructions. These are optional shortcuts you can
          copy later when you want Hermes to focus on a specific job.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {prompts.map((prompt) => (
          <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={prompt.id}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{prompt.title}</div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{prompt.summary}</p>
            </div>
            <CopyPromptButton copiedLabel="Copied" label="Copy" text={prompt.prompt} />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
        <div>
          <div className="text-sm font-bold text-[var(--text-primary)]">Optional image and design tools</div>
          <p className="mt-1 max-w-[78ch] text-xs leading-5 text-[var(--text-muted)]">
            Hermes does not need these to connect. Add one later only when you want help creating, editing, or preparing
            visuals for approval.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {creativeTools.map((tool) => (
            <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={tool.id}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{tool.title}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{tool.bestFor}</p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{tool.setupHint}</p>
              </div>
              <CopyPromptButton copiedLabel="Copied" label="Copy" text={tool.prompt} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SetupGuide({
  appBaseUrl,
  agentName,
  generateBundleAction,
}: {
  appBaseUrl: string;
  agentName: string;
  generateBundleAction?: (formData: FormData) => Promise<GenerateSetupBundleResult>;
}) {
  return (
    <div className="grid gap-4 px-5 py-4">
      <div className="grid gap-2">
        <div className="text-sm font-bold text-[var(--text-primary)]">Connect Hermes</div>
        <p className="max-w-[76ch] text-xs leading-5 text-[var(--text-muted)]">
          The easiest path is one setup bundle. The app creates a fresh token, webhook secret, Hermes prompt, env snippet,
          and verification message. You copy the generated prompt into Hermes; nothing is sent to Hermes automatically.
        </p>
      </div>

      <div className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-muted)] sm:grid-cols-3">
        <div>
          <div className="font-bold text-[var(--text-primary)]">This workspace URL</div>
          <div className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">{appBaseUrl}</div>
        </div>
        <div>
          <div className="font-bold text-[var(--text-primary)]">What the button creates</div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Token, secret, prompt, env, verification</div>
        </div>
        <div>
          <div className="font-bold text-[var(--text-primary)]">What you do next</div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Copy the prompt into Hermes</div>
        </div>
      </div>

      {generateBundleAction ? (
        <AgentSetupBundle action={generateBundleAction} agentName={agentName} appBaseUrl={appBaseUrl} />
      ) : (
        <div className="rounded-md border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-3 py-2 text-xs leading-5 text-[var(--warn-text)]">
          Connect Supabase admin env vars before generating setup bundles in the app. Env-only Hermes connections can
          still use <code className="font-mono">HERMES_AGENT_API_TOKEN</code>.
        </div>
      )}
    </div>
  );
}

function TokenRow({ token }: { token: AgentTokenSummary }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">{token.prefix}...</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <span>{token.label ?? "Unlabeled token"}</span>
          <span>Created: {fmt(token.createdAt)}</span>
          <span>Last used: {fmt(token.lastUsedAt)}</span>
          {token.revokedAt ? <span className="text-[var(--priority-text)]">Revoked: {fmt(token.revokedAt)}</span> : null}
        </div>
      </div>
      {!token.revokedAt ? (
        <form action={revokeAgentTokenAction}>
          <input name="id" type="hidden" value={token.id} />
          <Button size="sm" type="submit" variant="ghost">
            Revoke
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export async function AgentPanel() {
  const appBaseUrl = resolveAppBaseUrl(await headers());

  if (!isSupabaseAdminConfigured()) {
    return (
      <SettingsSection
        description="Connect Supabase before managing app-issued agent tokens and webhook settings. Env-only deployments still work."
        id="agent"
        title="Agent"
      >
        <div className="-mx-5 -my-4 divide-y divide-[var(--border-hairline)]">
          <SetupGuide agentName="Hermes" appBaseUrl={appBaseUrl} />
          <div className="px-5 py-4">
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              The app will read MARK_DISPLAY_NAME, MARK_AGENT_KEY, MARK_RUNNER_URL, MARK_WEBHOOK_URL,
              MARK_WEBHOOK_SECRET, and HERMES_AGENT_API_TOKEN from the environment until Supabase is configured.
            </p>
          </div>
        </div>
      </SettingsSection>
    );
  }

  const connection = await resolveAgentConnection();
  let tokens: AgentTokenSummary[] = [];
  let tokenError: string | null = null;
  try {
    tokens = await listAgentTokens();
  } catch (error) {
    tokenError = error instanceof Error ? error.message : "Could not load agent tokens.";
  }

  const healthTone = connection.health.lastStatus === "ok" ? "green" : connection.health.lastStatus ? "amber" : "gray";

  return (
    <SettingsSection
      bodyClassName="p-0"
      description="Register the agent port other Hermes-compatible workers use to read tasks, return drafts, and wake on new operator messages."
      id="agent"
      title="Agent"
      actions={
        <StatusPill tone={healthTone}>
          {connection.health.lastStatus ?? "Untested"}
        </StatusPill>
      }
    >
      <div className="grid gap-0 divide-y divide-[var(--border-hairline)]">
        <SetupGuide
          agentName={connection.displayName}
          appBaseUrl={appBaseUrl}
          generateBundleAction={generateAgentSetupBundleAction}
        />
        <AfterSetupGuidance />

        <details className="px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">
            Advanced connection controls
          </summary>
          <div className="mt-4 grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Connection status</div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                Last seen: {fmt(connection.health.lastSeenAt)}
                {connection.health.lastError ? `; last error: ${connection.health.lastError}` : ""}
              </p>
              <div className="mt-3">
                <AgentTestButton action={testAgentConnectionAction} />
              </div>
            </div>

            <form action={saveAgentConnectionAction} className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-muted)]">
                  Display name <EnvBadge source={connection.source.displayName} />
                  <input className={FIELD} defaultValue={connection.displayName} name="display_name" />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-muted)]">
                  Agent key <EnvBadge source={connection.source.agentKey} />
                  <input className={FIELD} defaultValue={connection.agentKey} name="agent_key" />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-muted)]">
                Webhook URL <EnvBadge source={connection.source.webhookUrl} />
                <input className={FIELD} defaultValue={connection.webhookUrl ?? ""} name="webhook_url" placeholder="https://agent.example/webhooks/growth-chat" />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <input defaultChecked={connection.enabled} name="enabled" type="checkbox" />
                  Wake this agent on new operator messages
                </label>
                <Button size="sm" type="submit" variant="primary">
                  Save agent
                </Button>
              </div>
            </form>

            <form action={setWebhookSecretAction} className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-[var(--text-muted)]">
                Set or rotate signing secret
                <input className={FIELD} name="secret" placeholder="shared HMAC secret" type="password" />
              </label>
              <Button size="sm" type="submit" variant="ghost">
                Save secret
              </Button>
            </form>

            <div className="grid gap-3">
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">Manual API tokens</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Use this only if you need to issue or revoke tokens outside the guided setup bundle.
                </p>
              </div>
              <AgentTokenIssue action={issueAgentTokenAction} />
              {tokenError ? <p className="text-xs font-semibold text-[var(--priority-text)]">{tokenError}</p> : null}
            </div>

            <ul className="divide-y divide-[var(--border-hairline)] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
              {tokens.length > 0 ? (
                tokens.map((token) => <TokenRow key={token.id} token={token} />)
              ) : (
                <li className="px-5 py-4 text-sm text-[var(--text-muted)]">No app-issued tokens yet.</li>
              )}
            </ul>
          </div>
        </details>
      </div>
    </SettingsSection>
  );
}
