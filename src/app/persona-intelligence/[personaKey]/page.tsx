import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../../_components/page-header";
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
          "generate-content-brief": `Content brief previewed for ${persona.persona}. Draft assets remain pending approval.`,
          "create-acceleration-plan": `Acceleration plan previewed for ${persona.persona}. No CRM records were changed.`,
          "sync-ai-studio": "AI Studio handoff previewed. Campaign persistence is not connected yet.",
        }}
      />

      <Panel className="module-rise p-0 [animation-delay:70ms]">
        <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
          <div className="border-b border-[#eee8e1] px-5 py-5 md:border-b-0 md:border-r">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
              Next action
            </div>
            <div className="mt-2 text-lg font-semibold leading-snug text-[#151515]">
              {persona.nextAction}
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#cdddee] bg-[#f0f5fc] px-2 py-0.5 text-[11px] font-medium text-[#21558a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3877c1]" aria-hidden="true" />
              Recommended
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#eee8e1]">
            {[
              ["Stage", persona.stage],
              ["Blocker", persona.blocker],
              ["Offer", persona.offer],
            ].map(([label, value]) => (
              <div className="px-4 py-4" key={label}>
                <div className="text-xs text-[#7a736b]">{label}</div>
                <div className="mt-1.5 text-sm font-semibold leading-5 text-[#151515]">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Hyper-persona snapshot</h2>
                  <p className="mt-1 text-sm text-[#6e6962]">The current operating profile for this persona.</p>
                </div>
                <StatusPill tone={persona.tone}>{snapshot.confidence}</StatusPill>
              </div>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-[#eee8e1] p-5 lg:border-b-0 lg:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a07423]">
                  {snapshot.basePersona}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{snapshot.nextBestAction}</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{snapshot.messagePosture}</p>
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
                  <div className="border-b border-[#eee8e1] p-4 even:sm:border-l" key={label}>
                    <div className="text-xs text-[#6e6962]">{label}</div>
                    <div className="mt-1 font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:160ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Campaign intelligence</h2>
              <p className="mt-1 text-sm text-[#6e6962]">What this profile should feed into the marketing engine.</p>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              {visibleSignals.map((signal) => (
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

          <Panel className="module-rise p-0 [animation-delay:200ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Engagement timeline</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Scaffold events that explain why this profile is recommended.</p>
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
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:140ms]">
            <div className="border-b border-[#eee8e1] px-5 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
                Profile actions
              </div>
            </div>
            <div className="space-y-2 px-5 py-4">
              <Link
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href={persona.aiStudioPath}
              >
                Build content in AI Studio
              </Link>
              <div className="flex gap-2">
                <Link
                  className="inline-flex min-h-9 flex-1 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-3 text-xs font-semibold transition hover:border-[#151515] active:-translate-y-px"
                  href={`/persona-intelligence/${persona.key}?action=create-acceleration-plan&view=${returnView}`}
                >
                  Create plan
                </Link>
                <Link
                  className="inline-flex min-h-9 flex-1 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-3 text-xs font-semibold transition hover:border-[#151515] active:-translate-y-px"
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
                <div className="rounded-md border border-[#eee8e1] bg-[#fbfaf8] p-3" key={item.action}>
                  <div className="font-semibold">{item.action}</div>
                  <p className="mt-1 text-sm leading-5 text-[#6e6962]">{item.reason}</p>
                  <div className="mt-2 text-xs font-semibold text-[#a07423]">{item.approval}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval guardrails</h2>
            <div className="mt-5 space-y-3">
              {promptGuardrails.slice(0, 4).map((guardrail, index) => (
                <div className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-6" key={guardrail}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#151515] font-mono text-xs font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="text-[#6e6962]">{guardrail}</div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <section className="module-rise mt-6 border-t border-[#ddd6cd] pt-6 [animation-delay:260ms]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a736b]">Reference</div>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[#151515]">
            Playbooks &amp; software patterns
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
            <div className="border-b border-[#eee8e1] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#151515]">Acceleration playbooks</h3>
              <p className="mt-0.5 text-xs text-[#6e6962]">Reusable moves this profile can trigger.</p>
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
              <p className="mt-0.5 text-xs text-[#6e6962]">CRM &amp; campaign ideas relevant to this profile.</p>
            </div>
            <ul className="divide-y divide-[#eee8e1]">
              {competitorSoftwareReferences.slice(0, 4).map((reference) => (
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
