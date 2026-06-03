import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { getPersonaIntelligenceData, type PersonaContentSignal, type PersonaTrackerRow } from "@/lib/persona-intelligence/read-model";
import { PERSONA_CTA_RULES, personaSlug, type PersonaCtaRule } from "@/lib/persona-intelligence/cta-rules";

type IntelligenceTab = "personas" | "snapshots" | "signals" | "guardrails";

type PageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
    inspect?: string | string[];
  }>;
};

const TABS: Array<{ id: IntelligenceTab; label: string; detail: string }> = [
  { id: "personas", label: "Persona rules", detail: "Approved CTA and language rules" },
  { id: "snapshots", label: "Live snapshots", detail: "Current Supabase persona memory" },
  { id: "signals", label: "Knowledge signals", detail: "Entries Mark can reference" },
  { id: "guardrails", label: "Guardrails", detail: "Copy and compliance checks" },
];

export default async function PersonaIntelligencePage({ searchParams }: PageProps) {
  await connection();

  const params = await searchParams;
  const activeTab = parseTab(valueOf(params?.tab));
  const inspectedKey = valueOf(params?.inspect);
  const data = await getPersonaIntelligenceData();
  const livePersonas = data.status === "live" ? data.personas : [];
  const liveBySlug = new Map(livePersonas.map((persona) => [persona.key, persona]));
  const personaRows = PERSONA_CTA_RULES.map((rule) => ({ rule, live: liveBySlug.get(personaSlug(rule.persona)) ?? null }));
  const contentSignals = data.status === "live" ? data.contentSignals : [];
  const guardrailSignals = data.status === "live" ? data.guardrailSignals : [];
  const inspector = buildInspector(activeTab, inspectedKey, personaRows, livePersonas, contentSignals, guardrailSignals);

  return (
    <>
      <header className="module-rise mb-4 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-4 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="signal-eyebrow">Persona Intelligence</span>
          <StatusPill tone={data.status === "live" ? "green" : "amber"}>{data.status === "live" ? "Live memory" : "Unavailable"}</StatusPill>
          <StatusPill tone="amber">No publishing</StatusPill>
        </div>
        <h1 className="mt-2 max-w-3xl text-[clamp(1.55rem,2.5vw,2.4rem)] font-black leading-[1.02] tracking-[-0.04em] text-[var(--text-primary)]">
          Inspect persona rules before Mark uses them.
        </h1>
        <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">
          Use the tabs to inspect one type of intelligence at a time. Nothing here publishes pages, sends outreach, or launches campaigns.
        </p>
      </header>

      {data.status === "unavailable" ? (
        <div className="module-rise mb-4 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Persona memory unavailable: </span>
          {data.message}
        </div>
      ) : null}

      <nav aria-label="Persona Intelligence sections" className="module-rise mb-4 grid gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-2 shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className={`rounded-lg border px-4 py-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] ${
                selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
              }`}
              href={`/persona-intelligence?tab=${tab.id}`}
              key={tab.id}
            >
              <span className="block text-sm font-black text-[var(--text-primary)]">{tab.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
            </Link>
          );
        })}
      </nav>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="min-w-0">
          {activeTab === "personas" ? <PersonaRulesTab rows={personaRows} /> : null}
          {activeTab === "snapshots" ? <SnapshotsTab rows={livePersonas} /> : null}
          {activeTab === "signals" ? <SignalsTab empty="No active persona knowledge entries are available yet." rows={contentSignals} tab="signals" title="Knowledge signals" /> : null}
          {activeTab === "guardrails" ? <SignalsTab empty="No active guardrail rules are available yet." rows={guardrailSignals} tab="guardrails" title="Guardrail checks" /> : null}
        </main>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: inspector.title,
              persona: inspector.persona,
              confidence: inspector.confidence,
              journeyStage: inspector.stage,
              urgency: "Human approval required",
              attentionReason: inspector.reason,
              nextBestAction: inspector.nextAction,
              cta: inspector.cta,
              messageAngle: inspector.messageAngle,
              guardrailStatus: inspector.guardrail,
              scores: inspector.scores,
              proofPoints: inspector.proofPoints,
              actions: inspector.actions,
              outboundLocked: true,
            }}
          />
        </aside>
      </div>
    </>
  );
}

function PersonaRulesTab({ rows }: { rows: Array<{ rule: PersonaCtaRule; live: PersonaTrackerRow | null }> }) {
  return (
    <WorkspacePanel
      eyebrow="Persona rules"
      title="Approved CTA matrix"
      description="Cards are inspection points for Mark's campaign briefs and approval cards."
    >
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {rows.map(({ rule, live }) => (
          <PersonaRuleCard key={rule.persona} rule={rule} live={live} />
        ))}
      </div>
    </WorkspacePanel>
  );
}

function SnapshotsTab({ rows }: { rows: PersonaTrackerRow[] }) {
  return (
    <WorkspacePanel eyebrow="Live snapshots" title="Supabase persona memory" description="Open a snapshot to inspect its current posture and related CRM record.">
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <Link
              className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] lg:grid-cols-[minmax(0,1.2fr)_140px_120px_auto]"
              href={`/persona-intelligence?tab=snapshots&inspect=${row.key}`}
              key={row.key}
            >
              <div className="min-w-0">
                <div className="truncate font-black text-[var(--text-primary)]">{row.persona}</div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{row.intent}</p>
              </div>
              <RuleField label="Stage" value={humanize(row.stage)} />
              <RuleField label="Score" value={`${row.score}`} />
              <span className={buttonClasses({ variant: "ghost", size: "sm", className: "self-center" })}>Inspect</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No live snapshots yet" detail="Persona rules are still available, but no Supabase persona snapshot records are attached yet." />
      )}
    </WorkspacePanel>
  );
}

function SignalsTab({
  rows,
  title,
  tab,
  empty,
}: {
  rows: PersonaContentSignal[];
  title: string;
  tab: "signals" | "guardrails";
  empty: string;
}) {
  return (
    <WorkspacePanel eyebrow={tab === "signals" ? "Knowledge feed" : "Guardrails"} title={title} description="Each row opens in the inspector panel on the right.">
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row, index) => (
            <Link
              className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] lg:grid-cols-[minmax(0,1fr)_140px_auto]"
              href={`/persona-intelligence?tab=${tab}&inspect=${signalKey(row, index)}`}
              key={signalKey(row, index)}
            >
              <div className="min-w-0">
                <div className="font-black text-[var(--text-primary)]">{row.signal}</div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{row.engineUse}</p>
              </div>
              <RuleField label="Source" value={humanize(row.source)} />
              <span className={buttonClasses({ variant: "ghost", size: "sm", className: "self-center" })}>Inspect</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No live signal yet" detail={empty} />
      )}
    </WorkspacePanel>
  );
}

function PersonaRuleCard({ rule, live }: { rule: PersonaCtaRule; live: PersonaTrackerRow | null }) {
  return (
    <Link
      className="group block cursor-pointer rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 shadow-[inset_0_1px_0_oklch(0.98_0.01_240/0.04)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      href={`/persona-intelligence?tab=personas&inspect=${personaSlug(rule.persona)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={live ? live.tone : "gray"}>{rule.segment}</StatusPill>
        <StatusPill tone={live ? "green" : "gray"}>{live ? "Live memory" : "Rule only"}</StatusPill>
        <StatusPill tone="amber">No publish</StatusPill>
      </div>
      <h2 className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{rule.label}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{rule.messageAngle}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <RuleField label="Primary CTA" value={rule.primaryCta} />
        <RuleField label="Secondary CTA" value={rule.secondaryCta} />
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
        Inspect in side panel
      </div>
    </Link>
  );
}

function RuleField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]" title={value}>
        {value}
      </div>
    </div>
  );
}

function buildInspector(
  tab: IntelligenceTab,
  inspectedKey: string | undefined,
  personaRows: Array<{ rule: PersonaCtaRule; live: PersonaTrackerRow | null }>,
  snapshots: PersonaTrackerRow[],
  signals: PersonaContentSignal[],
  guardrails: PersonaContentSignal[],
) {
  if (tab === "snapshots") {
    const selected = snapshots.find((row) => row.key === inspectedKey) ?? snapshots[0] ?? null;
    if (selected) {
      return {
        title: selected.persona,
        persona: selected.persona,
        confidence: selected.snapshot?.confidence ?? `${selected.score}%`,
        stage: humanize(selected.stage),
        reason: selected.intent,
        nextAction: selected.nextAction,
        cta: selected.offer,
        messageAngle: selected.snapshot?.messagePosture ?? selected.accelerator,
        guardrail: "Snapshot is inspect-only. Any outbound-facing work still requires approval.",
        scores: [
          { label: "Score", value: selected.score, detail: selected.segment, tone: selected.tone },
          { label: "Channel", value: humanize(selected.snapshot?.preferredChannel ?? "review"), detail: "Preferred", tone: "blue" as const },
          { label: "Outbound", value: "Locked", detail: "Approval gate", tone: "amber" as const },
        ],
        proofPoints: selected.snapshot?.riskFlags?.length ? selected.snapshot.riskFlags.map(humanize) : ["Human approval required"],
        actions: [
          { label: "Open related CRM", href: selected.crmPath, variant: "ghost" as const },
          { label: "Open full persona rule", href: `/persona-intelligence/${selected.key}`, variant: "ghost" as const },
        ],
      };
    }
  }

  if (tab === "signals" || tab === "guardrails") {
    const rows = tab === "signals" ? signals : guardrails;
    const selected = rows.find((row, index) => signalKey(row, index) === inspectedKey) ?? rows[0] ?? null;
    if (selected) {
      return {
        title: selected.signal,
        persona: humanize(selected.source),
        confidence: selected.priority,
        stage: tab === "signals" ? "Knowledge entry" : "Guardrail rule",
        reason: selected.engineUse,
        nextAction: tab === "signals" ? "Use this as evidence in a draft, then create an approval item." : "Flag any draft that violates this rule before review.",
        cta: "Internal use only",
        messageAngle: selected.engineUse,
        guardrail: "No send, publish, launch, spend, or contact action is enabled from this page.",
        scores: [
          { label: "Priority", value: selected.priority, detail: humanize(selected.source), tone: selected.priority.toLowerCase().includes("high") ? ("amber" as const) : ("blue" as const) },
          { label: "Action", value: "Inspect", detail: "Read-only", tone: "gray" as const },
          { label: "Outbound", value: "Locked", detail: "Approval gate", tone: "amber" as const },
        ],
        proofPoints: [selected.engineUse],
        actions: tab === "guardrails" ? [{ label: "Open settings", href: "/settings", variant: "ghost" as const }] : [],
      };
    }
  }

  const selectedRule = personaRows.find(({ rule }) => personaSlug(rule.persona) === inspectedKey)?.rule ?? personaRows[0]?.rule;
  return {
    title: selectedRule?.label ?? "Persona operating rules",
    persona: selectedRule?.label ?? "All personas",
    confidence: "Rules defined",
    stage: selectedRule?.segment ?? "Internal planning",
    reason: selectedRule?.messageAngle ?? "Mark should use persona rules to prepare reviewable work, not to publish or contact anyone.",
    nextAction: selectedRule?.landingRule ?? "Use persona CTA rules when generating campaign briefs and approval cards.",
    cta: selectedRule ? `${selectedRule.primaryCta} / ${selectedRule.secondaryCta}` : "Call Now / Upload Photos, Request Vendor Packet, Refer a Client, or Become a Partner.",
    messageAngle: selectedRule?.messageAngle ?? "Restoration, mitigation, documentation, rebuild, and partner handoff.",
    guardrail: selectedRule?.guardrail ?? "Persona rules are internal only. No page publishing, sending, launch, spend, or contact action is enabled.",
    scores: [
      { label: "Personas", value: PERSONA_CTA_RULES.length, detail: "Official tags", tone: "blue" as const },
      { label: "Publishing", value: "Locked", detail: "Internal planning only", tone: "amber" as const },
      { label: "Approval", value: "Required", detail: "Before outbound", tone: "green" as const },
    ],
    proofPoints: selectedRule ? [selectedRule.landingRule, selectedRule.guardrail] : ["Human approval required"],
    actions: selectedRule
      ? [
          { label: "Open full persona rule", href: `/persona-intelligence/${personaSlug(selectedRule.persona)}`, variant: "primary" as const },
          { label: "Open settings", href: "/settings", variant: "ghost" as const },
        ]
      : [{ label: "Open settings", href: "/settings", variant: "ghost" as const }],
  };
}

function parseTab(tab: string | undefined): IntelligenceTab {
  return TABS.some((item) => item.id === tab) ? (tab as IntelligenceTab) : "personas";
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function signalKey(row: PersonaContentSignal, index: number) {
  return `${index}-${row.source}-${row.signal}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function humanize(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
