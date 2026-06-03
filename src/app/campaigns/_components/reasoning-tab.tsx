import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceActivity, CampaignWorkspaceEvent, CampaignWorkspaceReasoning } from "@/lib/campaigns/read-model";

export function ReasoningTab({
  reasoning,
  activity,
  events,
}: {
  reasoning: CampaignWorkspaceReasoning;
  activity: CampaignWorkspaceActivity[];
  events: CampaignWorkspaceEvent[];
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[oklch(0.76_0.14_232/0.4)] bg-[oklch(0.48_0.14_232/0.08)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Why Mark built this</div>
          <p className="mt-2 text-base leading-7 text-[var(--text-primary)]">{reasoning.whyBuilt}</p>
        </div>
        <div className="px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[oklch(0.84_0.13_155)]">Recommended action</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
        </div>
      </section>

      {reasoning.toolsUsed.length > 0 ? (
        <Block title="Tools used">
          <div className="flex flex-wrap gap-2">
            {reasoning.toolsUsed.map((tool) => (
              <span key={tool} className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                {tool}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {reasoning.guardrailFlags.length > 0 ? (
        <Block title="Guardrails">
          <div className="flex flex-wrap gap-2">
            {reasoning.guardrailFlags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.78_0.14_76/0.4)] bg-[oklch(0.52_0.13_76/0.14)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.89_0.12_76)]"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[oklch(0.82_0.13_85)]" />
                {flag}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {reasoning.promptInputs.length > 0 ? (
        <Block title="Prompt inputs">
          <dl className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-lg border border-[var(--border-hairline)]">
            {reasoning.promptInputs.map((input) => (
              <div key={input.label} className="grid gap-2 px-3 py-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{input.label}</dt>
                <dd className="text-sm text-[var(--text-primary)]">{input.value}</dd>
              </div>
            ))}
          </dl>
        </Block>
      ) : null}

      {activity.length > 0 ? (
        <Block title="Mark outputs">
          <ul className="space-y-3">
            {activity.map((output) => (
              <li key={output.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--text-primary)]">{output.title}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {output.outputType} / risk {output.riskLevel} / {output.createdAt}
                    </div>
                  </div>
                  <StatusPill tone="gray">{output.status}</StatusPill>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{output.body}</p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {events.length > 0 ? (
        <Block title="Campaign timeline">
          <ol className="relative ml-1 space-y-5 border-l border-[var(--border-strong)] pl-5">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-panel)] bg-[var(--accent)]" />
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{event.occurredAt}</div>
                <div className="mt-0.5 font-semibold text-[var(--text-primary)]">{event.type}</div>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {event.detail} <span className="text-[var(--text-muted)]">by {event.actor}</span>
                </p>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">{title}</h3>
      {children}
    </section>
  );
}
