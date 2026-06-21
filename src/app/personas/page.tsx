import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader, StatStrip, buttonClasses, type StatItem } from "../_components/page-header";
import { cx } from "../_components/theme";
import { WorkspacePanel } from "../_components/workspace";
import { listPersonas, type Persona } from "@/lib/personas/console";
import { PERSONA_SEGMENTS, parsePersonaSegment, type PersonaSegmentKey } from "./_data/demo-personas";
import { PersonaRoster } from "./_components/persona-roster";

type PageProps = {
  searchParams?: Promise<{ segment?: string | string[] }>;
};

export default async function PersonasPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const activeSegment = parsePersonaSegment(valueOf(params.segment));
  const personas = await listPersonas();

  const visible = activeSegment === "all" ? personas : personas.filter((persona) => persona.segment === activeSegment);

  const avgScore = personas.length ? Math.round(personas.reduce((sum, persona) => sum + persona.score, 0) / personas.length) : 0;
  const needAttention = personas.filter((persona) => persona.stage === "At risk" || persona.stage === "Dormant").length;
  const stats: StatItem[] = [
    { label: "Personas", value: personas.length, hint: "Audiences defined", tone: "accent" },
    { label: "Segments", value: PERSONA_SEGMENTS.length, hint: "Lifecycle groups" },
    { label: "Avg lead score", value: avgScore, hint: "Across all personas", tone: "ok" },
    { label: "Need attention", value: needAttention, hint: needAttention > 0 ? "At risk or dormant" : "All healthy", tone: needAttention > 0 ? "amber" : "neutral" },
  ];

  const arcDrafts = personas.reduce(
    (total, persona) => total + persona.arcActivity.filter((item) => item.status === "Awaiting approval").length,
    0,
  );

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
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/personas/new">
            <Plus aria-hidden className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />
            New persona
          </Link>
        }
      />

      <StatStrip className="mb-5" columns={4} items={stats} />

      {arcDrafts > 0 ? (
        <Link
          href="/arc"
          className="module-rise mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--border-panel))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-panel))] px-4 py-3 transition hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-panel))]"
        >
          <span className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Arc</span>
            <span>
              <span className="font-semibold text-[var(--text-primary)]">{arcDrafts} drafts</span> awaiting your approval across these personas.
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
            Open Arc
            <ArrowUpRight aria-hidden className="h-4 w-4" strokeWidth={2} />
          </span>
        </Link>
      ) : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[184px_minmax(0,1fr)]">
        <SegmentRail active={activeSegment} personas={personas} />
        <WorkspacePanel
          title={activeLabel}
          description={activeBlurb}
          aside={
            <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {visible.length} {visible.length === 1 ? "persona" : "personas"}
            </span>
          }
        >
          <PersonaRoster personas={visible} />
        </WorkspacePanel>
      </div>
    </>
  );
}

function SegmentRail({ active, personas }: { active: PersonaSegmentKey | "all"; personas: Persona[] }) {
  const items: Array<{ key: PersonaSegmentKey | "all"; label: string; count: number }> = [
    { key: "all", label: "All personas", count: personas.length },
    ...PERSONA_SEGMENTS.map((segment) => ({
      key: segment.key,
      label: segment.label,
      count: personas.filter((persona) => persona.segment === segment.key).length,
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

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
