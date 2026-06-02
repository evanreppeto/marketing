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
      <Block title="Why Mark built this">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{reasoning.whyBuilt}</p>
      </Block>

      <Block title="Recommended action">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
      </Block>

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
          <ul className="space-y-1.5">
            {reasoning.guardrailFlags.map((flag) => (
              <li key={flag} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                {flag}
              </li>
            ))}
          </ul>
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
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="grid gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{event.occurredAt}</div>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{event.type}</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {event.detail} <span className="text-[var(--text-muted)]">by {event.actor}</span>
                  </p>
                </div>
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
