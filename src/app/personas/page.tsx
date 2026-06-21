import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader, buttonClasses } from "../_components/page-header";
import { cx } from "../_components/theme";
import { listPersonas } from "@/lib/personas/console";
import { PERSONA_SEGMENTS, parsePersonaSegment } from "./_data/demo-personas";
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
  const arcDrafts = personas.reduce(
    (total, persona) => total + persona.arcActivity.filter((item) => item.status === "Awaiting approval").length,
    0,
  );

  const tabs: Array<{ key: string; label: string; href: string }> = [
    { key: "all", label: "All", href: "/personas" },
    ...PERSONA_SEGMENTS.map((segment) => ({ key: segment.key, label: segment.label, href: `/personas?segment=${segment.key}` })),
  ];

  return (
    <div>
      <PageHeader
        title="Personas"
        description="Who you sell to, and how to reach each one."
        aside={
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/personas/new">
            <Plus aria-hidden className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />
            New persona
          </Link>
        }
      />

      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--text-muted)]">
        <span>
          <span className="tabular-nums text-[var(--text-secondary)]">{personas.length}</span> audiences
        </span>
        <span aria-hidden className="opacity-50">·</span>
        <span>
          avg lead score <span className="tabular-nums text-[var(--text-secondary)]">{avgScore}</span>
        </span>
        {needAttention > 0 ? (
          <>
            <span aria-hidden className="opacity-50">·</span>
            <span className="tabular-nums text-[var(--warn)]">{needAttention} need attention</span>
          </>
        ) : null}
      </div>

      {arcDrafts > 0 ? (
        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-secondary)]">
          Arc has <span className="font-medium tabular-nums text-[var(--text-primary)]">{arcDrafts} drafts</span> awaiting your approval.
          <Link
            href="/arc"
            className="inline-flex items-center gap-1 text-[var(--text-secondary)] underline decoration-[var(--text-muted)]/40 underline-offset-4 transition hover:text-[var(--text-primary)]"
          >
            Open Arc
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
          </Link>
        </p>
      ) : null}

      <nav aria-label="Persona segments" className="mt-8 flex gap-7 border-b border-[var(--border-hairline)]">
        {tabs.map((tab) => {
          const active = activeSegment === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px pb-3 text-[13.5px] transition",
                active
                  ? "text-[var(--text-primary)] shadow-[inset_0_-1px_0_var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <PersonaRoster personas={visible} />
    </div>
  );
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
