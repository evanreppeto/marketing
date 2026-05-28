import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  intakeChannels,
  intakeLeads,
  intakeOutcomes,
  personaDisplay,
  routingExamples,
  validationGateRows,
} from "../_data/growth-engine";

const intakeSteps = [
  ["Receive", "Capture source, contact, property, and loss context."],
  ["Validate", "Check relationships, customer type, and required fields."],
  ["Classify", "Separate water, fire, mold, and sewage from out-of-scope work."],
  ["Route", "Send ready records to the right queue with score context."],
];

export default async function LeadIngestionPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; view?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const view = getValue(query.view) ?? "needs-review";
  const selectedLeads =
    view === "ready"
      ? intakeLeads.filter((lead) => lead.status === "Ready for team")
      : view === "blocked"
        ? intakeLeads.filter((lead) => lead.status === "Archive")
        : intakeLeads;

  return (
    <AppShell active="/lead-ingestion">
      <PageHeader
        eyebrow="Lead Intake"
        title="Validate and classify incoming submissions"
        description="This is the intake gate. It checks contact data, customer type, relationship links, and restoration scope before a lead can feed routing, CRM, or campaign intelligence."
        aside={<StatusPill tone="blue">Validation gate active</StatusPill>}
      />

      <ActionFeedback
        action={action}
        messages={{
          "needs-review": "Needs-review queue previewed. No intake records were changed.",
          "validate-selected": "Validation previewed. Accepted records would move to routing after persistence is connected.",
          "open-persona-intelligence": "Persona Intelligence is a separate workspace for acceleration and campaign signals.",
        }}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {intakeOutcomes.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[#6e6962]">{stat.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]"><CountUp value={stat.value} /></div>
            <div
              className={`mt-3 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                stat.tone === "green"
                  ? "bg-[#eef7f1] text-[#117343]"
                  : stat.tone === "red"
                    ? "bg-[#fdf1ef] text-[#c5261f]"
                    : "bg-[#fff3d9] text-[#875a07]"
              }`}
            >
              {stat.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:120ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Intake queue</h2>
              <p className="mt-1 text-sm text-[#6e6962]">
                Submissions using the same validation boundary as the API.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["needs-review", "All"],
                ["ready", "Ready"],
                ["blocked", "Blocked"],
              ].map(([key, label]) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    view === key
                      ? "border-[#151515] bg-[#151515] text-white"
                      : "border-[#ddd6cd] bg-white text-[#151515] hover:border-[#151515]"
                  }`}
                  href={`/lead-ingestion?view=${key}`}
                  key={key}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">Lead</th>
                  <th className="px-4 py-4">Customer</th>
                  <th className="px-4 py-4">Signal</th>
                  <th className="px-4 py-4">Validation</th>
                  <th className="px-5 py-4">Score</th>
                </tr>
              </thead>
              <tbody>
                {selectedLeads.map((lead) => {
                  const persona = personaDisplay[lead.customerType];
                  const isTarget = lead.classification.classification === "target_water_loss";

                  return (
                    <tr className="transition hover:bg-[#fbfaf8]" key={lead.name}>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
                        <div className="font-semibold">{lead.name}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">
                          {lead.received} from {lead.source}
                        </div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="font-semibold">{lead.contact}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{persona.label}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="font-medium">{lead.issue}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{lead.address}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <StatusPill tone={isTarget ? "green" : "red"}>{lead.action}</StatusPill>
                        <div className="mt-2 text-xs text-[#6e6962]">{lead.status}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-5 py-4 font-mono text-lg font-semibold">
                        {lead.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Validation gate</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Required checks before routing or AI use.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {validationGateRows.map((row) => (
                <div className="px-5 py-4" key={row.label}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.label}</div>
                      <div className="mt-1 text-sm text-[#6e6962]">{row.detail}</div>
                    </div>
                    <StatusPill tone={row.status === "Review" ? "amber" : "green"}>{row.status}</StatusPill>
                  </div>
                  <div className="mt-2 font-mono text-sm font-semibold">{row.completion}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Persona handoff</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e6962]">
              Once a lead is accepted, its profile and behavior can inform Persona Intelligence and AI Studio. Intake
              still owns the hard gate.
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
              href="/persona-intelligence?action=open-persona-intelligence"
            >
              Open persona intelligence
            </Link>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:210ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Decision examples</h2>
              <p className="mt-1 text-sm text-[#6e6962]">What the intake gate is looking for before routing.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {routingExamples.map((example) => (
                <div className="px-5 py-4" key={example.lead}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{example.lead}</div>
                      <div className="mt-1 text-sm text-[#6e6962]">{example.issue}</div>
                    </div>
                    <StatusPill
                      tone={
                        example.strength === "Strong"
                          ? "green"
                          : example.strength === "Medium"
                            ? "amber"
                            : "red"
                      }
                    >
                      {example.action}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[#6e6962]">{example.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel className="module-rise p-0 [animation-delay:220ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Intake path</h2>
            <p className="mt-1 text-sm text-[#6e6962]">The operational path from raw submission to routed lead.</p>
          </div>
          <div className="grid gap-0 md:grid-cols-4">
            {intakeSteps.map(([step, detail], index) => (
              <div className="border-b border-[#eee8e1] p-5 md:border-r md:last:border-r-0" key={step}>
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#151515] font-mono text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <div className="mt-4 font-semibold">{step}</div>
                <p className="mt-2 text-sm leading-6 text-[#6e6962]">{detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="module-rise p-0 [animation-delay:250ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Source mix</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Sample intake channels that will feed CRM persistence.</p>
          </div>
          <div className="grid gap-0 sm:grid-cols-2">
            {intakeChannels.map((channel) => (
              <div className="border-b border-[#eee8e1] p-5 even:sm:border-l" key={channel.label}>
                <div className="text-sm text-[#6e6962]">{channel.label}</div>
                <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.05em]">{channel.value}</div>
                <div className="mt-2 text-xs font-semibold text-[#21558a]">{channel.share}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
