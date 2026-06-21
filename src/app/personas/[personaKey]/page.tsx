import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";

import { EmptyState, PageHeader, StatStrip, StatusPill, type StatItem } from "@/app/_components/page-header";
import { cx, type ThemeTone } from "@/app/_components/theme";
import { DetailStack, WorkspacePanel } from "@/app/_components/workspace";
import { listPersonas, type Persona } from "@/lib/personas/console";
import { SCORE_SIGNALS, segmentLabel, type ArcActivityStatus, type PersonaStage } from "../_data/demo-personas";

const AGENT_NAME = "Arc";

const STAGE_TONE: Record<PersonaStage, ThemeTone> = {
  New: "gray",
  "Hot lead": "blue",
  Active: "green",
  Champion: "green",
  "At risk": "amber",
  Dormant: "gray",
};

const ACTIVITY_TONE: Record<ArcActivityStatus, ThemeTone> = {
  "Awaiting approval": "amber",
  "Draft ready": "blue",
  Prepared: "gray",
};

type PageProps = { params: Promise<{ personaKey: string }> };

export default async function PersonaDetailPage({ params }: PageProps) {
  const { personaKey } = await params;
  const personas = await listPersonas();
  const persona = personas.find((entry) => entry.slug === personaKey) ?? null;

  if (!persona) {
    return (
      <>
        <PageHeader backHref="/personas" backLabel="All personas" title="Persona not found" description="This persona isn't part of your current audience set." />
        <EmptyState title="Unknown persona" detail="Head back to all personas and pick one from the list." />
      </>
    );
  }

  const index = personas.findIndex((entry) => entry.slug === persona.slug);
  const prev = index > 0 ? personas[index - 1] : null;
  const next = index >= 0 && index < personas.length - 1 ? personas[index + 1] : null;
  const related = personas.filter((entry) => entry.segment === persona.segment && entry.slug !== persona.slug).slice(0, 4);
  const trendDelta = persona.scoreTrend[persona.scoreTrend.length - 1] - persona.scoreTrend[0];
  const stats: StatItem[] = [
    { label: "Lead score", value: persona.score, hint: "out of 100", tone: "accent" },
    { label: "Audience share", value: `${persona.audienceShare}%`, hint: "of all contacts" },
    {
      label: "30-day trend",
      value: `${trendDelta >= 0 ? "+" : "−"}${Math.abs(trendDelta)}`,
      hint: trendDelta >= 0 ? "trending up" : "trending down",
      tone: trendDelta >= 0 ? "ok" : "amber",
      delta: `${trendDelta >= 0 ? "+" : "−"}${Math.abs(trendDelta)}`,
      deltaTone: trendDelta >= 0 ? "ok" : "amber",
      spark: persona.scoreTrend.map((value) => value / 100),
    },
    { label: "Preferred channel", value: persona.channel },
  ];

  return (
    <>
      <PageHeader
        backHref="/personas"
        backLabel="All personas"
        title={persona.name}
        description={`${segmentLabel(persona.segment)} · ${persona.audience}`}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill>
            {persona.live ? <StatusPill tone="green">Live data</StatusPill> : <StatusPill tone="gray">No live data</StatusPill>}
          </div>
        }
      />

      <section className="module-rise mb-5 flex items-center gap-5 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <Monogram initials={persona.initials} live={persona.live} />
        <p className="min-w-0 font-serif text-[18px] italic leading-snug text-[var(--text-secondary)]">
          &ldquo;{persona.quote}&rdquo;
        </p>
      </section>

      <StatStrip className="mb-5" columns={4} items={stats} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <main className="min-w-0 space-y-5">
          <WorkspacePanel title="Who they are">
            <div className="space-y-5 px-5 py-5">
              <p className="max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{persona.profile}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <TraitList title="What they want" items={persona.goals} tone="ok" />
                <TraitList title="What holds them back" items={persona.objections} tone="amber" />
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Why this score" description="How ready and valuable this audience is to act on right now — and the evidence behind it.">
            <div className="px-5 py-5">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold tracking-[-0.04em] tabular-nums text-[var(--text-primary)]">{persona.score}</span>
                <span className="text-sm text-[var(--text-muted)]">/ 100 lead score</span>
              </div>

              <div className="mt-6 space-y-6">
                {SCORE_SIGNALS.map((signal) => (
                  <SignalBlock
                    key={signal.key}
                    label={signal.label}
                    hint={signal.hint}
                    value={persona.signals[signal.key]}
                    drivers={persona.signalDrivers[signal.key]}
                  />
                ))}
              </div>

              <p className="mt-6 border-t border-[var(--border-hairline)] pt-4 text-[12px] leading-5 text-[var(--text-muted)]">
                Scores are deterministic and explainable — computed by the app from these signals, not a model black box.
              </p>
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            title={`Recent ${AGENT_NAME} activity`}
            description="What the agent has prepared for this persona. Everything stays locked until you approve it."
          >
            <div className="divide-y divide-[var(--border-hairline)]">
              {persona.arcActivity.map((item) => (
                <div className="flex items-center justify-between gap-3 px-5 py-3.5" key={item.title}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">{item.when}</div>
                  </div>
                  <StatusPill tone={ACTIVITY_TONE[item.status]}>{item.status}</StatusPill>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </main>

        <aside className="min-w-0 space-y-5">
          <WorkspacePanel title="Snapshot">
            <DetailStack
              items={[
                { label: "Segment", value: segmentLabel(persona.segment) },
                { label: "Lifecycle stage", value: <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill> },
                { label: "Lead score", value: <span className="font-mono tabular-nums">{persona.score} / 100</span> },
                { label: "Preferred channel", value: persona.channel },
                { label: "Best timing", value: persona.bestTiming },
              ]}
            />
          </WorkspacePanel>

          {related.length > 0 ? (
            <WorkspacePanel title={`More ${segmentLabel(persona.segment)} personas`}>
              <div className="divide-y divide-[var(--border-hairline)]">
                {related.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={`/personas/${entry.slug}`}
                    className="group flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-[var(--surface-inset)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{entry.name}</span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{entry.stage}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{entry.score}</span>
                  </Link>
                ))}
              </div>
            </WorkspacePanel>
          ) : null}

          <WorkspacePanel title="Recommended message" description="An example of what Arc would draft — for review, never auto-sent.">
            <div className="px-5 py-5">
              <FieldLabel>Subject</FieldLabel>
              <div className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{persona.sampleMessage.subject}</div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{persona.sampleMessage.preview}</p>
            </div>
          </WorkspacePanel>

          <WorkspacePanel title={`How ${AGENT_NAME} uses this persona`} description="The inputs the agent draws on to prepare reviewable work.">
            <div className="space-y-4 px-5 py-5">
              <Field label="Message angle">{persona.angle}</Field>
              <Field label="Recommended CTA">{persona.cta}</Field>
              <Field label="Next best action">{persona.nextAction}</Field>
              <div>
                <FieldLabel>Proof points</FieldLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {persona.proofPoints.map((point) => (
                    <span key={point} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                      {point}
                    </span>
                  ))}
                </div>
              </div>
              <p className="flex items-start gap-2 border-t border-[var(--border-hairline)] pt-4 text-[12px] leading-5 text-[var(--text-muted)]">
                <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} />
                {AGENT_NAME} drafts campaigns for this persona. A human approves — nothing goes out until then.
              </p>
            </div>
          </WorkspacePanel>
        </aside>
      </div>

      <nav aria-label="Persona navigation" className="mt-5 grid gap-3 sm:grid-cols-2">
        {prev ? <AdjacentLink persona={prev} direction="prev" /> : <span aria-hidden />}
        {next ? <AdjacentLink persona={next} direction="next" /> : <span aria-hidden />}
      </nav>
    </>
  );
}

function AdjacentLink({ persona, direction }: { persona: Persona; direction: "prev" | "next" }) {
  const isNext = direction === "next";
  return (
    <Link
      href={`/personas/${persona.slug}`}
      className={cx(
        "group flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--surface-inset)]",
        isNext && "sm:flex-row-reverse sm:text-right",
      )}
    >
      {isNext ? (
        <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)]" strokeWidth={1.9} />
      ) : (
        <ArrowLeft aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)]" strokeWidth={1.9} />
      )}
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{isNext ? "Next" : "Previous"}</span>
        <span className="block truncate text-sm font-medium text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{persona.name}</span>
      </span>
    </Link>
  );
}

function Monogram({ initials, live }: { initials: string; live: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-[18px] font-semibold tracking-[0.02em]",
        live
          ? "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-[var(--accent)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
      )}
    >
      {initials}
    </span>
  );
}

function TraitList({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "amber" }) {
  const dot = tone === "ok" ? "bg-[var(--ok)]" : "bg-[var(--warn)]";
  return (
    <div>
      <FieldLabel>{title}</FieldLabel>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-6 text-[var(--text-secondary)]">
            <span aria-hidden className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalBlock({ label, hint, value, drivers }: { label: string; hint: string; value: number; drivers: string[] }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1.5 text-[11.5px] leading-5 text-[var(--text-muted)]">{hint}</div>
      <ul className="mt-2.5 space-y-1.5">
        {drivers.map((driver) => (
          <li key={driver} className="flex gap-2 text-[12.5px] leading-5 text-[var(--text-secondary)]">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
            <span className="min-w-0">{driver}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1.5 text-sm leading-6 text-[var(--text-primary)]">{children}</div>
    </div>
  );
}
