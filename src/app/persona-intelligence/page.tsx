import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  competitorSoftwareReferences,
  crmPersonaSnapshots,
  hyperPersonalizationReference,
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
        title="Living profiles for every customer and partner"
        description="Move beyond static customer types. Combine persona, urgency, behavior, relationship value, content needs, and approval risk into one explainable profile."
        aside={<StatusPill tone="blue">Hyper-persona layer</StatusPill>}
      />

      <OperatorBar
        task="Decide what this person or segment needs next."
        detail={hyperPersonalizationReference.thesis}
        status="Mock intelligence"
        secondary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
            href={activePersona.crmPath}
          >
            Open CRM
          </Link>
        }
        primary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
            href={`/persona-intelligence?action=generate-content-brief&view=${activeView}&persona=${activePersona.key}`}
          >
            Generate brief
          </Link>
        }
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

      <div className="grid gap-4 md:grid-cols-4">
        {personaAccelerationStats.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[#6e6962]">{stat.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]">{stat.value}</div>
            <div className="mt-3 inline-flex rounded-md bg-[#f0f5fc] px-2 py-1 text-xs font-semibold text-[#21558a]">
              {stat.delta}
            </div>
          </Panel>
        ))}
      </div>

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
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">Persona</th>
                  <th className="px-4 py-4">Stage</th>
                  <th className="px-4 py-4">Intent</th>
                  <th className="px-4 py-4">Accelerator</th>
                  <th className="px-4 py-4">Content need</th>
                  <th className="px-5 py-4">Score</th>
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
                    <td className="border-t border-[#eee8e1] px-5 py-4">
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
                    <td className="border-t border-[#eee8e1] px-4 py-4 font-medium">{row.stage}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.intent}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.accelerator}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4">
                      <Link className="font-semibold text-[#21558a] transition hover:text-[#153b62]" href={row.aiStudioPath}>
                        {row.contentNeed}
                      </Link>
                    </td>
                    <td className="border-t border-[#eee8e1] px-5 py-4">
                      <div className="font-mono text-lg font-semibold">{row.score}</div>
                      <Link
                        className="mt-2 inline-flex min-h-8 items-center rounded-md border border-[#ddd6cd] bg-white px-2.5 text-xs font-semibold text-[#151515] transition hover:border-[#151515] active:-translate-y-px"
                        href={`/persona-intelligence/${row.key}?view=${activeView}`}
                      >
                        Open profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:150ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Hyper-persona snapshot</h2>
                <p className="mt-1 text-sm text-[#6e6962]">{activePersona.persona}</p>
              </div>
              <StatusPill tone={activePersona.tone}>{activeSnapshot.confidence}</StatusPill>
            </div>
            <div className="mt-5 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
                {activeSnapshot.basePersona}
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{activeSnapshot.nextBestAction}</div>
              <p className="mt-3 text-sm leading-6 text-[#6e6962]">{activeSnapshot.messagePosture}</p>
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["Relationship", activeSnapshot.relationshipStage],
                ["Value tier", activeSnapshot.valueTier],
                ["Loss pattern", activeSnapshot.dominantLossPattern],
                ["Channel", activeSnapshot.preferredChannel],
                ["Offer", activeSnapshot.recommendedOffer],
              ].map(([label, value]) => (
                <div className="rounded-md border border-[#eee8e1] bg-white p-3" key={label}>
                  <div className="text-xs text-[#6e6962]">{label}</div>
                  <div className="mt-1 font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-3 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                href={`/persona-intelligence?action=create-acceleration-plan&view=${activeView}&persona=${activePersona.key}`}
              >
                Plan
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#151515] px-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href={activePersona.aiStudioPath}
              >
                Build content
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel className="module-rise p-0 [animation-delay:230ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Engagement signal preview</h2>
            <p className="mt-1 text-sm text-[#6e6962]">These events become the fuel for living profiles.</p>
          </div>
          <div className="divide-y divide-[#eee8e1]">
            {leadEngagementEvents.map((event) => (
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-[120px_1fr]" key={event.event}>
                <div className="text-sm font-semibold text-[#6e6962]">{event.time}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">{event.event}</div>
                    <StatusPill tone="blue">{event.channel}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6e6962]">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="module-rise p-0 [animation-delay:260ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Marketing intelligence feed</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Content signals that should flow into AI Studio after approval.</p>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            {personaContentSignals.map((signal) => (
              <div className="border-b border-[#eee8e1] p-5 md:border-r even:md:border-r-0" key={signal.signal}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{signal.signal}</h3>
                  <StatusPill tone={signal.priority === "High" ? "red" : "amber"}>{signal.priority}</StatusPill>
                </div>
                <div className="mt-2 text-sm text-[#6e6962]">{signal.source}</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{signal.engineUse}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="module-rise mt-4 overflow-hidden p-0 [animation-delay:300ms]">
        <div className="border-b border-[#e7e0d8] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Software intelligence references</h2>
          <p className="mt-1 text-sm text-[#6e6962]">
            Competitive patterns worth borrowing, adapted for restoration-specific persona workflows.
          </p>
        </div>
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
          {competitorSoftwareReferences.map((reference) => (
            <div
              className="border-b border-[#eee8e1] p-5 md:border-r md:even:border-r-0 xl:even:border-r xl:last:border-r-0"
              key={reference.app}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{reference.app}</h3>
                  <div className="mt-1 text-xs text-[#6e6962]">{reference.category}</div>
                </div>
                <StatusPill tone={reference.status === "Research" ? "amber" : "blue"}>{reference.status}</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6e6962]">{reference.pattern}</p>
              <p className="mt-3 text-sm leading-6 text-[#3b3834]">{reference.applyToGrowthEngine}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="module-rise mt-4 overflow-hidden p-0 [animation-delay:330ms]">
        <div className="border-b border-[#e7e0d8] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Acceleration playbooks</h2>
          <p className="mt-1 text-sm text-[#6e6962]">Rules that connect profile signals to sales actions and campaign briefs.</p>
        </div>
        <div className="grid gap-0 md:grid-cols-3">
          {personaAccelerationPlaybooks.map((playbook) => (
            <div className="border-b border-[#eee8e1] p-5 md:border-r md:last:border-r-0" key={playbook.playbook}>
              <h3 className="font-semibold">{playbook.playbook}</h3>
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">Trigger</div>
              <p className="mt-1 text-sm leading-6 text-[#6e6962]">{playbook.trigger}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">Action</div>
              <p className="mt-1 text-sm leading-6 text-[#6e6962]">{playbook.action}</p>
            </div>
          ))}
        </div>
      </Panel>
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
