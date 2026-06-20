import Link from "next/link";

import { Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { PERSONA_CTA_RULES, personaSlug } from "@/lib/persona-intelligence/cta-rules";
import {
  type PersonaIntelligenceData,
  type PersonaTone,
} from "@/lib/persona-intelligence/read-model";

export type PersonaPanelRow = {
  key: string;
  label: string;
  segment: string | null;
  stage: string | null;
  score: number | null;
  tone: PersonaTone | null;
  nextAction: string | null;
  hasLive: boolean;
};

function formatPersonaLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Overlay live persona tracker rows onto the canonical persona set (by slug). */
export function buildPersonaPanelRows(data: PersonaIntelligenceData): PersonaPanelRow[] {
  if (data.status !== "live") return [];
  const liveBySlug = new Map(data.personas.map((p) => [p.key, p]));
  return PERSONA_CTA_RULES.map((rule) => {
    const slug = personaSlug(rule.persona);
    const live = liveBySlug.get(slug) ?? null;
    return {
      key: slug,
      label: live?.persona ?? formatPersonaLabel(String(rule.persona)),
      segment: live?.segment ?? null,
      stage: live?.stage ?? null,
      score: live?.score ?? null,
      tone: live?.tone ?? null,
      nextAction: live?.nextAction ?? null,
      hasLive: Boolean(live),
    };
  });
}

const MANAGE_LINK = (
  <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/persona-intelligence">
    Manage in Persona Intelligence
  </Link>
);

export function BrandPersonas({ data }: { data: PersonaIntelligenceData }) {
  const rows = buildPersonaPanelRows(data);

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div>
          <div className="signal-eyebrow">Audience</div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Personas</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Who the business markets to, with live read where available. Edit on the Persona Intelligence page.
          </p>
        </div>
        {MANAGE_LINK}
      </div>

      {data.status === "unavailable" ? (
        <div className="px-5 py-6 text-sm leading-6 text-[var(--text-secondary)]">
          Persona memory is unavailable right now. {data.message}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <article className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={row.key}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{row.label}</h3>
                  {row.segment ? <span className="text-xs text-[var(--text-muted)]">{row.segment}</span> : null}
                  {row.hasLive ? null : <span className="text-xs text-[var(--text-muted)]">No live read yet</span>}
                </div>
                {row.hasLive ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {row.stage ? <span className="font-semibold">{row.stage}.</span> : null} {row.nextAction || ""}
                  </p>
                ) : null}
              </div>
              {row.hasLive && row.score !== null ? (
                <StatusPill tone={row.tone ?? "gray"}>{`Score ${row.score}`}</StatusPill>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
