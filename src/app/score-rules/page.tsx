import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { exampleScore, routingRules, scoreRules } from "../_data/growth-engine";

const settingGroups = [
  {
    title: "Mark autonomy",
    description: "The MVP posture: Mark can draft and write internal records, but outbound action stays locked.",
    badge: "Level 2",
    tone: "blue" as const,
    rows: [
      ["Internal enrichment", "Allowed", "Deduplicate, classify personas, score leads, and add audit notes."],
      ["Draft generation", "Allowed", "Create campaign ideas, copy, lead lists, and approval cards."],
      ["Outbound execution", "Blocked", "No email, SMS, posting, ads, or spend changes without approval."],
    ],
  },
  {
    title: "Approval requirements",
    description: "Every agent-created item that could leave the system becomes reviewable first.",
    badge: "Human gate",
    tone: "green" as const,
    rows: [
      ["Campaign assets", "Required", "Email, SMS, ads, landing copy, social posts, and scripts."],
      ["Lead lists", "Required", "Bulk outreach audiences and partner recommendations."],
      ["Budget or dispatch", "Blocked", "Future controls only after account integrations exist."],
    ],
  },
  {
    title: "Guardrail scope",
    description: "Rules that prevent risky language and off-scope campaigns before review.",
    badge: "Active",
    tone: "amber" as const,
    rows: [
      ["Coverage language", "Blocked", "No claim approval, payout, or insurance-will-cover promises."],
      ["Restoration focus", "Water first", "Flood, backup, burst pipe, standing water, mold, sewage, fire."],
      ["Exterior-only work", "Blocked", "Hail-only, wind-only, and roof-only campaigns stay out of scope."],
    ],
  },
];

const settingsAreas = [
  ["Data foundation", "Ready", "Inspect table health and missing CRM fields."],
  ["Reports", "Planned", "Review attribution and future outcome loops."],
  ["Lead intake", "Mapped", "Check incoming lead validation rules."],
  ["Loss routing", "Active", "Review target and non-target loss handling."],
];

export default function ScoreRulesPage() {
  return (
    <AppShell active="/score-rules">
      <PageHeader
        eyebrow="Settings"
        title="Mark controls, scoring, and safety rules"
        description="This is the control surface for how much Mark can do, what requires approval, and how lead priority is explained."
        aside={<StatusPill tone="blue">Backend-first settings</StatusPill>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {settingGroups.map((group, groupIndex) => (
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
        </div>

        <aside className="space-y-4">
          <Panel className="module-rise p-0 [animation-delay:80ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Lead scoring</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Bounded 0 to 100, always explainable.</p>
            </div>
            <div className="px-5 py-5">
              <div className="font-mono text-[56px] font-semibold leading-none tracking-[-0.06em]">
                <CountUp value={exampleScore.leadScore} />
              </div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">Example score from standing water, photo upload, and partner context.</div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]">
              {[
                ["Partner", exampleScore.partnerScore],
                ["Max", 100],
              ].map(([label, value]) => (
                <div className="px-5 py-4" key={label}>
                  <div className="text-xs text-[var(--text-muted)]">{label}</div>
                  <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:110ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Configuration areas</h2>
            <div className="mt-4 grid gap-2">
              {settingsAreas.map(([label, state, detail]) => (
                <article className="settings-action" key={label}>
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{detail}</span>
                  </span>
                  <span className="rounded-full border border-[var(--border-hairline)] px-2 py-1 text-xs font-semibold text-[var(--chicago-blue-soft)]">{state}</span>
                </article>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="module-rise p-0 [animation-delay:150ms]">
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

        <Panel className="module-rise p-0 [animation-delay:180ms]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing rules</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">How priority score translates into team action.</p>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {routingRules.slice(0, 5).map((rule) => (
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
      </div>

    </AppShell>
  );
}
