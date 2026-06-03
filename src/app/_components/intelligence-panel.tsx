import Link from "next/link";

import { StatusPill, buttonClasses } from "./page-header";

type Tone = "amber" | "green" | "red" | "blue" | "gray" | "dark";

export type IntelligenceScore = {
  label: string;
  value: number | string | null;
  detail?: string;
  tone?: Tone;
};

export type IntelligencePanelModel = {
  title?: string;
  persona?: string | null;
  confidence?: string | number | null;
  journeyStage?: string | null;
  urgency?: string | null;
  attentionReason?: string | null;
  nextBestAction?: string | null;
  cta?: string | null;
  messageAngle?: string | null;
  proofPoints?: string[];
  guardrailStatus?: string | null;
  evidence?: Array<{ label: string; href?: string | null; detail?: string | null }>;
  scores?: IntelligenceScore[];
  actions?: Array<{ label: string; href: string; variant?: "primary" | "ghost" }>;
  outboundLocked?: boolean;
  emptyDetail?: string;
};

export function IntelligencePanel({
  model,
  className = "",
}: {
  model: IntelligencePanelModel;
  className?: string;
}) {
  const hasSubstance = Boolean(
    model.persona ||
      model.confidence ||
      model.journeyStage ||
      model.urgency ||
      model.attentionReason ||
      model.nextBestAction ||
      model.cta ||
      model.messageAngle ||
      model.guardrailStatus ||
      model.proofPoints?.length ||
      model.evidence?.length ||
      model.scores?.length,
  );

  return (
    <section className={`overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] ${className}`}>
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="signal-eyebrow">Growth intelligence</div>
          <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
            {model.title ?? "What needs attention"}
          </h2>
        </div>
        <StatusPill tone={model.outboundLocked === false ? "green" : "amber"}>
          {model.outboundLocked === false ? "Internal only" : "Outbound locked"}
        </StatusPill>
      </div>

      {hasSubstance ? (
        <>
          <div className="grid gap-3 border-b border-[var(--border-hairline)] px-4 py-4 sm:grid-cols-2">
            <Field label="Persona" value={model.persona ?? "Unassigned"} />
            <Field label="Confidence" value={formatValue(model.confidence, "Missing")} />
            <Field label="Journey stage" value={model.journeyStage ?? "Unknown"} />
            <Field label="Urgency" value={model.urgency ?? "Not scored"} />
          </div>

          {model.scores && model.scores.length > 0 ? (
            <div className="grid gap-2 border-b border-[var(--border-hairline)] p-4 sm:grid-cols-3">
              {model.scores.map((score) => (
                <div key={score.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{score.label}</div>
                    <span className={`h-2 w-2 rounded-full ${dotClass(score.tone ?? scoreTone(score.value))}`} />
                  </div>
                  <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">
                    {formatValue(score.value, "—")}
                  </div>
                  {score.detail ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{score.detail}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-4 px-4 py-4">
            <Narrative label="Attention reason" value={model.attentionReason} />
            <Narrative label="Next best action" value={model.nextBestAction} strong />
            <Narrative label="CTA / landing rule" value={model.cta} />
            <Narrative label="Message angle" value={model.messageAngle} />
            <Narrative label="Guardrail result" value={model.guardrailStatus ?? "Human approval required before any outbound step."} />
          </div>

          {model.actions && model.actions.length > 0 ? (
            <div className="grid gap-2 border-t border-[var(--border-hairline)] px-4 py-4 sm:grid-cols-2">
              {model.actions.map((action) => (
                <Link
                  className={buttonClasses({ variant: action.variant ?? "ghost", size: "sm", className: "justify-between" })}
                  href={action.href}
                  key={`${action.label}-${action.href}`}
                >
                  <span>{action.label}</span>
                  <span className={action.variant === "primary" ? "text-[var(--on-accent)]/70" : "text-[var(--text-muted)]"}>Open</span>
                </Link>
              ))}
            </div>
          ) : null}

          {model.proofPoints && model.proofPoints.length > 0 ? (
            <div className="border-t border-[var(--border-hairline)] px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Proof points</div>
              <ul className="mt-3 space-y-2">
                {model.proofPoints.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {model.evidence && model.evidence.length > 0 ? (
            <div className="border-t border-[var(--border-hairline)] px-4 py-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Evidence</div>
              <div className="grid gap-2">
                {model.evidence.slice(0, 6).map((item) =>
                  item.href ? (
                    <a
                      key={`${item.label}-${item.href}`}
                      className={buttonClasses({ variant: "ghost", size: "sm", className: "justify-between" })}
                      href={item.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="text-[var(--text-muted)]">Open</span>
                    </a>
                  ) : (
                    <div key={item.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</div>
                      {item.detail ? <div className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{item.detail}</div> : null}
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 py-5">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {model.emptyDetail ?? "No intelligence fields are available yet. Mark can enrich the record, but outbound remains locked until a human approval exists."}
          </p>
        </div>
      )}
    </section>
  );
}

export function IntelligenceLinkList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; detail: string; href: string; tone?: Tone }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <h2 className="text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      </div>
      <div className="grid gap-2 p-4">
        {items.map((item) => (
          <Link
            key={item.label}
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3 transition hover:bg-[var(--surface-raised)]"
            href={item.href}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-[var(--text-primary)]">{item.label}</div>
              <span className={`h-2 w-2 rounded-full ${dotClass(item.tone ?? "blue")}`} />
            </div>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{item.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function Narrative({ label, value, strong = false }: { label: string; value?: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <p className={`mt-1 text-sm leading-6 ${strong ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
        {value}
      </p>
    </div>
  );
}

function formatValue(value: string | number | null | undefined, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function scoreTone(value: string | number | null | undefined): Tone {
  if (typeof value !== "number") return "gray";
  if (value >= 80) return "green";
  if (value >= 55) return "amber";
  return "red";
}

function dotClass(tone: Tone) {
  if (tone === "green") return "bg-[var(--ok)]";
  if (tone === "amber") return "bg-[var(--warn)]";
  if (tone === "red") return "bg-[var(--priority)]";
  if (tone === "blue" || tone === "dark") return "bg-[var(--accent)]";
  return "bg-[var(--text-muted)]";
}
