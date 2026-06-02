import type { CampaignWorkspaceReasoning } from "@/lib/campaigns/read-model";

export function ReasoningTab({ reasoning }: { reasoning: CampaignWorkspaceReasoning }) {
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
