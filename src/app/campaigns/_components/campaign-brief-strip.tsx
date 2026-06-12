"use client";

import { useState } from "react";

import type { CampaignWorkspaceMeta, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

type TabKey = "creative" | "media" | "audience" | "reasoning" | "approvals" | "performance";
type Tone = "blue" | "green" | "amber" | "red";

function toneText(tone: Tone) {
  if (tone === "green") return "text-[oklch(0.84_0.13_155)]";
  if (tone === "amber") return "text-[oklch(0.89_0.12_76)]";
  if (tone === "red") return "text-[oklch(0.86_0.1_26)]";
  return "text-[var(--accent)]";
}

/**
 * Below-hero brief: the four key facts as a line-divided definition list (no
 * boxes), a compact inline row of clickable metric stats that jump to tabs, and
 * a collapsible full brief that emphasizes compliance. Replaces the old metric
 * grid + BriefCards + FullBrief from campaign-package-panel.
 */
export function CampaignBriefStrip({
  detail,
  onOpenTab,
}: {
  detail: LiveCampaignWorkspace;
  onOpenTab: (tab: TabKey) => void;
}) {
  const { campaign, sources, reasoning, metrics, media } = detail;
  const guardrailCount = reasoning.guardrailFlags.length;
  const [briefOpen, setBriefOpen] = useState(false);

  const facts: Array<{ tone: Tone; label: string; value: string }> = [
    { tone: "blue", label: "Audience", value: campaign.audienceSummary },
    { tone: "green", label: "Offer", value: campaign.offerSummary },
    { tone: "amber", label: "Persona", value: campaign.persona },
    {
      tone: guardrailCount > 0 ? "red" : "green",
      label: "Guardrails",
      value:
        guardrailCount > 0
          ? reasoning.guardrailFlags.slice(0, 3).join(" · ")
          : "No risky claims recorded. Dispatch stays locked until approval.",
    },
  ];

  const stats: Array<{ label: string; value: number; tab: TabKey }> = [
    { label: "Deliverables", value: metrics.assets, tab: "creative" },
    { label: "Media", value: media.length, tab: "media" },
    { label: "Sources", value: metrics.sources, tab: "audience" },
    { label: "Approvals", value: metrics.approvals, tab: "approvals" },
  ];

  return (
    <section className="module-rise mb-5 space-y-3">
      {/* Facts: gap-px over a hairline background paints the dividing lines. */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--border-hairline)] shadow-[var(--elev-panel)] sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="bg-[var(--surface-panel)] px-5 py-4">
            <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${toneText(fact.tone)}`}>{fact.label}</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">{fact.value}</p>
          </div>
        ))}
      </div>

      {/* Inline metric stats (jump to tab) + full-brief toggle. */}
      <div className="flex flex-wrap items-center gap-2">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onOpenTab(stat.tab)}
            className="inline-flex items-baseline gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-1.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="font-display text-base font-black tabular-nums text-[var(--text-primary)]">{stat.value}</span>
            <span className="text-xs font-semibold text-[var(--text-muted)]">{stat.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBriefOpen((value) => !value)}
          aria-expanded={briefOpen}
          aria-controls="campaign-full-brief"
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-1.5 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <span className="signal-eyebrow">Full brief &amp; compliance</span>
          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">{briefOpen ? "Collapse" : "Expand"}</span>
        </button>
      </div>

      <div
        id="campaign-full-brief"
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${briefOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <FullBriefBody campaign={campaign} sourceCount={sources.length} />
        </div>
      </div>
    </section>
  );
}

function FullBriefBody({ campaign, sourceCount }: { campaign: CampaignWorkspaceMeta; sourceCount: number }) {
  const rows: Array<[string, string]> = [
    ["Objective", campaign.objective],
    ["Audience", campaign.audienceSummary],
    ["Offer", campaign.offerSummary],
    ["Persona", campaign.persona],
    ["Restoration focus", campaign.restorationFocus],
    ["Owner", campaign.owner],
    ["Linked sources", `${sourceCount} record${sourceCount === 1 ? "" : "s"}`],
    ["Updated", campaign.updatedAt],
  ];

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      {/* Compliance gets its own emphasized block — it's the load-bearing field. */}
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[oklch(0.89_0.12_76)]">Compliance</div>
        <p className="mt-1.5 max-w-[80ch] text-sm leading-6 text-[var(--text-primary)]">{campaign.complianceNotes}</p>
      </div>
      <dl className="divide-y divide-[var(--border-hairline)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-3 px-5 py-3 sm:grid-cols-[170px_minmax(0,1fr)]">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
            <dd className="min-w-0 text-sm leading-6 text-[var(--text-secondary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
