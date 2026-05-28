import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { LiveTime } from "../_components/live-time";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  competitorSoftwareReferences,
  crmPersonaSnapshots,
  leadEngagementEvents,
  leadNextBestActions,
  personaAccelerationPlaybooks,
  personaAccelerationStats,
  personaContentSignals,
  personaTrackerRows,
} from "../_data/growth-engine";

const viewOptions = [
  { key: "all-personas", label: "All personas" },
  { key: "ready-to-convert", label: "Ready to convert" },
  { key: "partner-candidates", label: "Partner candidates" },
  { key: "needs-content", label: "Needs content" },
];

export default async function PersonaIntelligencePage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; persona?: string | string[]; view?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const activePersonaKey = getValue(query.persona);
  const activeView = getValue(query.view) ?? "all-personas";
  const visiblePersonas = filterPersonas(activeView);
  const activePersona =
    visiblePersonas.find((persona) => persona.key === activePersonaKey) ??
    personaTrackerRows.find((persona) => persona.key === activePersonaKey) ??
    visiblePersonas[0] ??
    personaTrackerRows[0];
  const activeSnapshot = crmPersonaSnapshots[activePersona.crmPath.split("/").at(-1) ?? ""] ?? crmPersonaSnapshots["basement-flooding"];

  return (
    <AppShell active="/persona-intelligence">
      <PageHeader
        eyebrow="Persona Intelligence"
        title="Track who's ready and what they need next"
        description="One operating view across urgency, behavior, relationship value, and content needs."
        aside={<StatusPill tone="blue">Hyper-persona layer</StatusPill>}
      />

      <ActionFeedback
        action={action}
        messages={{
          "generate-content-brief": `Content brief previewed for ${activePersona.persona}. This will write to campaign assets after approvals exist.`,
          "create-acceleration-plan": `Acceleration plan previewed for ${activePersona.persona}. No CRM records were changed.`,
          "sync-ai-studio": "Persona intelligence feed previewed. Campaign records are not written yet.",
          "open-persona": `${activePersona.persona} is now selected. The snapshot and next actions are scoped to that persona.`,
        }}
      />

      {(() => {
        const [primary, ...supporting] = personaAccelerationStats;
        return (
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
              <div className="border-b border-[#eee8e1] px-5 py-5 md:border-b-0 md:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
                  {primary.label}
                </div>
                <div className="mt-2 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[#151515]">
                  <CountUp value={primary.value} />
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#cdddee] bg-[#f0f5fc] px-2 py-0.5 text-[11px] font-medium text-[#21558a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3877c1]" aria-hidden="true" />
                  {primary.delta}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#eee8e1]">
                {supporting.map((stat) => (
                  <div className="px-4 py-4" key={stat.label}>
                    <div className="text-xs text-[#7a736b]">{stat.label}</div>
                    <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-[-0.02em]">
                      <CountUp value={stat.value} />
                    </div>
                    <div className="mt-1.5 text-[11px] font-medium text-[#21558a]">{stat.delta}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        );
      })()}

      <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:110ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Persona tracker</h2>
              <p className="mt-1 text-sm text-[#6e6962]">
                The operating view for intent, blockers, acceleration paths, and campaign needs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {viewOptions.map((view) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    activeView === view.key
                      ? "border-[#151515] bg-[#151515] text-white"
                      : "border-[#ddd6cd] bg-white text-[#151515] hover:border-[#151515]"
                  }`}
                  href={`/persona-intelligence?view=${view.key}`}
                  key={view.key}
                >
                  {view.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-4 py-3">Stage &amp; intent</th>
                  <th className="px-4 py-3">Accelerator</th>
                  <th className="px-4 py-3">Content need</th>
                  <th className="w-[120px] px-5 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {visiblePersonas.map((row) => (
                  <tr
                    className={`transition hover:bg-[#fbfaf8] ${
                      row.key === activePersona.key ? "bg-[#fff8f4]" : ""
                    }`}
                    key={row.key}
                  >
                    <td className="border-t border-[#eee8e1] px-5 py-3 align-top">
                      <Link
                        className="font-semibold transition hover:text-[#e7352f]"
                        href={`/persona-intelligence/${row.key}?view=${activeView}`}
                      >
                        {row.persona}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[#6e6962]">
                        <span>{row.segment}</span>
                        <StatusPill tone={row.tone}>{row.nextAction}</StatusPill>
                      </div>
                    </td>
                    <td className="border-t border-[#eee8e1] px-4 py-3 align-top">
                      <div className="font-medium text-[#151515]">{row.stage}</div>
                      <div className="mt-0.5 text-xs leading-5 text-[#6e6962]">{row.intent}</div>
                    </td>
                    <td className="border-t border-[#eee8e1] px-4 py-3 align-top text-sm text-[#6e6962]">
                      {row.accelerator}
                    </td>
                    <td className="border-t border-[#eee8e1] px-4 py-3 align-top">
                      <Link
                        className="text-sm font-medium text-[#21558a] transition hover:text-[#153b62]"
                        href={row.aiStudioPath}
                      >
                        {row.contentNeed}
                      </Link>
                    </td>
                    <td className="border-t border-[#eee8e1] px-5 py-3 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div
                          aria-hidden="true"
                          className="h-1.5 w-12 overflow-hidden rounded-full bg-[#eee8e1]"
                        >
                          <div
                            className="bar-fill h-full rounded-full bg-[#e7352f]"
                            style={
                              {
                                "--bar-target": `${Math.min(100, Math.max(0, row.score))}%`,
                              } as React.CSSProperties
                            }
                          />
                        </div>
                        <span className="font-mono text-base font-semibold tabular-nums text-[#151515]">
                          {row.score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="flex items-start justify-between gap-3 border-b border-[#eee8e1] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
                  Hyper-persona snapshot
                </div>
                <div className="mt-1 text-sm font-semibold text-[#151515]">{activePersona.persona}</div>
              </div>
              <StatusPill tone={activePersona.tone}>{activeSnapshot.confidence}</StatusPill>
            </div>
            <div className="border-b border-[#eee8e1] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Next best action</div>
              <div className="mt-1.5 text-base font-semibold leading-snug text-[#151515]">
                {activeSnapshot.nextBestAction}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#6e6962]">{activeSnapshot.messagePosture}</p>
            </div>
            <dl className="divide-y divide-[#eee8e1]">
              {[
                ["Relationship", activeSnapshot.relationshipStage],
                ["Value tier", activeSnapshot.valueTier],
                ["Loss pattern", activeSnapshot.dominantLossPattern],
                ["Channel", activeSnapshot.preferredChannel],
                ["Offer", activeSnapshot.recommendedOffer],
              ].map(([label, value]) => (
                <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 px-5 py-2.5" key={label}>
                  <dt className="text-xs text-[#7a736b]">{label}</dt>
                  <dd className="text-sm font-medium text-[#151515]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-[#eee8e1] px-5 py-3">
              <Link
                className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-3 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                href={`/persona-intelligence?action=create-acceleration-plan&view=${activeView}&persona=${activePersona.key}`}
              >
                Create acceleration plan
              </Link>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Next best actions</h2>
            <div className="mt-5 space-y-3">
              {leadNextBestActions.map((item) => (
                <div className="rounded-md border border-[#eee8e1] bg-[#fbfaf8] p-3" key={item.action}>
                  <div className="font-semibold">{item.action}</div>
                  <p className="mt-1 text-sm leading-5 text-[#6e6962]">{item.reason}</p>
                  <div className="mt-2 text-xs font-semibold text-[#a07423]">{item.approval}</div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <section className="module-rise mt-6 border-t border-[#ddd6cd] pt-6 [animation-delay:230ms]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a736b]">Reference</div>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[#151515]">
            Signals &amp; intelligence
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
            <div className="border-b border-[#eee8e1] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#151515]">Engagement signal preview</h3>
              <p className="mt-0.5 text-xs text-[#6e6962]">Events that fuel living profiles.</p>
            </div>
            <ul className="divide-y divide-[#eee8e1]">
              {leadEngagementEvents.map((event) => (
                <li className="grid gap-1 px-4 py-3 sm:grid-cols-[90px_1fr]" key={event.event}>
                  <div className="text-xs text-[#7a736b]"><LiveTime baseline={event.time} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-[#151515]">{event.event}</div>
                      <span className="text-[11px] text-[#7a736b]">{event.channel}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-[#6e6962]">{event.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
            <div className="border-b border-[#eee8e1] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#151515]">Marketing intelligence feed</h3>
              <p className="mt-0.5 text-xs text-[#6e6962]">Content signals to flow into AI Studio after approval.</p>
            </div>
            <ul className="divide-y divide-[#eee8e1]">
              {personaContentSignals.map((signal) => (
                <li className="px-4 py-3" key={signal.signal}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold text-[#151515]">{signal.signal}</div>
                    <span className="text-[11px] text-[#7a736b]">{signal.priority}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[#7a736b]">{signal.source}</div>
                  <p className="mt-1 text-xs leading-5 text-[#6e6962]">{signal.engineUse}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="module-rise mt-6 border-t border-[#ddd6cd] pt-6 [animation-delay:300ms]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a736b]">Reference</div>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[#151515]">
              Playbooks &amp; software patterns
            </h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
            <div className="border-b border-[#eee8e1] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#151515]">Acceleration playbooks</h3>
              <p className="mt-0.5 text-xs text-[#6e6962]">
                Profile signals → sales actions &amp; campaign briefs.
              </p>
            </div>
            <ul className="divide-y divide-[#eee8e1]">
              {personaAccelerationPlaybooks.map((playbook) => (
                <li className="px-4 py-3" key={playbook.playbook}>
                  <div className="text-sm font-semibold text-[#151515]">{playbook.playbook}</div>
                  <p className="mt-1 text-xs leading-5 text-[#6e6962]">
                    <span className="font-semibold text-[#7a736b]">When </span>
                    {playbook.trigger}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-[#6e6962]">
                    <span className="font-semibold text-[#7a736b]">Then </span>
                    {playbook.action}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
            <div className="border-b border-[#eee8e1] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#151515]">Software patterns to borrow</h3>
              <p className="mt-0.5 text-xs text-[#6e6962]">
                Competitor moves worth adapting for restoration.
              </p>
            </div>
            <ul className="divide-y divide-[#eee8e1]">
              {competitorSoftwareReferences.map((reference) => (
                <li className="px-4 py-3" key={reference.app}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold text-[#151515]">{reference.app}</div>
                    <div className="text-[11px] text-[#7a736b]">{reference.category}</div>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#6e6962]">{reference.applyToGrowthEngine}</p>
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

function filterPersonas(view: string) {
  if (view === "ready-to-convert") {
    return personaTrackerRows.filter((persona) => persona.score >= 85);
  }

  if (view === "partner-candidates") {
    return personaTrackerRows.filter(
      (persona) => persona.segment === "Partner" || persona.stage.toLowerCase().includes("referral"),
    );
  }

  if (view === "needs-content") {
    return personaTrackerRows.filter((persona) => persona.contentNeed.length > 0);
  }

  return personaTrackerRows;
}
