import type { ChecklistStep } from "./campaign-detail-model";

const STEP_CLASSES: Record<ChecklistStep["state"], { item: string; marker: string; label: string }> = {
  done: {
    item: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)]",
    marker: "border-[var(--ok-border)] bg-[var(--ok-solid)] text-[var(--on-ok)]",
    label: "text-[var(--ok-text)]",
  },
  active: {
    item: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)]",
    marker: "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]",
    label: "text-[var(--accent-contrast)]",
  },
  locked: {
    item: "border-[var(--border-hairline)] bg-[var(--surface-soft)]",
    marker: "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-muted)]",
    label: "text-[var(--text-muted)]",
  },
};

export function CampaignChecklist({ steps }: { steps: ChecklistStep[] }) {
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <span className="signal-eyebrow">Simple path</span>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">How this campaign goes out</h2>
        </div>
        <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
          {steps.filter((step) => step.state === "done").length}/{steps.length}
        </span>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const classes = STEP_CLASSES[step.state];
          return (
            <li key={step.label} className={`min-w-0 rounded-lg border px-3 py-3 ${classes.item}`}>
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${classes.marker}`}
                >
                  {step.state === "done" ? "OK" : index + 1}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-bold ${classes.label}`}>{step.label}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{step.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
