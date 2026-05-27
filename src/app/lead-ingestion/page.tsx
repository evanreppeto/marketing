import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { intakeChannels, intakeLeads, intakeOutcomes, personaDisplay, validationGateRows } from "../_data/growth-engine";

const steps = [
  ["Receive", "Submission captured from form, partner, phone, or internal intake."],
  ["Validate", "Customer type, relationship, and loss details are checked."],
  ["Classify", "Water-loss signals are separated from non-target work."],
  ["Route", "Priority, next action, and persistence state are returned."],
];

export default function LeadIngestionPage() {
  return (
    <AppShell active="/lead-ingestion">
      <PageHeader
        eyebrow="Lead Intake"
        title="Turn raw submissions into team-ready leads"
        description="The intake gate rejects incomplete records, validates customer type, classifies the loss, and tells operators what should happen before any outbound workflow starts."
        aside={<StatusPill tone="blue">Validation gate active</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.44fr)_minmax(360px,0.76fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Intake queue</h2>
                <p className="mt-1 text-sm text-[#6e6962]">Examples using the same validation boundary as the API.</p>
              </div>
              <div className="flex gap-2">
                <button className="min-h-11 rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition active:-translate-y-px">
                  Filter
                </button>
                <button className="min-h-11 rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition active:-translate-y-px">
                  Validate selected
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                    <th className="w-[30%] px-5 py-4">Lead</th>
                    <th className="w-[25%] px-4 py-4">Customer</th>
                    <th className="w-[20%] px-4 py-4">Issue</th>
                    <th className="w-[25%] px-4 py-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {intakeLeads.map((lead) => (
                    <tr key={lead.name}>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
                        <div className="font-semibold">{lead.name}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{lead.received} from {lead.source}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="font-semibold">{lead.contact}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{personaDisplay[lead.customerType].label}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">{lead.issue}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <StatusPill tone={lead.action === "High priority" ? "red" : "gray"}>{lead.action}</StatusPill>
                          <span className="font-mono text-lg font-semibold">{lead.score}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-4">
            {intakeOutcomes.map((metric) => (
              <Panel className="module-rise [animation-delay:220ms]" key={metric.label}>
                <div className="text-sm text-[#6e6962]">{metric.label}</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="font-mono text-3xl font-semibold tracking-[-0.04em]">{metric.value}</span>
                  <StatusPill tone={metric.tone}>{metric.delta}</StatusPill>
                </div>
              </Panel>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Validation gate</h2>
            <div className="mt-5 space-y-4">
              {validationGateRows.map((row) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={row.label}>
                  <div>
                    <div className="font-semibold">{row.label}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">{row.detail}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold">{row.completion}</div>
                    <StatusPill tone={row.status === "Review" ? "amber" : "green"}>{row.status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Source mix</h2>
            <div className="mt-5 space-y-3">
              {intakeChannels.map((channel) => (
                <div key={channel.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{channel.label}</span>
                    <span className="font-mono">{channel.value} / {channel.share}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#eee8e1]">
                    <div className="h-2 rounded-full bg-[#e7352f]" style={{ width: channel.share }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="module-rise mt-4 [animation-delay:260ms]">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Intake path</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {steps.map(([title, body], index) => (
            <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4" key={title}>
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md bg-[#151515] font-mono text-sm font-semibold text-white">
                {index + 1}
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#6e6962]">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
