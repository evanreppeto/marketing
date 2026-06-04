import { EmptyState, StatusPill } from "@/app/_components/page-header";
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
  const guardrailCount = reasoning.guardrailFlags.length;
  const inputCount = reasoning.promptInputs.length;
  const outputCount = activity.length;
  const eventCount = events.length;

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-2xl border border-[oklch(0.76_0.14_232/0.4)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Mark rationale</span>
            <StatusPill tone={guardrailCount > 0 ? "amber" : "green"}>
              {guardrailCount > 0 ? `${guardrailCount} guardrail${guardrailCount === 1 ? "" : "s"}` : "No flags"}
            </StatusPill>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
            What Mark decided, why it matters, and what to do next
          </h2>
          <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">
            This view turns the raw agent notes into a quick operator read: the decision logic, evidence Mark used,
            guardrails that changed the work, and the activity trail behind the package.
          </p>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="border-b border-[var(--border-hairline)] p-5 lg:border-b-0 lg:border-r">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Decision logic</div>
            <p className="mt-3 text-base leading-7 text-[var(--text-primary)]">{reasoning.whyBuilt}</p>
          </div>
          <div className="p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[oklch(0.84_0.13_155)]">Recommended action</div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SignalTile label="Inputs reviewed" value={inputCount} detail="Prompt fields and source context Mark considered." tone="blue" />
        <SignalTile label="Tools used" value={reasoning.toolsUsed.length} detail="Automation and generation steps behind the package." tone="gray" />
        <SignalTile label="Outputs created" value={outputCount} detail="Agent outputs available for audit." tone="green" />
        <SignalTile label="Timeline events" value={eventCount} detail="Recorded campaign activity and handoffs." tone="amber" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <div className="text-base font-black uppercase tracking-[0.1em] text-[var(--text-primary)]">Evidence Mark used</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">The inputs and tools that shaped the recommendation.</p>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            {reasoning.promptInputs.length > 0 ? (
              <div className="px-5 py-4">
                <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Prompt inputs</div>
                <dl className="grid gap-3">
                  {reasoning.promptInputs.map((input) => (
                    <div key={input.label} className="grid gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)]">
                      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{input.label}</dt>
                      <dd className="text-sm leading-6 text-[var(--text-primary)]">{input.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="p-5">
                <EmptyState title="No prompt inputs recorded" detail="Mark can still explain the package, but this campaign does not expose the prompt fields used to generate it." />
              </div>
            )}

            <div className="px-5 py-4">
              <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Tools and constraints</div>
              <div className="grid gap-4 lg:grid-cols-2">
                <TagGroup
                  empty="No tools logged"
                  items={reasoning.toolsUsed}
                  title="Tools Mark touched"
                  tone="gray"
                />
                <TagGroup
                  empty="No risky claims or blocking constraints recorded"
                  items={reasoning.guardrailFlags}
                  title="Guardrails applied"
                  tone="amber"
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
            <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
              <div className="text-base font-black uppercase tracking-[0.1em] text-[var(--text-primary)]">Mark outputs</div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Generated work that can be inspected or traced.</p>
            </div>
            {activity.length > 0 ? (
              <ul className="divide-y divide-[var(--border-hairline)]">
                {activity.slice(0, 4).map((output) => (
                  <li key={output.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[var(--text-primary)]">{output.title}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {output.outputType} / risk {output.riskLevel} / {output.createdAt}
                        </div>
                      </div>
                      <StatusPill tone="gray">{output.status}</StatusPill>
                    </div>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{output.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState title="No Mark outputs yet" detail="No generated output records are attached to this campaign package." />
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="text-base font-black uppercase tracking-[0.1em] text-[var(--text-primary)]">Campaign timeline</div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">The recent activity trail for approvals, edits, and agent handoffs.</p>
        </div>
        {events.length > 0 ? (
          <ol className="divide-y divide-[var(--border-hairline)]">
            {events.map((event) => (
              <li key={event.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)]">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{event.occurredAt}</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">{event.type}</div>
                </div>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  {event.detail} <span className="text-[var(--text-muted)]">by {event.actor}</span>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="p-5">
            <EmptyState title="No campaign timeline yet" detail="Once the campaign is reviewed or revised, this area will show the trace of what changed and who acted." />
          </div>
        )}
      </section>
    </div>
  );
}

function SignalTile({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "amber" | "blue" | "gray" | "green";
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <StatusPill tone={tone}>{value}</StatusPill>
      </div>
      <div className="mt-3 font-display text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

function TagGroup({
  empty,
  items,
  title,
  tone,
}: {
  empty: string;
  items: string[];
  title: string;
  tone: "amber" | "gray";
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-[var(--text-primary)]">{title}</div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <StatusPill key={item} tone={tone}>
              {item}
            </StatusPill>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{empty}</p>
      )}
    </div>
  );
}
