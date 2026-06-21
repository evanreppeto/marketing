import { ArrowLeft, ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import Link from "next/link";

import { EmptyState, PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
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
  const awaiting = persona.arcActivity.filter((item) => item.status === "Awaiting approval").length;

  return (
    <>
      <Link
        href="/personas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.9} />
        All personas
      </Link>

      <section className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="grid gap-7 p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <Monogram initials={persona.initials} live={persona.live} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">{persona.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">{segmentLabel(persona.segment)}</span>
                  {persona.live ? <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--ok)]">Live data</span> : null}
                </div>
              </div>
            </div>
            <p className="mt-5 max-w-[60ch] font-serif text-[19px] italic leading-snug text-[var(--text-secondary)]">
              &ldquo;{persona.quote}&rdquo;
            </p>
          </div>

          <div className="flex shrink-0 gap-8 border-t border-[var(--border-hairline)] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Lead score</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-5xl font-bold leading-none tracking-[-0.05em] tabular-nums text-[var(--text-primary)]">{persona.score}</span>
                <span className="text-sm text-[var(--text-muted)]">/100</span>
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Sparkline points={persona.scoreTrend} rising={trendDelta >= 0} />
                <span className={cx("font-mono text-xs font-semibold tabular-nums", trendDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--warn)]")}>
                  {trendDelta >= 0 ? "+" : "−"}
                  {Math.abs(trendDelta)}
                </span>
              </div>
            </div>
            <div className="border-l border-[var(--border-hairline)] pl-8">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Audience</div>
              <div className="mt-1 font-display text-5xl font-bold leading-none tracking-[-0.05em] tabular-nums text-[var(--text-primary)]">{persona.audienceShare}%</div>
              <div className="mt-3 text-xs text-[var(--text-muted)]">of all contacts</div>
            </div>
          </div>
        </div>
      </section>

      <section className="module-rise mb-5 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,var(--border-panel))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-panel))] shadow-[var(--elev-panel)] [animation-delay:60ms]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{AGENT_NAME}</div>
            <h2 className="mt-0.5 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Working this persona for you</h2>
          </div>
          {awaiting > 0 ? <StatusPill tone="amber">{awaiting} awaiting approval</StatusPill> : <StatusPill tone="gray">Up to date</StatusPill>}
        </div>

        <div className="grid gap-x-8 gap-y-6 p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Field label="Message angle">{persona.angle}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recommended CTA">{persona.cta}</Field>
              <Field label="Preferred channel">{persona.channel}</Field>
            </div>
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
          </div>

          <div>
            <FieldLabel>Recently prepared</FieldLabel>
            <div className="mt-2.5 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
              <div className="divide-y divide-[var(--border-hairline)]">
                {persona.arcActivity.map((item) => (
                  <div className="flex items-center justify-between gap-3 px-4 py-3" key={item.title}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">{item.when}</div>
                    </div>
                    <StatusPill tone={ACTIVITY_TONE[item.status]}>{item.status}</StatusPill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-6 py-4">
          <span className="flex items-center gap-2 text-[12px] leading-5 text-[var(--text-muted)]">
            <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} />
            {AGENT_NAME} drafts; you approve. Nothing goes out until then.
          </span>
          <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/arc">
            Draft with {AGENT_NAME}
            <ArrowUpRight aria-hidden className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <main className="min-w-0 space-y-5">
          <WorkspacePanel title="Why this score" description="What makes up the lead score — and the evidence behind each signal.">
            <div className="space-y-6 px-5 py-5">
              {SCORE_SIGNALS.map((signal) => (
                <SignalBlock
                  key={signal.key}
                  label={signal.label}
                  hint={signal.hint}
                  value={persona.signals[signal.key]}
                  drivers={persona.signalDrivers[signal.key]}
                />
              ))}
              <p className="border-t border-[var(--border-hairline)] pt-4 text-[12px] leading-5 text-[var(--text-muted)]">
                Scores are deterministic and explainable — computed by the app from these signals, not a model black box.
              </p>
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Who they are">
            <div className="space-y-5 px-5 py-5">
              <p className="max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{persona.profile}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <TraitList title="What they want" items={persona.goals} tone="ok" />
                <TraitList title="What holds them back" items={persona.objections} tone="amber" />
              </div>
            </div>
          </WorkspacePanel>
        </main>

        <aside className="min-w-0 space-y-5">
          <WorkspacePanel title="Snapshot">
            <DetailStack
              items={[
                { label: "Segment", value: segmentLabel(persona.segment) },
                { label: "Lifecycle stage", value: <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill> },
                { label: "Preferred channel", value: persona.channel },
                { label: "Best timing", value: persona.bestTiming },
              ]}
            />
          </WorkspacePanel>

          <WorkspacePanel title="Recommended message" description="An example of what Arc would draft — for review, never auto-sent.">
            <div className="px-5 py-5">
              <FieldLabel>Subject</FieldLabel>
              <div className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{persona.sampleMessage.subject}</div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{persona.sampleMessage.preview}</p>
            </div>
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
        </aside>
      </div>

      <nav aria-label="Persona navigation" className="mt-5 grid gap-3 sm:grid-cols-2">
        {prev ? <AdjacentLink persona={prev} direction="prev" /> : <span aria-hidden />}
        {next ? <AdjacentLink persona={next} direction="next" /> : <span aria-hidden />}
      </nav>
    </>
  );
}

function Sparkline({ points, rising }: { points: number[]; rising: boolean }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 30;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((value, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((value - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden className="shrink-0">
      <path d={d} stroke={rising ? "var(--accent)" : "var(--warn)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

function Monogram({ initials, live, size = "md" }: { initials: string; live: boolean; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-xl border font-semibold tracking-[0.02em]",
        size === "lg" ? "h-16 w-16 text-[20px]" : "h-14 w-14 text-[18px]",
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
