import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { DetailStack, MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import { getPersonaIntelligenceData, type PersonaTrackerRow } from "@/lib/persona-intelligence/read-model";

const viewOptions = [
  { key: "all-personas", label: "All" },
  { key: "ready-to-convert", label: "High confidence" },
  { key: "partner-candidates", label: "Partners" },
  { key: "needs-content", label: "Needs copy" },
];

type PersonaSnapshotView = NonNullable<PersonaTrackerRow["snapshot"]>;

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
  const stats = isLive ? livePersonaData.stats : [];
  const contentSignals = isLive ? livePersonaData.contentSignals : [];
  const guardrailSignals = isLive ? livePersonaData.guardrailSignals : [];
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
      <WorkspaceHeader
        eyebrow="Persona intelligence"
        title="The messaging memory Mark should obey."
        description="Personas hold revenue fit, relationship posture, safe angles, do-not-say rules, and the next best action for campaigns and outreach."
        status={isLive ? "Live persona memory" : "Supabase unavailable"}
        statusTone={isLive ? "green" : "amber"}
        primary={{ label: "Refresh persona", href: "/agent-operations" }}
        secondary={{ label: "Open CRM", href: "/crm" }}
      />

      {!isLive ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live persona memory unavailable: </span>
          {livePersonaData.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={
          stats.length > 0
            ? stats.map((stat, index) => ({
                label: stat.label,
                value: typeof stat.value === "number" ? <CountUp value={stat.value} /> : stat.value,
                detail: stat.delta,
                tone: index === 1 ? ("green" as const) : index === 2 ? ("blue" as const) : ("gray" as const),
              }))
            : [
                { label: "Tracked personas", value: 0, detail: "No live data", tone: "amber" as const },
                { label: "Ready to convert", value: 0, detail: "No live data", tone: "gray" as const },
                { label: "Partner candidates", value: 0, detail: "No live data", tone: "gray" as const },
                { label: "Content briefs", value: 0, detail: "No live data", tone: "gray" as const },
              ]
        }
      />

      {!activePersona || !activeSnapshot ? (
        <WorkspacePanel>
          <EmptyState
            title="No persona memory yet"
            detail="Run a persona refresh task so Mark has usable messaging, revenue, and guardrail context."
            action={<Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">Queue Mark task</Link>}
          />
        </WorkspacePanel>
      ) : (
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 space-y-5">
            <WorkspacePanel
              eyebrow="Persona matrix"
              title="Who Mark is writing for"
              description="Filter by conversion readiness, partner potential, or missing content before asking Mark to draft anything."
            >
              <div className="flex flex-wrap gap-2 border-b border-[var(--border-hairline)] p-4">
                {viewOptions.map((view) => (
                  <Link
                    className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-bold transition ${
                      activeView === view.key
                        ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                    }`}
                    href={`/persona-intelligence?view=${view.key}`}
                    key={view.key}
                  >
                    {view.label}
                  </Link>
                ))}
              </div>
              <div className="divide-y divide-[var(--border-hairline)]">
                {visiblePersonas.map((row) => (
                  <PersonaMatrixRow active={row.key === activePersona.key} activeView={activeView} key={row.key} row={row} />
                ))}
              </div>
            </WorkspacePanel>

            <WorkspacePanel
              eyebrow="Knowledge feed"
              title="Signals Mark can use"
              description="Plain-language notes from persona knowledge entries and guardrails."
            >
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <SignalList signals={contentSignals} title="Messaging signals" empty="No active messaging signals found." />
                <SignalList signals={guardrailSignals} title="Guardrails" empty="No active guardrail rules found." />
              </div>
            </WorkspacePanel>
          </div>

          <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
            <WorkspacePanel
              eyebrow="Selected persona"
              title={activePersona.persona}
              description={activeSnapshot.messagePosture}
              aside={<StatusPill tone={activePersona.tone}>{activeSnapshot.confidence}</StatusPill>}
            >
              <DetailStack
                items={[
                  { label: "Segment", value: activePersona.segment },
                  { label: "Stage", value: activeSnapshot.relationshipStage },
                  { label: "Revenue signal", value: activeSnapshot.valueTier },
                  { label: "Loss pattern", value: activeSnapshot.dominantLossPattern },
                  { label: "Channel", value: activeSnapshot.preferredChannel },
                  { label: "Offer", value: activeSnapshot.recommendedOffer },
                  { label: "Next action", value: activeSnapshot.nextBestAction },
                ]}
              />
              <div className="border-t border-[var(--border-hairline)] p-4">
                <div className="signal-eyebrow">Do-not-say / risk</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeSnapshot.riskFlags.map((flag) => (
                    <StatusPill tone="amber" key={flag}>{flag}</StatusPill>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Link className={buttonClasses({ variant: "primary", size: "sm", className: "w-full" })} href={activePersona.aiStudioPath}>
                    Create brief
                  </Link>
                  <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full" })} href={activePersona.crmPath}>
                    Open records
                  </Link>
                </div>
              </div>
            </WorkspacePanel>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function PersonaMatrixRow({ row, active, activeView }: { row: PersonaTrackerRow; active: boolean; activeView: string }) {
  return (
    <Link
      className={`grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-inset)] lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_110px] ${
        active ? "bg-[var(--accent-soft)]" : ""
      }`}
      href={`/persona-intelligence?view=${activeView}&persona=${row.key}`}
    >
      <div className="min-w-0">
        <div className="font-bold text-[var(--text-primary)]">{row.persona}</div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">{row.segment} / {row.stage}</div>
      </div>
      <div className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">{row.intent}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{row.contentNeed}</div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">{row.blocker}</div>
      </div>
      <div className="flex items-center justify-start gap-2 lg:justify-end">
        <StatusPill tone={row.tone}>{row.score}</StatusPill>
      </div>
    </Link>
  );
}

function SignalList({
  title,
  signals,
  empty,
}: {
  title: string;
  signals: Array<{ signal: string; source: string; engineUse: string; priority: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">{title}</div>
      {signals.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {signals.slice(0, 5).map((signal) => (
            <div className="px-4 py-3" key={`${title}-${signal.signal}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{signal.signal}</div>
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{signal.priority}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">{signal.source}</div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{signal.engineUse}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm leading-6 text-[var(--text-secondary)]">{empty}</p>
      )}
    </div>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getPersonaSnapshotView(persona: PersonaTrackerRow): PersonaSnapshotView {
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
