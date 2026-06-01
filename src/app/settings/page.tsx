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

const PANEL = "module-rise overflow-hidden p-0";

const sectionKeys = settingsSections.map((section) => section.key);

function isSectionKey(value: string | undefined): value is SettingsSectionKey {
  return value !== undefined && (sectionKeys as readonly string[]).includes(value);
}

/** Inset panel header — the surface step (panel → inset) is what makes each
 *  module read as its own instrument instead of one continuous slab. */
function PanelHead({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const sectionParam = getValue(query.section);
  const activeSection: SettingsSectionKey = isSectionKey(sectionParam) ? sectionParam : "mark";
  const selectedLevel = getValue(query.level) ?? markCurrentAutonomyLevel;
  const activeIndex = settingsSections.findIndex((section) => section.key === activeSection);
  const activeMeta = settingsSections[activeIndex];

  const persistenceConnected = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  return (
    <AppShell active="/settings">
      <PageHeader
        eyebrow="Settings"
        title={activeMeta.headline}
        description={activeMeta.detail}
        aside={
          <StatusPill tone="blue">
            Section 0{activeIndex + 1} / 0{settingsSections.length}
          </StatusPill>
        }
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="xl:sticky xl:top-5 xl:self-start">
          <p className="signal-eyebrow mb-2.5 flex items-center gap-2 px-1">
            <span aria-hidden="true" className="h-2.5 w-0.5 rounded-full bg-[var(--accent)]" />
            Sections
          </p>
          <ul className="grid gap-1.5">
            {settingsSections.map((section, index) => {
              const isActive = section.key === activeSection;
              return (
                <li key={section.key}>
                  <Link
                    href={`/settings?section=${section.key}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`group block rounded-lg border px-3.5 py-3 transition ${
                      isActive
                        ? "border-[oklch(0.74_0.115_232/0.45)] bg-[var(--accent-soft)] shadow-[var(--elev-panel)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`font-mono text-[11px] font-semibold tabular-nums ${
                          isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        0{index + 1}
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {section.label}
                      </span>
                      {isActive ? (
                        <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)] status-breathe" />
                      ) : null}
                    </span>
                    <span className="mt-1 block pl-[26px] text-xs leading-5 text-[var(--text-muted)]">{section.detail}</span>
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
      <Panel className={PANEL}>
        <PanelHead
          title="Autonomy level"
          description="How far Mark can act on its own. Outbound always stays behind a human gate."
          aside={<StatusPill tone="blue">Current · Level {markCurrentAutonomyLevel}</StatusPill>}
        />

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
                    : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
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

        <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">
              L{activeLevel.level} · {activeLevel.name}.{" "}
            </span>
            {activeLevel.detail}
          </p>
        </div>
      </Panel>

      {markControlGroups.map((group, groupIndex) => (
        <Panel className={PANEL} key={group.title}>
          <PanelHead
            title={group.title}
            description={group.description}
            aside={
              <div className="flex items-center gap-2.5">
                <StatusPill tone={group.tone}>{group.badge}</StatusPill>
                <span className="font-mono text-xs text-[var(--text-muted)]">0{groupIndex + 1}</span>
              </div>
            }
          />
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
      <Panel className={PANEL}>
        <PanelHead
          title="Persistence"
          description="Supabase admin client, lazily created from environment."
          aside={
            <StatusPill tone={persistenceConnected ? "green" : "amber"}>
              {persistenceConnected ? "Connected" : "Not configured"}
            </StatusPill>
          }
        />
        <div className="px-5 py-4 text-sm leading-6 text-[var(--text-secondary)]">
          {persistenceConnected
            ? "Supabase is configured. Accepted leads persist and the ingest API can return 201."
            : "Without NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, the app still validates and scores leads but returns 202 with persistence not connected."}
        </div>
      </Panel>

      <Panel className={PANEL}>
        <PanelHead
          title="Lead ingestion API"
          description={leadIngestionEndpoint.description}
          aside={
            <span className="token-value rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[var(--chicago-blue-soft)]">
              {leadIngestionEndpoint.method} {leadIngestionEndpoint.path}
            </span>
          }
        />
        <div className="divide-y divide-[var(--border-hairline)]">
          {leadIngestionEndpoint.responses.map(([code, meaning]) => (
            <div className="grid gap-3 px-5 py-3 md:grid-cols-[80px_1fr]" key={code}>
              <div className="font-mono text-sm font-semibold text-[var(--text-primary)]">{code}</div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{meaning}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={PANEL}>
        <PanelHead title="Connected tools" description="Workspace tools Mark and the operator launch into." />
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
                className="shrink-0 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--chicago-blue-soft)] transition hover:border-[var(--border-strong)]"
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
      <Panel className={PANEL}>
        <PanelHead
          title="Business profile"
          description="Identity and scope the agent operates within."
          aside={
            <Link href="/settings?section=access&action=edit-profile" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Edit
            </Link>
          }
        />
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

      <Panel className={PANEL}>
        <PanelHead
          title="Team & roles"
          description="Who can see and act on operator surfaces."
          aside={
            <Link href="/settings?section=access&action=manage-team" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Manage
            </Link>
          }
        />
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

      <Panel className={PANEL}>
        <PanelHead title="Default queues" description="Where routed leads land and the response target." />
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

      <Panel className={PANEL}>
        <PanelHead title="Notifications" description="What the operator gets pinged about." />
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
      <Panel className={PANEL}>
        <PanelHead title="Lead scoring" description="Bounded 0 to 100, always explainable." />
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

      <Panel className={PANEL}>
        <PanelHead title="Signal weights" description="Plain-language inputs that move a lead up the queue." />
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

      <Panel className={PANEL}>
        <PanelHead title="Routing rules" description="How priority score translates into team action." />
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
      <Panel className={PANEL}>
        <PanelHead
          title="Customer types"
          description={`The ${customerTypes.length} approved personas leads route to.`}
          aside={
            <Link href="/customer-types" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Manage personas
            </Link>
          }
        />
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {customerTypes.map((type) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5" key={type.key}>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{type.label}</span>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">{type.group}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={PANEL}>
        <PanelHead title="Integrity scans" description="Automated data-health rules and their cadence." />
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

      <Panel className={PANEL}>
        <PanelHead title="Retention & export" description="How long records are kept and how to pull them out." />
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
        <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4">
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
