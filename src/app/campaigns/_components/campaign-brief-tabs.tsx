"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { cx, theme } from "@/app/_components/theme";
import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceSource } from "@/lib/campaigns/read-model";

import { handToArcAction } from "../actions";
import type { ChecklistStep, SendExportFact } from "./campaign-detail-model";

type BriefTab = "brief" | "leads" | "handoff";

export function CampaignBriefTabs({
  agentName,
  audienceSummary,
  campaignId,
  facts,
  goal,
  offer,
  recommendedAction,
  sources,
  steps,
  why,
}: {
  agentName: string;
  audienceSummary: string;
  campaignId: string;
  facts: SendExportFact[];
  goal: string;
  offer: string;
  recommendedAction: string;
  sources: CampaignWorkspaceSource[];
  steps: ChecklistStep[];
  why: string;
}) {
  const [activeTab, setActiveTab] = useState<BriefTab>("brief");
  const activeStep = useMemo(
    () => steps.find((step) => step.state === "active") ?? steps.find((step) => step.state === "locked") ?? steps[0],
    [steps],
  );
  const tabs: Array<{ key: BriefTab; label: string; count?: number }> = [
    { key: "brief", label: "Brief" },
    { key: "leads", label: "Leads", count: sources.length },
    { key: "handoff", label: "Handoff", count: facts.length },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Campaign brief</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{audienceSummary}</p>
          </div>
          {activeStep ? <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${stepDotClass(activeStep.state)}`} title={activeStep.label} /> : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 border-b border-[var(--border-hairline)] pb-3">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative min-h-9 rounded-[8px] px-2 text-xs font-bold transition ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" ? <span className="ml-1 font-mono text-[11px] opacity-80">{tab.count}</span> : null}
                {active ? <span aria-hidden className={cx(theme.control.tabMarker, "bottom-[-0.75rem]")} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3">
        {activeTab === "brief" ? (
          <div className="space-y-2">
            <MiniFact label="Goal" value={goal} />
            <MiniFact label="Why this audience" value={why} />
            <MiniFact label="Offer" value={offer} />
            {activeStep ? (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Current step</div>
                <div className="mt-2 flex gap-2">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${stepDotClass(activeStep.state)}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)]">{activeStep.label}</div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{activeStep.detail}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "leads" ? <LinkedRecords sources={sources} /> : null}

        {activeTab === "handoff" ? (
          <div className="space-y-3">
            <SendExportList facts={facts} />
            <div className="rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] p-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Ask {agentName}</h3>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--accent-contrast)]">{recommendedAction}</p>
              <form action={handToArcAction} className="mt-3">
                <input type="hidden" name="campaignId" value={campaignId} />
                <button type="submit" className={buttonClasses({ size: "sm", className: "w-full justify-center" })}>
                  Ask {agentName} to keep building
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <p className="mt-1 line-clamp-3 text-sm leading-5 text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}

function LinkedRecords({ sources }: { sources: CampaignWorkspaceSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border-panel)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-soft)_78%,transparent),color-mix(in_srgb,var(--surface-inset)_72%,transparent))] px-3 py-3 text-xs leading-5 text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        No CRM records linked yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={source.id} className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-[var(--text-primary)]">{source.label}</span>
            {source.recordHref ? (
              <Link href={source.recordHref} className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline">
                Open
              </Link>
            ) : source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline">
                Open
              </a>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{source.kind}</div>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{source.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function SendExportList({ facts }: { facts: SendExportFact[] }) {
  if (facts.length === 0) {
    return <p className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-xs leading-5 text-[var(--text-secondary)]">Nothing is ready to send or export yet.</p>;
  }

  return (
    <div className="space-y-2">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
          <span className="text-xs font-semibold text-[var(--text-primary)]">{fact.label}</span>
          <StatusPill tone={factTone(fact.value)}>{fact.value}</StatusPill>
        </div>
      ))}
      <Link href="/outbox" className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full justify-center" })}>
        Open outbox
      </Link>
    </div>
  );
}

function stepDotClass(state: ChecklistStep["state"]) {
  if (state === "done") return "bg-[var(--ok)]";
  if (state === "active") return "bg-[var(--warn)]";
  return "bg-[var(--border-strong)]";
}

function factTone(value: SendExportFact["value"]) {
  if (value === "Ready" || value === "Live" || value === "Sent") return "green";
  if (value === "Blocked") return "amber";
  return "gray";
}
