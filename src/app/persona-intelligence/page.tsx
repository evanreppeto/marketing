import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { ActionFeedback, EmptyState, buttonClasses, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

const viewOptions = [
  { key: "all-personas", label: "All personas" },
  { key: "ready-to-convert", label: "Ready to convert" },
  { key: "partner-candidates", label: "Partner candidates" },
  { key: "needs-content", label: "Needs content" },
];

type PersonaSnapshotView = {
  confidence: string;
  nextBestAction: string;
  messagePosture: string;
  relationshipStage: string;
  valueTier: string;
  dominantLossPattern: string;
  preferredChannel: string;
  recommendedOffer: string;
  riskFlags: string[];
};

export default async function PersonaIntelligencePage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; persona?: string | string[]; view?: string | string[] }>;
}) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const livePersonaData = await getPersonaIntelligenceData();
  const isLive = livePersonaData.status === "live";
  const personaRows = isLive ? livePersonaData.personas : [];
  const stats = isLive
    ? livePersonaData.stats
    : [
        { label: "Tracked personas", value: 0, delta: "Supabase unavailable" },
        { label: "Ready to convert", value: 0, delta: "No live data" },
        { label: "Partner candidates", value: 0, delta: "No live data" },
        { label: "Content briefs", value: 0, delta: "No live data" },
      ];
  const contentSignals = isLive ? livePersonaData.contentSignals : [];
  const guardrailSignals = isLive ? livePersonaData.guardrailSignals : [];
  const action = getValue(query.action);
  const activePersonaKey = getValue(query.persona);
  const activeView = getValue(query.view) ?? "all-personas";
  const visiblePersonas = filterPersonas(activeView, personaRows);
  const activePersona =
    visiblePersonas.find((persona) => persona.key === activePersonaKey) ??
    personaRows.find((persona) => persona.key === activePersonaKey) ??
    visiblePersonas[0] ??
    personaRows[0] ??
    null;
  const activeSnapshot = activePersona ? getPersonaSnapshotView(activePersona) : null;

  return (
    <AppShell active="/persona-intelligence">
      <PageHeader
        eyebrow="Persona Intelligence"
        title="Track who's ready and what they need next"
        description="One operating view across urgency, behavior, relationship value, and content needs."
        aside={<StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live persona memory" : "Supabase unavailable"}</StatusPill>}
      />

      {!isLive ? (
        <div className="module-rise mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live persona memory unavailable: </span>
          {livePersonaData.message}
        </div>
      ) : null}

      {activePersona ? (
        <ActionFeedback
          action={action}
          messages={{
            "generate-content-brief": `Content brief requested for ${activePersona.persona}.`,
            "create-acceleration-plan": `Acceleration plan requested for ${activePersona.persona}.`,
            "sync-ai-studio": "Persona intelligence handoff requested.",
            "open-persona": `${activePersona.persona} is now selected. The snapshot and next actions are scoped to that persona.`,
          }}
        />
      ) : null}

      {!activePersona ? (
        <Panel className="module-rise [animation-delay:70ms]">
          <EmptyState
            title="No persona memory yet"
            detail="Supabase is connected, but no active persona snapshots or knowledge entries are available for this view."
            action={<Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">Queue Mark task</Link>}
          />
        </Panel>
      ) : null}

      {activePersona && activeSnapshot ? (() => {
        const [primary, ...supporting] = stats;
        return (
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
              <div className="border-b border-[var(--border-hairline)] px-5 py-5 md:border-b-0 md:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {primary.label}
                </div>
                <div className="mt-2 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">
                  <CountUp value={primary.value} />
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--chicago-blue-soft)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                  {primary.delta}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--border-hairline)]">
                {supporting.map((stat) => (
                  <div className="px-4 py-4" key={stat.label}>
                    <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
                    <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-[-0.02em]">
                      <CountUp value={stat.value} />
                    </div>
                    <div className="mt-1.5 text-[11px] font-medium text-[var(--accent)]">{stat.delta}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        );
      })() : null}

      {activePersona && activeSnapshot ? <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:110ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Persona tracker</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                The operating view for intent, blockers, acceleration paths, and campaign needs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {viewOptions.map((view) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    activeView === view.key
                      ? "bg-[var(--accent)] text-[oklch(0.18_0.03_248)] hover:bg-[var(--accent-strong)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
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
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-4 py-3">Stage &amp; intent</th>
                  <th className="px-4 py-3">Accelerator</th>
                  <th className="px-4 py-3">Content need</th>
                  <th className="w-[120px] px-5 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {visiblePersonas.map((row) => (
                  <tr
                    className={`transition hover:bg-[var(--surface-inset)] ${
                      row.key === activePersona.key ? "bg-[var(--accent-soft)]" : ""
                    }`}
                    key={row.key}
                  >
                    <td className="border-t border-[var(--border-hairline)] px-5 py-3 align-top">
                      <Link
                        className="font-semibold transition hover:text-[var(--priority-bright)]"
                        href={`/persona-intelligence/${row.key}?view=${activeView}`}
                      >
                        {row.persona}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span>{row.segment}</span>
                        <StatusPill tone={row.tone}>{row.nextAction}</StatusPill>
                      </div>
                    </td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-3 align-top">
                      <div className="font-medium text-[var(--text-primary)]">{row.stage}</div>
                      <div className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{row.intent}</div>
                    </td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-3 align-top text-sm text-[var(--text-secondary)]">
                      {row.accelerator}
                    </td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-3 align-top">
                      <Link
                        className="text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
                        href={row.aiStudioPath}
                      >
                        {row.contentNeed}
                      </Link>
                    </td>
                    <td className="border-t border-[var(--border-hairline)] px-5 py-3 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div
                          aria-hidden="true"
                          className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--surface-soft)]"
                        >
                          <div
                            className="bar-fill h-full rounded-full bg-[var(--priority)]"
                            style={
                              {
                                "--bar-target": `${Math.min(100, Math.max(0, row.score))}%`,
                              } as React.CSSProperties
                            }
                          />
                        </div>
                        <span className="font-mono text-base font-semibold tabular-nums text-[var(--text-primary)]">
                          {row.score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Hyper-persona snapshot
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{activePersona.persona}</div>
              </div>
              <StatusPill tone={activePersona.tone}>{activeSnapshot.confidence}</StatusPill>
            </div>
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Next best action</div>
              <div className="mt-1.5 text-base font-semibold leading-snug text-[var(--text-primary)]">
                {activeSnapshot.nextBestAction}
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{activeSnapshot.messagePosture}</p>
            </div>
            <dl className="divide-y divide-[var(--border-hairline)]">
              {[
                ["Relationship", activeSnapshot.relationshipStage],
                ["Value tier", activeSnapshot.valueTier],
                ["Loss pattern", activeSnapshot.dominantLossPattern],
                ["Channel", activeSnapshot.preferredChannel],
                ["Offer", activeSnapshot.recommendedOffer],
              ].map(([label, value]) => (
                <div className="grid min-w-0 grid-cols-[minmax(88px,0.42fr)_minmax(0,1fr)] items-baseline gap-3 px-5 py-2.5" key={label}>
                  <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                  <dd className="token-value text-sm font-medium text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-[var(--border-hairline)] px-5 py-3">
              <Link
                className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full" })}
                href={`/persona-intelligence?action=create-acceleration-plan&view=${activeView}&persona=${activePersona.key}`}
              >
                Create acceleration plan
              </Link>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Next best actions</h2>
            <div className="mt-5">
              <EmptyState title="No next-best-action rows yet" detail="Mark or the intelligence layer will populate this from Supabase after a persona refresh task runs." />
            </div>
          </Panel>
        </aside>
      </div> : null}

      {activePersona && contentSignals.length > 0 ? <section className="module-rise mt-6 border-t border-[var(--border-hairline)] pt-6 [animation-delay:230ms]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Live memory</div>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Signals &amp; intelligence
          </h2>
        </div>
        <div className="grid gap-4">
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
            <div className="border-b border-[var(--border-hairline)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Marketing intelligence feed</h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Content signals loaded from persona knowledge entries.</p>
            </div>
            <ul className="divide-y divide-[var(--border-hairline)]">
              {contentSignals.map((signal) => (
                <li className="px-4 py-3" key={signal.signal}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{signal.signal}</div>
                    <span className="text-[11px] text-[var(--text-muted)]">{signal.priority}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">{signal.source}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{signal.engineUse}</p>
                </li>
              ))}
              {contentSignals.length === 0 ? (
                <li className="px-4 py-4 text-sm text-[var(--text-secondary)]">No active content signals found.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </section> : null}

      {guardrailSignals.length > 0 ? (
        <section className="module-rise mt-6 border-t border-[var(--border-hairline)] pt-6 [animation-delay:260ms]">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Live Guardrails</div>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Rules Hermes must respect before outbound approval
            </h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {guardrailSignals.map((signal) => (
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4" key={signal.signal}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{signal.signal}</div>
                  <StatusPill tone={signal.priority === "Blocker" ? "red" : "amber"}>{signal.priority}</StatusPill>
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{signal.source}</div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{signal.engineUse}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getPersonaSnapshotView(persona: { crmPath: string; snapshot?: PersonaSnapshotView }): PersonaSnapshotView {
  if (persona.snapshot) {
    return persona.snapshot;
  }

  return {
    confidence: "0%",
    nextBestAction: "Run persona refresh",
    messagePosture: "No live persona snapshot is attached yet.",
    relationshipStage: "not_started",
    valueTier: "unknown",
    dominantLossPattern: "unknown",
    preferredChannel: "unknown",
    recommendedOffer: "No offer selected",
    riskFlags: ["persona_memory_missing"],
  };
}

function filterPersonas<T extends { score: number; segment: string; stage: string; contentNeed: string }>(view: string, rows: T[]) {
  if (view === "ready-to-convert") {
    return rows.filter((persona) => persona.score >= 85);
  }

  if (view === "partner-candidates") {
    return rows.filter(
      (persona) => persona.segment === "Partner" || persona.stage.toLowerCase().includes("referral"),
    );
  }

  if (view === "needs-content") {
    return rows.filter((persona) => persona.contentNeed.length > 0);
  }

  return rows;
}
