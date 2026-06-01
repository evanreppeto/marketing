import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, StatusPill, buttonClasses } from "../_components/page-header";
import { DetailStack, MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import {
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
  workspaceTools,
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
  "export-data": "Preview: export runs once the data pipeline and storage are connected.",
  "edit-guardrail": "Preview: guardrails stay locked until the approval pipeline can record changes.",
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const selectedLevel = getValue(query.level) ?? markCurrentAutonomyLevel;
  const activeLevel = markAutonomyLevels.find((level) => level.level === selectedLevel) ?? markAutonomyLevels[1];
  const persistenceConnected = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <AppShell active="/settings">
      <WorkspaceHeader
        eyebrow="Operating controls"
        title="The rules Mark must operate inside."
        description="Settings are not decoration anymore. This page groups approval policy, autonomy, guardrails, scoring, data health, and integrations around the way the Hermes Growth Engine actually works."
        status={persistenceConnected ? "Live config source" : "Local preview"}
        statusTone={persistenceConnected ? "green" : "amber"}
        primary={{ label: "Review approvals", href: "/approvals" }}
        secondary={{ label: "Open Mark", href: "/agent-operations" }}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <MetricStrip
        metrics={[
          { label: "Autonomy", value: `L${activeLevel.level}`, detail: activeLevel.name, tone: "blue" },
          { label: "Human gate", value: "On", detail: "Outbound approval required", tone: "green" },
          { label: "Dispatch", value: "Locked", detail: "No send, publish, launch, or spend", tone: "amber" },
          { label: "Supabase", value: persistenceConnected ? "Live" : "Preview", detail: persistenceConnected ? "Admin env connected" : "Persistence not configured", tone: persistenceConnected ? "green" : "amber" },
        ]}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Autonomy levels"
            title="How much Mark can do"
            description="MVP behavior stays around draft and human-approval-required modes. Internal data work can become more automatic later."
          >
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              {markAutonomyLevels.map((level) => {
                const isActive = level.level === activeLevel.level;
                return (
                  <Link
                    key={level.level}
                    href={`/settings?level=${level.level}&action=set-level`}
                    className={`rounded-xl border p-4 transition ${
                      isActive
                        ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:bg-[var(--surface-raised)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-[var(--accent)]">L{level.level}</span>
                      {isActive ? <StatusPill tone={level.tone}>Selected</StatusPill> : null}
                    </div>
                    <div className="mt-3 text-sm font-bold text-[var(--text-primary)]">{level.name}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{level.summary}</p>
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4 text-sm leading-6 text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)]">Current policy: L{activeLevel.level} / {activeLevel.name}. </span>
              {activeLevel.detail}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Approval rules"
            title="What requires a human"
            description="These rules keep Mark useful without letting the agent accidentally become an outbound automation system."
          >
            <div className="divide-y divide-[var(--border-hairline)]">
              {[
                ["Outbound communication", "Required", "Emails, SMS, social posts, ads, landing pages, and sequences need approval before dispatch."],
                ["Spend or budget change", "Required", "No launch, budget shift, or platform spend without an owner decision."],
                ["Lead enrichment", "Internal allowed", "Record cleanup, dedupe, scoring, and classification can be prepared as internal work."],
                ["Guardrail failures", "Blocked", "Risky language needs revision before it can be approved."],
              ].map(([label, state, detail]) => (
                <ControlRow key={label} label={label} state={state} detail={detail} />
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Brand and guardrails"
            title="Safety controls"
            description="Rules Mark must respect while drafting restoration marketing."
          >
            <div className="divide-y divide-[var(--border-hairline)]">
              {markControlGroups.flatMap((group) =>
                group.rows.map(([label, state, detail]) => <ControlRow key={`${group.title}-${label}`} label={label} state={state} detail={detail} />),
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Scoring weights"
            title="How leads move up the queue"
            description="These are the explainable inputs that should shape Mark's lead and partner prioritization."
          >
            <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5">
                <div className="signal-eyebrow">Example lead score</div>
                <div className="mt-4 font-mono text-6xl font-black tracking-[-0.08em] text-[var(--text-primary)]">{exampleScore.leadScore}</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Standing water, photo upload, and partner context.</p>
              </div>
              <div className="grid gap-2">
                {[...exampleScoreBreakdown.lead, ...exampleScoreBreakdown.partner, ...scoreRules].slice(0, 10).map((item) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5" key={item.label}>
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{item.label}</div>
                      {"note" in item ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.note}</p> : null}
                    </div>
                    <div className="text-right font-mono text-sm font-bold text-[var(--accent)]">+{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Routing and queues" title="Where records go">
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <ControlList title="Default queues" rows={defaultQueues.map((queue) => [queue.queue, queue.sla, queue.handles])} />
              <ControlList title="Routing rules" rows={routingRules.map((rule) => [rule.rule, rule.status, `${rule.condition} / ${rule.target}`])} />
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Data health" title="Integrity scans and retention">
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <ControlList title="Integrity scans" rows={integrityScannerRules.map((rule) => [rule.rule, rule.status, `${rule.searches} / ${rule.cadence}`])} />
              <ControlList title="Retention" rows={retentionOptions.map((option) => [option.label, option.value, option.detail])} />
            </div>
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <WorkspacePanel eyebrow="Safety summary" title="Outbound locked" description="This is the default operating state until explicit approval is recorded.">
            <DetailStack
              items={[
                { label: "Approval gate", value: "Human approval required" },
                { label: "Current autonomy", value: `Level ${activeLevel.level} / ${activeLevel.name}` },
                { label: "Lead API", value: `${leadIngestionEndpoint.method} ${leadIngestionEndpoint.path}` },
                { label: "Persistence", value: persistenceConnected ? "Supabase connected" : "Preview only" },
              ]}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Connected systems" title="Tools Mark can reference">
            <div className="divide-y divide-[var(--border-hairline)]">
              {workspaceTools.map((tool) => (
                <div className="px-5 py-3" key={tool.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{tool.name}</div>
                      <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{tool.purpose}</p>
                    </div>
                    <Link href={`/settings?action=connect-tool&tool=${tool.key}`} className="shrink-0 text-xs font-bold text-[var(--accent)]">
                      {tool.embed}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Notifications" title="Operator alerts">
            <div className="divide-y divide-[var(--border-hairline)]">
              {notificationPreferences.map((pref) => (
                <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3" key={pref.event}>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)]">{pref.event}</div>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{pref.detail}</p>
                  </div>
                  <Link
                    href={`/settings?action=toggle-notification&event=${encodeURIComponent(pref.event)}`}
                    aria-label={`Toggle ${pref.event}`}
                    className={`h-fit rounded-md border px-2 py-1 text-xs font-bold ${
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
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Audit" title="Data export">
            <div className="p-4">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">Exports should include decisions, agent tasks, approval items, CRM records, and guardrail results.</p>
              <Link href="/settings?action=export-data" className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-4 w-full" })}>
                Export data
              </Link>
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

function ControlRow({ label, state, detail }: { label: string; state: string; detail: string }) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[210px_130px_minmax(0,1fr)]">
      <div className="font-bold text-[var(--text-primary)]">{label}</div>
      <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{state}</div>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

function ControlList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">{title}</div>
      <div className="divide-y divide-[var(--border-hairline)]">
        {rows.map(([label, state, detail]) => (
          <div className="px-4 py-3" key={`${title}-${label}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-[var(--text-primary)]">{label}</div>
              <span className="text-xs font-bold text-[var(--accent)]">{state}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
