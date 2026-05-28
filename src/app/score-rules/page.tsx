import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  exampleScore,
  exampleScoreBreakdown,
  routingRules,
  scoreChanges,
  scoreRules,
} from "../_data/growth-engine";

const auditRows = [
  ["Explainability", "Every score must show the signals that moved it."],
  ["Bounded output", "Lead and partner scores stay inside the 0 to 100 range."],
  ["Scope guardrail", "Non-target exterior-only work cannot become a campaign trigger."],
  ["Approval state", "Outbound copy stays pending until a human approves it."],
];

const scoreBands = [
  ["90-100", "Dispatch now", "Water confirmed, severe loss, clean contact path."],
  ["70-89", "Call first", "Likely water loss with enough context to move quickly."],
  ["40-69", "Review", "Useful signal, but needs proof, access, or scope confirmation."],
  ["0-39", "Hold", "Low urgency or outside the target restoration lane."],
];

const guardrailExamples = [
  ["Hail-only roof", "Blocked from campaign generation"],
  ["Wind-only siding", "Isolated from water-loss queue"],
  ["Coverage promise", "Requires rewrite before approval"],
];

export default function ScoreRulesPage() {
  return (
    <AppShell active="/score-rules">
      <PageHeader
        eyebrow="Priority Rules"
        title="How leads are scored, 0 to 100"
        description="Urgency, evidence, and partner strength combine into a bounded score that drives the next action."
        aside={<StatusPill tone="gray">0-100 lead score</StatusPill>}
      />

      <OperatorBar
        task="Check that scoring still sends the right work to the right team."
        detail="Start with the audit checklist, then review routing rules. The detailed weights are here when you need to explain why a lead moved up or down."
        status="Operator view"
        primary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
            href="#routing-rules"
          >
            Review routing rules
          </Link>
        }
        secondary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
            href="#audit-checklist"
          >
            Check audit
          </Link>
        }
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Signal weights</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Plain-language inputs that move a lead up the queue.</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {scoreRules.map((rule) => (
                <div className="grid grid-cols-[64px_1fr] gap-3 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3" key={rule.label}>
                  <div className="inline-flex h-10 w-14 items-center justify-center rounded-md border border-[#ddd6cd] bg-[#07111f] font-mono text-sm font-semibold tabular-nums text-white">
                    {rule.value}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#151515]">{rule.label}</div>
                    <p className="mt-0.5 text-sm leading-5 text-[#6e6962]">{rule.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Score bands</h2>
              <p className="mt-1 text-sm text-[#6e6962]">What the number means for operations.</p>
            </div>
            <div className="grid md:grid-cols-2">
              {scoreBands.map(([band, action, detail]) => (
                <div className="border-b border-[#eee8e1] p-5 even:md:border-l" key={band}>
                  <div className="font-mono text-2xl font-semibold tabular-nums">{band}</div>
                  <div className="mt-2 font-semibold">{action}</div>
                  <p className="mt-1 text-sm leading-6 text-[#6e6962]">{detail}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:140ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Scoring guardrails</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Signals that should not become priority marketing or dispatch triggers.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {guardrailExamples.map(([signal, result]) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4" key={signal}>
                  <div className="font-semibold">{signal}</div>
                  <div className="text-right text-sm text-[#6e6962]">{result}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="flex items-center justify-between border-b border-[#eee8e1] px-5 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6e6962]">
                Example lead
              </div>
              <StatusPill tone="dark">Sample</StatusPill>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-5 px-5 py-5">
              <div className="font-mono text-[64px] font-semibold leading-none tabular-nums tracking-[-0.06em] text-[#151515]">
                <CountUp value={exampleScore.leadScore} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs text-[#6e6962]">
                {exampleScoreBreakdown.lead.map((part, index) => (
                  <span className="inline-flex items-center gap-1.5" key={part.label}>
                    {index > 0 ? <span className="text-[#a8a098]">+</span> : null}
                    <span className="rounded border border-[#ddd6cd] bg-[#fbfaf8] px-1.5 py-0.5 tabular-nums text-[#151515]">
                      {part.value}
                    </span>
                    <span className="text-[#6e6962]">{part.label}</span>
                  </span>
                ))}
                <span className="text-[#a8a098]">=</span>
                <span className="rounded bg-[#151515] px-1.5 py-0.5 font-semibold tabular-nums text-white">
                  {exampleScore.leadScore}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[#eee8e1] border-t border-[#eee8e1]">
              <div className="px-5 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Partner score</div>
                <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                  <CountUp value={exampleScore.partnerScore} />
                </div>
                <div className="mt-1 font-mono text-xs text-[#6e6962]">
                  {exampleScoreBreakdown.partner.map((part) => part.value).join(" + ")} ={" "}
                  {exampleScore.partnerScore}
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Next action</div>
                <div className="mt-1.5 text-lg font-semibold">Call now</div>
                <div className="mt-1 text-xs text-[#6e6962]">Score 70+ triggers immediate outreach.</div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:170ms]" id="audit-checklist">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Rule audit checklist</h2>
              <p className="mt-1 text-sm text-[#6e6962]">The checks that keep automation understandable and safe.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {auditRows.map(([label, detail]) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4" key={label}>
                  <div>
                    <div className="font-semibold">{label}</div>
                    <p className="mt-1 text-sm leading-5 text-[#6e6962]">{detail}</p>
                  </div>
                  <StatusPill tone="green">Ready</StatusPill>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Recent rule changes</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Recent edits stay visible so the team knows what changed.</p>
            <div className="mt-5 space-y-4">
              {scoreChanges.map((change) => (
                <div className="border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={change.label}>
                  <div className="font-semibold">{change.label}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{change.detail}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="module-rise mt-4 p-0 [animation-delay:220ms]" id="routing-rules">
        <div className="border-b border-[#e7e0d8] px-5 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing rules</h2>
          <p className="mt-1 text-sm text-[#6e6962]">How priority score translates into team action.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                <th className="px-5 py-4">Rule</th>
                <th className="px-4 py-4">Condition</th>
                <th className="px-4 py-4">Target</th>
                <th className="px-4 py-4">SLA</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {routingRules.map((rule) => (
                <tr key={rule.rule}>
                  <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{rule.rule}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{rule.condition}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4">{rule.target}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4 font-mono">{rule.sla}</td>
                  <td className="border-t border-[#eee8e1] px-5 py-4">
                    <StatusPill tone="green">{rule.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
