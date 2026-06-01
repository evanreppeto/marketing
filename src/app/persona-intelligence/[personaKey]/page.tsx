import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, buttonClasses, PageHeader, Panel, StatusPill } from "../../_components/page-header";
import {
  competitorSoftwareReferences,
  crmPersonaSnapshots,
  leadEngagementEvents,
  leadNextBestActions,
  personaAccelerationPlaybooks,
  personaContentSignals,
  personaTrackerRows,
  promptGuardrails,
} from "../../_data/growth-engine";

type PersonaProfilePageProps = {
  params: Promise<{ personaKey: string }>;
  searchParams?: Promise<{ action?: string | string[]; view?: string | string[] }>;
};

export function generateStaticParams() {
  return personaTrackerRows.map((persona) => ({ personaKey: persona.key }));
}

export default async function PersonaProfilePage({ params, searchParams }: PersonaProfilePageProps) {
  const { personaKey } = await params;
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const returnView = getValue(query.view) ?? "all-personas";
  const persona = personaTrackerRows.find((row) => row.key === personaKey);

  if (!persona) {
    notFound();
  }

  const snapshot = crmPersonaSnapshots[persona.crmPath.split("/").at(-1) ?? ""] ?? crmPersonaSnapshots["basement-flooding"];
  const relatedSignals = personaContentSignals.filter(
    (signal) =>
      signal.source.toLowerCase().includes(persona.persona.toLowerCase().split(" ")[0]) ||
      signal.engineUse.toLowerCase().includes(persona.segment.toLowerCase()) ||
      signal.engineUse.toLowerCase().includes(persona.persona.toLowerCase().split(" ")[0]),
  );
  const visibleSignals = relatedSignals.length > 0 ? relatedSignals : personaContentSignals.slice(0, 2);

  return (
    <AppShell active="/persona-intelligence">
      <PageHeader
        eyebrow="Persona Profile"
        title={persona.persona}
        description={`${persona.stage} · ${persona.intent}`}
        aside={<StatusPill tone={persona.tone}>{persona.score}/100</StatusPill>}
      />

      <ActionFeedback
        action={action}
        messages={{
          "generate-content-brief": `Content brief generation requires the live Hermes workflow for ${persona.persona}.`,
          "create-acceleration-plan": `Acceleration plans require the live persona workflow for ${persona.persona}.`,
          "sync-ai-studio": "Campaign handoff requires a persisted campaign record.",
        }}
      />

      <Panel className="module-rise p-0 [animation-delay:70ms]">
        <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-5 md:border-b-0 md:border-r">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Next action
            </div>
            <div className="mt-2 text-lg font-semibold leading-snug text-[var(--text-primary)]">
              {persona.nextAction}
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--chicago-blue-soft)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              Recommended
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--border-hairline)]">
            {[
              ["Stage", persona.stage],
              ["Blocker", persona.blocker],
              ["Offer", persona.offer],
            ].map(([label, value]) => (
              <div className="px-4 py-4" key={label}>
                <div className="text-xs text-[var(--text-muted)]">{label}</div>
                <div className="mt-1.5 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Hyper-persona snapshot</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">The current operating profile for this persona.</p>
                </div>
                <StatusPill tone={persona.tone}>{snapshot.confidence}</StatusPill>
              </div>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-[var(--border-hairline)] p-5 lg:border-b-0 lg:border-r">
                <div className="signal-eyebrow">
                  {snapshot.basePersona}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{snapshot.nextBestAction}</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{snapshot.messagePosture}</p>
              </div>
              <div className="grid sm:grid-cols-2">
                {[
                  ["Relationship", snapshot.relationshipStage],
                  ["Value tier", snapshot.valueTier],
                  ["Loss pattern", snapshot.dominantLossPattern],
                  ["Preferred channel", snapshot.preferredChannel],
                  ["Recommended offer", snapshot.recommendedOffer],
                  ["Recent behavior", snapshot.recentBehavior],
                ].map(([label, value]) => (
                  <div className="min-w-0 border-b border-[var(--border-hairline)] p-4 even:sm:border-l" key={label}>
                    <div className="text-xs text-[var(--text-secondary)]">{label}</div>
                    <div className="token-value mt-1 font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:160ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Campaign intelligence</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">What this profile should feed into the marketing engine.</p>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              {visibleSignals.map((signal) => (
                <div className="border-b border-[var(--border-hairline)] p-5 md:border-r even:md:border-r-0" key={signal.signal}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{signal.signal}</h3>
                    <StatusPill tone={signal.priority === "High" ? "red" : "amber"}>{signal.priority}</StatusPill>
                  </div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{signal.source}</div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{signal.engineUse}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:200ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Engagement timeline</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Events that explain why this profile is recommended.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {leadEngagementEvents.map((event) => (
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-[120px_1fr]" key={event.event}>
                  <div className="text-sm font-semibold text-[var(--text-secondary)]">{event.time}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold">{event.event}</div>
                      <StatusPill tone="blue">{event.channel}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:140ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Profile actions
              </div>
            </div>
            <div className="space-y-2 px-5 py-4">
              <Link
                className={buttonClasses({ variant: "primary", className: "w-full" })}
                href={persona.aiStudioPath}
              >
                Build campaign content
              </Link>
              <div className="flex gap-2">
                <Link
                  className={buttonClasses({ variant: "ghost", size: "sm", className: "flex-1" })}
                  href={`/persona-intelligence/${persona.key}?action=create-acceleration-plan&view=${returnView}`}
                >
                  Create plan
                </Link>
                <Link
                  className={buttonClasses({ variant: "ghost", size: "sm", className: "flex-1" })}
                  href={persona.crmPath}
                >
                  Open CRM
                </Link>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:180ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Next best actions</h2>
            <div className="mt-5 space-y-3">
              {leadNextBestActions.map((item) => (
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={item.action}>
                  <div className="font-semibold">{item.action}</div>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{item.reason}</p>
                  <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{item.approval}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval guardrails</h2>
            <div className="mt-5 space-y-3">
              {promptGuardrails.slice(0, 4).map((guardrail, index) => (
                <div className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-6" key={guardrail}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-xs font-semibold text-[oklch(0.18_0.03_248)]">
                    {index + 1}
                  </div>
                  <div className="text-[var(--text-secondary)]">{guardrail}</div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <section className="module-rise mt-6 border-t border-[var(--border-hairline)] pt-6 [animation-delay:260ms]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Reference</div>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Playbooks &amp; software patterns
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
            <div className="border-b border-[var(--border-hairline)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Acceleration playbooks</h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Reusable moves this profile can trigger.</p>
            </div>
            <ul className="divide-y divide-[var(--border-hairline)]">
              {personaAccelerationPlaybooks.map((playbook) => (
                <li className="px-4 py-3" key={playbook.playbook}>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{playbook.playbook}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-muted)]">When </span>
                    {playbook.trigger}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-muted)]">Then </span>
                    {playbook.action}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
            <div className="border-b border-[var(--border-hairline)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Software patterns to borrow</h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">CRM &amp; campaign ideas relevant to this profile.</p>
            </div>
            <ul className="divide-y divide-[var(--border-hairline)]">
              {competitorSoftwareReferences.slice(0, 4).map((reference) => (
                <li className="px-4 py-3" key={reference.app}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{reference.app}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{reference.category}</div>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{reference.applyToGrowthEngine}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
