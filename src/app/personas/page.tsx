import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import {
  ActionFeedback,
  PageHeader,
  StatStrip,
  StatusPill,
  buttonClasses,
  type StatItem,
} from "../_components/page-header";
import { cx, type ThemeTone } from "../_components/theme";
import { WorkspacePanel } from "../_components/workspace";
import {
  DEMO_PERSONAS,
  PERSONA_SEGMENTS,
  parsePersonaSegment,
  type DemoPersona,
  type PersonaSegmentKey,
  type PersonaStage,
} from "./_data/demo-personas";

type PageProps = {
  searchParams?: Promise<{
    segment?: string | string[];
    action?: string | string[];
  }>;
};

const STAGE_TONE: Record<PersonaStage, ThemeTone> = {
  New: "gray",
  "Hot lead": "blue",
  Active: "green",
  Champion: "green",
  "At risk": "amber",
  Dormant: "gray",
};

export default async function PersonasPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const activeSegment = parsePersonaSegment(valueOf(params.segment));
  const action = valueOf(params.action);

  const visible = (activeSegment === "all" ? DEMO_PERSONAS : DEMO_PERSONAS.filter((persona) => persona.segment === activeSegment))
    .slice()
    .sort((a, b) => b.score - a.score);

  const avgScore = Math.round(DEMO_PERSONAS.reduce((sum, persona) => sum + persona.score, 0) / DEMO_PERSONAS.length);
  const needAttention = DEMO_PERSONAS.filter((persona) => persona.stage === "At risk" || persona.stage === "Dormant").length;
  const stats: StatItem[] = [
    { label: "Personas", value: DEMO_PERSONAS.length, hint: "Audiences defined", tone: "accent" },
    { label: "Segments", value: PERSONA_SEGMENTS.length, hint: "Lifecycle groups" },
    { label: "Avg lead score", value: avgScore, hint: "Across all personas", tone: "ok" },
    { label: "Need attention", value: needAttention, hint: needAttention > 0 ? "At risk or dormant" : "All healthy", tone: needAttention > 0 ? "amber" : "neutral" },
  ];

  const activeLabel =
    activeSegment === "all" ? "All personas" : PERSONA_SEGMENTS.find((segment) => segment.key === activeSegment)?.label ?? "Personas";
  const activeBlurb =
    activeSegment === "all"
      ? "Every audience you've defined, across the full customer lifecycle."
      : PERSONA_SEGMENTS.find((segment) => segment.key === activeSegment)?.blurb ?? "";

  return (
    <>
      <PageHeader
        title="Personas"
        description="Define who you sell to and how to reach each one — your audience intelligence in one place."
        aside={
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/personas?action=new">
            <Plus aria-hidden className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />
            New persona
          </Link>
        }
      />

      <ActionFeedback action={action} messages={{ new: "Preview: creating personas isn't wired up yet — coming soon." }} />

      <StatStrip className="mb-5" columns={4} items={stats} />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[184px_minmax(0,1fr)]">
        <SegmentRail active={activeSegment} />
        <WorkspacePanel
          title={activeLabel}
          description={activeBlurb}
          aside={
            <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {visible.length} {visible.length === 1 ? "persona" : "personas"}
            </span>
          }
        >
          <div className="p-1.5">
            {visible.map((persona) => (
              <PersonaConsoleRow key={persona.slug} persona={persona} />
            ))}
          </div>
        </WorkspacePanel>
      </div>
    </>
  );
}

function SegmentRail({ active }: { active: PersonaSegmentKey | "all" }) {
  const items: Array<{ key: PersonaSegmentKey | "all"; label: string; count: number }> = [
    { key: "all", label: "All personas", count: DEMO_PERSONAS.length },
    ...PERSONA_SEGMENTS.map((segment) => ({
      key: segment.key,
      label: segment.label,
      count: DEMO_PERSONAS.filter((persona) => persona.segment === segment.key).length,
    })),
  ];

  return (
    <nav aria-label="Persona segments" className="flex flex-col gap-0.5 lg:sticky lg:top-5 lg:self-start">
      <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Segments</div>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            aria-current={isActive ? "page" : undefined}
            href={item.key === "all" ? "/personas" : `/personas?segment=${item.key}`}
            className={cx(
              "flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] transition",
              isActive
                ? "bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
            )}
          >
            <span className="flex items-center gap-2">
              <span className={cx("h-1.5 w-1.5 rounded-full", isActive ? "bg-[var(--accent)]" : "bg-transparent")} aria-hidden />
              {item.label}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{item.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PersonaConsoleRow({ persona }: { persona: DemoPersona }) {
  return (
    <Link
      href={`/personas/${persona.slug}`}
      className="group flex items-center gap-3.5 rounded-[10px] px-3.5 py-3 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <Monogram initials={persona.initials} live={persona.live} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
            {persona.name}
          </span>
          {persona.live ? <span aria-hidden title="Live data" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ok)]" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-[1.4] text-[var(--text-secondary)]">{persona.angle}</span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <StatusPill tone={STAGE_TONE[persona.stage]}>{persona.stage}</StatusPill>
      </span>
      <ScoreMeter score={persona.score} />
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--accent)] sm:block" strokeWidth={1.8} />
    </Link>
  );
}

function Monogram({ initials, live }: { initials: string; live: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border text-[13px] font-semibold tracking-[0.02em]",
        live
          ? "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-[var(--accent)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
      )}
    >
      {initials}
    </span>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <span className="w-[62px] shrink-0">
      <span className="block text-right text-[9.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">Score</span>
      <span className="block text-right font-display text-[15px] font-semibold tabular-nums leading-none text-[var(--text-primary)]">{score}</span>
      <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
