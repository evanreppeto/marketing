import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { ActionFeedback, buttonClasses, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  businessProfile,
  customerTypes,
  defaultQueues,
  exampleScore,
  exampleScoreBreakdown,
  integrityScannerRules,
  leadIngestionEndpoint,
  markAutonomyLevels,
  markControlGroups,
  markCurrentAutonomyLevel,
  notificationPreferences,
  retentionOptions,
  routingRules,
  scoreRules,
  settingsSections,
  teamMembers,
  workspaceTools,
  type SettingsSectionKey,
} from "../_data/growth-engine";

type SettingsPageProps = {
  searchParams?: Promise<{
    section?: string | string[];
    level?: string | string[];
    action?: string | string[];
  }>;
};

const actionMessages: Record<string, string> = {
  "set-level": "Preview: changing Mark's autonomy level requires the live agent-config pipeline.",
  "toggle-notification": "Preview: notification routing is saved once account settings persist.",
  "connect-tool": "Preview: tool connections require a configured integration.",
  "edit-profile": "Preview: business profile edits are saved once settings persistence is wired.",
  "manage-team": "Preview: team and role management requires the access-control backend.",
  "export-data": "Preview: export runs once the data pipeline and storage are connected.",
  "edit-guardrail": "Preview: guardrails stay locked until the approval pipeline can record changes.",
};

const sectionKeys = settingsSections.map((section) => section.key);

function isSectionKey(value: string | undefined): value is SettingsSectionKey {
  return value !== undefined && (sectionKeys as readonly string[]).includes(value);
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const sectionParam = getValue(query.section);
  const activeSection: SettingsSectionKey = isSectionKey(sectionParam) ? sectionParam : "mark";
  const selectedLevel = getValue(query.level) ?? markCurrentAutonomyLevel;

  const persistenceConnected = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  return (
    <AppShell active="/settings">
      <PageHeader
        eyebrow="Settings"
        title="Control panel for Mark, integrations, and the workspace"
        description="Configure how much the agent can do, what connects to the system, who has access, and how leads are scored and retained."
        aside={<StatusPill tone="blue">Backend-first controls</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid gap-4 xl:grid-cols-[224px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="xl:sticky xl:top-5 xl:self-start">
          <ul className="grid gap-1.5">
            {settingsSections.map((section) => {
              const isActive = section.key === activeSection;
              return (
                <li key={section.key}>
                  <Link
                    href={`/settings?section=${section.key}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`block rounded-lg border px-3.5 py-3 transition ${
                      isActive
                        ? "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className={`block text-sm font-semibold ${
                        isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {section.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{section.detail}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {activeSection === "mark" ? <MarkSection selectedLevel={selectedLevel} /> : null}
          {activeSection === "integrations" ? <IntegrationsSection persistenceConnected={persistenceConnected} /> : null}
          {activeSection === "access" ? <AccessSection /> : null}
          {activeSection === "scoring" ? <ScoringSection /> : null}
          {activeSection === "data" ? <DataSection /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function MarkSection({ selectedLevel }: { selectedLevel: string }) {
  const activeLevel = markAutonomyLevels.find((level) => level.level === selectedLevel) ?? markAutonomyLevels[1];

  return (
    <>
      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Autonomy level</h2>
            <StatusPill tone="blue">Current: Level {markCurrentAutonomyLevel}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            How far Mark can act on its own. Outbound always stays behind a human gate.
          </p>
        </div>

        <div className="grid gap-2 p-4 md:grid-cols-3">
          {markAutonomyLevels.map((level) => {
            const isActive = level.level === activeLevel.level;
            return (
              <Link
                key={level.level}
                href={`/settings?section=mark&level=${level.level}&action=set-level`}
                aria-current={isActive ? "true" : undefined}
                className={`block rounded-lg border p-3.5 transition ${
                  isActive
                    ? "border-[oklch(0.74_0.115_232/0.45)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-soft)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[var(--text-muted)]">L{level.level}</span>
                  {isActive ? <StatusPill tone={level.tone}>Selected</StatusPill> : null}
                </div>
                <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{level.name}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{level.summary}</p>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[var(--border-hairline)] px-5 py-4">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">L{activeLevel.level} · {activeLevel.name}. </span>
            {activeLevel.detail}
          </p>
        </div>
      </Panel>

      {markControlGroups.map((group, groupIndex) => (
        <Panel className="module-rise overflow-hidden p-0" key={group.title}>
          <div className="grid gap-4 border-b border-[var(--border-hairline)] px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">{group.title}</h2>
                <StatusPill tone={group.tone}>{group.badge}</StatusPill>
              </div>
              <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{group.description}</p>
            </div>
            <div className="font-mono text-xs text-[var(--text-muted)]">0{groupIndex + 1}</div>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {group.rows.map(([label, state, detail]) => (
              <div className="grid gap-3 px-5 py-4 md:grid-cols-[190px_120px_1fr]" key={label}>
                <div className="font-semibold">{label}</div>
                <div className="min-w-0">
                  <span className="token-value rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 font-mono text-xs font-semibold text-[var(--chicago-blue-soft)]">
                    {state}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}

function IntegrationsSection({ persistenceConnected }: { persistenceConnected: boolean }) {
  return (
    <>
      <Panel className="module-rise p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Persistence</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Supabase admin client, lazily created from environment.</p>
          </div>
          <StatusPill tone={persistenceConnected ? "green" : "amber"}>
            {persistenceConnected ? "Connected" : "Not configured"}
          </StatusPill>
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-[var(--text-secondary)]">
          {persistenceConnected
            ? "Supabase is configured. Accepted leads persist and the ingest API can return 201."
            : "Without NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, the app still validates and scores leads but returns 202 with persistence not connected."}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Lead ingestion API</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{leadIngestionEndpoint.description}</p>
          </div>
          <span className="token-value rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[var(--chicago-blue-soft)]">
            {leadIngestionEndpoint.method} {leadIngestionEndpoint.path}
          </span>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {leadIngestionEndpoint.responses.map(([code, meaning]) => (
            <div className="grid gap-3 px-5 py-3 md:grid-cols-[80px_1fr]" key={code}>
              <div className="font-mono text-sm font-semibold text-[var(--text-primary)]">{code}</div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{meaning}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Connected tools</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Workspace tools Mark and the operator launch into.</p>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {workspaceTools.map((tool) => (
            <div
              className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3"
              key={tool.key}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{tool.name}</div>
                <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{tool.purpose}</p>
              </div>
              <Link
                href={`/settings?section=integrations&action=connect-tool&tool=${tool.key}`}
                className="shrink-0 rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-semibold text-[var(--chicago-blue-soft)] transition hover:border-[var(--border-strong)]"
              >
                {tool.embed}
              </Link>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function AccessSection() {
  return (
    <>
      <Panel className="module-rise p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Business profile</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Identity and scope the agent operates within.</p>
          </div>
          <Link href="/settings?section=access&action=edit-profile" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Edit
          </Link>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {businessProfile.map((field) => (
            <div className="grid gap-2 px-5 py-4 md:grid-cols-[180px_1fr]" key={field.label}>
              <div className="text-sm text-[var(--text-muted)]">{field.label}</div>
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{field.value}</div>
                <p className="mt-0.5 text-sm leading-6 text-[var(--text-secondary)]">{field.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Team & roles</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Who can see and act on operator surfaces.</p>
          </div>
          <Link href="/settings?section=access&action=manage-team" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Manage
          </Link>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {teamMembers.map((member) => (
            <div className="flex items-center gap-3 px-5 py-3.5" key={member.name}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] font-display text-xs font-black text-[var(--accent)]">
                {member.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{member.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{member.role}</div>
              </div>
              <StatusPill tone={member.tone}>{member.access}</StatusPill>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Default queues</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Where routed leads land and the response target.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {defaultQueues.map((queue) => (
            <div className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px]" key={queue.queue}>
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{queue.queue}</div>
                <p className="mt-0.5 text-sm leading-6 text-[var(--text-secondary)]">{queue.handles}</p>
              </div>
              <div className="text-sm text-[var(--text-secondary)] md:text-right">{queue.sla}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Notifications</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">What the operator gets pinged about.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {notificationPreferences.map((pref) => (
            <div className="flex items-center gap-3 px-5 py-3.5" key={pref.event}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{pref.event}</div>
                <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{pref.detail}</p>
              </div>
              <div className="hidden text-xs text-[var(--text-muted)] sm:block">{pref.channel}</div>
              <Link
                href={`/settings?section=access&action=toggle-notification&event=${encodeURIComponent(pref.event)}`}
                aria-label={`Toggle ${pref.event}`}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  pref.state === "On"
                    ? "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.14)] text-[oklch(0.88_0.1_158)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
                }`}
              >
                {pref.state}
              </Link>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function ScoringSection() {
  return (
    <>
      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Lead scoring</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Bounded 0 to 100, always explainable.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[200px_1fr] md:items-center">
          <div>
            <div className="font-mono text-[56px] font-semibold leading-none tracking-[-0.06em]">
              <CountUp value={exampleScore.leadScore} />
            </div>
            <div className="mt-2 text-sm text-[var(--text-secondary)]">Example: standing water, photo upload, and partner context.</div>
          </div>
          <div className="grid gap-2">
            {[...exampleScoreBreakdown.lead, ...exampleScoreBreakdown.partner].map((item) => (
              <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2" key={item.label}>
                <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">+{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Signal weights</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Plain-language inputs that move a lead up the queue.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {scoreRules.map((rule) => (
            <div className="grid grid-cols-[64px_1fr] gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={rule.label}>
              <div className="inline-flex h-10 w-14 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--accent)] font-mono text-sm font-semibold tabular-nums text-[oklch(0.18_0.03_248)]">
                {rule.value}
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{rule.label}</div>
                <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{rule.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing rules</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">How priority score translates into team action.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {routingRules.map((rule) => (
            <div className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_140px_auto]" key={rule.rule}>
              <div>
                <div className="font-semibold">{rule.rule}</div>
                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{rule.condition}</p>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">{rule.target}</div>
              <StatusPill tone="green">{rule.status}</StatusPill>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function DataSection() {
  return (
    <>
      <Panel className="module-rise p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Customer types</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">The {customerTypes.length} approved personas leads route to.</p>
          </div>
          <Link href="/customer-types" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Manage personas
          </Link>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {customerTypes.map((type) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5" key={type.key}>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{type.label}</span>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">{type.group}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Integrity scans</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Automated data-health rules and their cadence.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {integrityScannerRules.map((rule) => (
            <div className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_140px_auto]" key={rule.rule}>
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{rule.rule}</div>
                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{rule.searches}</p>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">{rule.cadence}</div>
              <StatusPill tone="green">{rule.status}</StatusPill>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise p-0">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Retention & export</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">How long records are kept and how to pull them out.</p>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {retentionOptions.map((option) => (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={option.label}>
              <div className="min-w-0">
                <div className="font-semibold text-[var(--text-primary)]">{option.label}</div>
                <p className="mt-0.5 text-sm leading-6 text-[var(--text-secondary)]">{option.detail}</p>
              </div>
              <span className="token-value shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 font-mono text-xs font-semibold text-[var(--chicago-blue-soft)]">
                {option.value}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-hairline)] px-5 py-4">
          <Link href="/settings?section=data&action=export-data" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Export data
          </Link>
        </div>
      </Panel>
    </>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
