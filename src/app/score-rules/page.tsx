import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  exampleScore,
  exampleScoreBreakdown,
  routingRules,
  scoreChanges,
  scoreRules,
} from "../_data/growth-engine";

export default function ScoreRulesPage() {
  return (
    <AppShell active="/score-rules">
      <PageHeader
        eyebrow="Priority Rules"
        title="Make every score explain the next move"
        description="Priority rules turn urgency, evidence, and partner strength into a bounded score operators can trust and managers can audit."
        aside={<StatusPill tone="green">0 to 100 lead score</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Signal weights</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Plain-language inputs that increase urgency.</p>
          </div>
          <div className="divide-y divide-[#eee8e1]">
            {scoreRules.map((rule) => (
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-[110px_1fr]" key={rule.label}>
                <div className="font-mono text-3xl font-semibold tracking-[-0.05em] text-[#e7352f]">{rule.value}</div>
                <div>
                  <div className="font-semibold">{rule.label}</div>
                  <p className="mt-1 text-sm leading-6 text-[#6e6962]">{rule.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="bg-[#151515] p-6 text-white">
              <div className="text-sm uppercase tracking-[0.16em] text-white/55">Example lead</div>
              <div className="mt-4 font-mono text-7xl font-semibold tracking-[-0.08em]">{exampleScore.leadScore}</div>
              <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-white/72">
                {exampleScoreBreakdown.lead.map((part, index) => (
                  <span className="inline-flex items-center gap-2" key={part.label}>
                    {index > 0 ? <span className="text-white/40">+</span> : null}
                    <span className="rounded-sm bg-white/10 px-2 py-0.5 text-white">{part.value}</span>
                    <span className="text-white/60">{part.label}</span>
                  </span>
                ))}
                <span className="text-white/40">=</span>
                <span className="rounded-sm bg-[#e7352f] px-2 py-0.5 font-semibold text-white">{exampleScore.leadScore}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[#eee8e1]">
              <div className="p-5">
                <div className="text-sm text-[#6e6962]">Partner score</div>
                <div className="mt-2 font-mono text-3xl font-semibold">{exampleScore.partnerScore}</div>
                <div className="mt-2 font-mono text-xs text-[#6e6962]">
                  {exampleScoreBreakdown.partner.map((part) => part.value).join(" + ")} = {exampleScore.partnerScore}
                </div>
              </div>
              <div className="p-5">
                <div className="text-sm text-[#6e6962]">Next action</div>
                <div className="mt-2 text-2xl font-semibold">Call now</div>
                <div className="mt-2 text-xs text-[#6e6962]">Score ≥ 70 triggers immediate outreach.</div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Recent rule changes</h2>
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

      <Panel className="module-rise mt-4 p-0 [animation-delay:220ms]">
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
