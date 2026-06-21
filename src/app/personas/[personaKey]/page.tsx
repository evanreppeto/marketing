import { Lock } from "lucide-react";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { cx, type ThemeTone } from "@/app/_components/theme";
import { WorkspacePanel } from "@/app/_components/workspace";
import {
  SCORE_SIGNALS,
  getPersonaBySlug,
  segmentLabel,
  type DemoPersona,
  type PersonaStage,
} from "../_data/demo-personas";

const AGENT_NAME = "Arc";

const STAGE_TONE: Record<PersonaStage, ThemeTone> = {
  New: "gray",
  "Hot lead": "blue",
  Active: "green",
  Champion: "green",
  "At risk": "amber",
  Dormant: "gray",
};

type PageProps = { params: Promise<{ personaKey: string }> };

export default async function PersonaDetailPage({ params }: PageProps) {
  const { personaKey } = await params;
  const persona = getPersonaBySlug(personaKey);

  if (!persona) {
    return (
      <>
        <PageHeader backHref="/personas" backLabel="All personas" title="Persona not found" description="This persona isn't part of your current audience set." />
        <EmptyState title="Unknown persona" detail="Head back to all personas and pick one from the list." />
      </>
    );
  }

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

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <ScorePanel persona={persona} />
        <ArcPanel persona={persona} />
      </div>
    </>
  );
}

function ScorePanel({ persona }: { persona: DemoPersona }) {
  return (
    <WorkspacePanel title="Lead score" description="How ready and valuable this audience is to act on right now.">
      <div className="px-5 py-5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tracking-[-0.04em] tabular-nums text-[var(--text-primary)]">{persona.score}</span>
          <span className="text-sm text-[var(--text-muted)]">/ 100</span>
        </div>

        <div className="mt-5 space-y-4">
          {SCORE_SIGNALS.map((signal) => (
            <SignalRow key={signal.key} label={signal.label} value={persona.signals[signal.key]} hint={signal.hint} />
          ))}
        </div>

        <p className="mt-5 border-t border-[var(--border-hairline)] pt-4 text-[12px] leading-5 text-[var(--text-muted)]">
          Scores are deterministic and explainable — computed by the app from these signals, not a model black box.
        </p>
      </div>
    </WorkspacePanel>
  );
}

function ArcPanel({ persona }: { persona: DemoPersona }) {
  return (
    <WorkspacePanel title={`How ${AGENT_NAME} uses this persona`} description="The inputs the agent draws on to prepare reviewable work for this audience.">
      <div className="space-y-4 px-5 py-5">
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

        <p className="flex items-center gap-2 border-t border-[var(--border-hairline)] pt-4 text-[12px] leading-5 text-[var(--text-muted)]">
          <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} />
          {AGENT_NAME} drafts campaigns for this persona. A human approves — nothing goes out until then.
        </p>
      </div>
    </WorkspacePanel>
  );
}

function SignalRow({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{value}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
        <span className={cx("block h-full rounded-full bg-[var(--accent)]")} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1.5 text-[11.5px] leading-5 text-[var(--text-muted)]">{hint}</div>
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
