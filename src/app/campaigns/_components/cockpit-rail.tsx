import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

/** The decision context beside the creative: why, who, risk, and two key facts.
 *  Condensed from the executive overview + brief — no new data. */
export function CockpitRail({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, executiveOverview, reasoning, sources } = detail;
  const flags = reasoning.guardrailFlags;

  const blocks: Array<{ label: string; value: string; tone?: "ok" | "warn" }> = [
    { label: "Why", value: executiveOverview.why },
    { label: "Who", value: `${cleanPersona(campaign.persona)} · ${sources.length} linked source${sources.length === 1 ? "" : "s"}` },
    flags.length > 0
      ? { label: "Risk", value: `${flags.length} guardrail flag${flags.length === 1 ? "" : "s"}: ${flags.slice(0, 2).join(" / ")}`, tone: "warn" }
      : { label: "Risk", value: "No flags", tone: "ok" },
    { label: "Timeframe", value: executiveOverview.timeframe },
    { label: "Success measured by", value: executiveOverview.successTracking },
  ];

  return (
    <aside className="signal-panel module-rise space-y-3 p-4" aria-label="Campaign context">
      {blocks.map((b) => (
        <div key={b.label}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{b.label}</div>
          <p
            className={
              b.tone === "warn"
                ? "mt-1 text-sm leading-5 text-[var(--priority-text)]"
                : b.tone === "ok"
                  ? "mt-1 text-sm leading-5 text-[var(--ok-text)]"
                  : "mt-1 text-sm leading-5 text-[var(--text-secondary)]"
            }
          >
            {b.value}
          </p>
        </div>
      ))}
    </aside>
  );
}

function cleanPersona(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
