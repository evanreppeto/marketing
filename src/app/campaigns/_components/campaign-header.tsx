import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceMeta } from "@/lib/campaigns/read-model";

import { statusTone } from "./status-tone";

export function CampaignHeader({ campaign }: { campaign: CampaignWorkspaceMeta }) {
  const meta: Array<[string, string]> = [
    ["Persona", campaign.persona],
    ["Focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <header className="module-rise mb-5">
      <Link
        href="/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        Back to campaigns
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,oklch(0.74_0.115_232/0.16),transparent_46%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="signal-eyebrow">Campaign package</span>
            <StatusPill tone={statusTone(campaign.status)}>{campaign.status}</StatusPill>
            {campaign.launchLocked ? (
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Outbound locked</span>
            ) : null}
          </div>

          <h1 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,3vw,2.4rem)] font-black leading-[1.03] tracking-[-0.04em] text-[var(--text-primary)]">
            {campaign.name}
          </h1>

          {campaign.objective ? (
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>
          ) : null}

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
