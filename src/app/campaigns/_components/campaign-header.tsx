import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignLaunchState, CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

// statusTone import removed: the header now shows the derived lifecycle, not raw status.

const LIFECYCLE_TONE: Record<CampaignLaunchState["lifecycle"], "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

export function CampaignHeader({ campaign, launchState }: { campaign: CampaignWorkspaceMeta; launchState: CampaignLaunchState }) {
  // Identity-at-a-glance only; the full brief below carries focus, owner, and the rest.
  const meta: Array<[string, string]> = [
    ["Persona", cleanPersonaLabel(campaign.persona)],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <header className="module-rise mb-5">
      <Link
        href="/campaigns"
        className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="M12 5 7 10l5 5" />
          <path d="M8 10h8" />
        </svg>
        Back to campaigns
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,oklch(0.74_0.115_232/0.16),transparent_46%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="signal-eyebrow">Campaign</span>
            <StatusPill tone={LIFECYCLE_TONE[launchState.lifecycle]}>{launchState.lifecycle}</StatusPill>
            {launchState.live ? (
              <StatusPill tone="green">Outbound unlocked</StatusPill>
            ) : (
              <StatusPill tone="amber">Outbound locked</StatusPill>
            )}
          </div>

          <h1 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,3vw,2.4rem)] font-black leading-[1.03] tracking-[-0.04em] text-[var(--text-primary)]">
            {campaign.name}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            {meta.map(([label, value]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-1 text-xs"
              >
                <span className="font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold text-[var(--text-primary)]">{value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function cleanPersonaLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
