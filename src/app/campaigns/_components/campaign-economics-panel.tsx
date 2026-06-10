import { Panel, StatusPill } from "../../_components/page-header";
import type { CampaignEconomicsReadModel } from "@/lib/performance/attribution-read-model";

import { TrackedLinkBuilder } from "./tracked-link-builder";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-display text-lg font-bold tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

export function CampaignEconomicsPanel({
  economics,
  campaignId,
}: {
  economics: CampaignEconomicsReadModel;
  campaignId: string;
}) {
  if (economics.status !== "live") {
    return (
      <Panel className="mt-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">Realized performance</span>
          <StatusPill tone="gray">Unavailable</StatusPill>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{economics.message}</p>
      </Panel>
    );
  }

  const roas = economics.roas === null ? "—" : `${economics.roas.toFixed(2)}×`;
  const cac = economics.cac === null ? "—" : money(economics.cac);
  const cpl = economics.cpl === null ? "—" : money(economics.cpl);

  return (
    <Panel className="mt-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[var(--text-primary)]">Realized performance</span>
        <StatusPill tone="green">CRM-proven</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="ROAS" value={roas} detail="Won revenue / spend" />
        <Metric
          label="Realized revenue"
          value={money(economics.realizedRevenueCents)}
          detail={`${economics.wonCount} won`}
        />
        <Metric label="Spend" value={money(economics.spendCents)} detail="From campaign results" />
        <Metric label="CAC" value={cac} detail="Spend / won" />
        <Metric label="CPL" value={cpl} detail="Spend / attributed leads" />
        <Metric label="Attributed leads" value={String(economics.attributedLeads)} detail="Last-touch" />
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Pipeline (open jobs): {money(economics.pipelineRevenueCents)} — not included in ROAS. Self-reported:{" "}
        {money(economics.selfReported.wonRevenueCents)} won across {economics.selfReported.leads} leads.
      </p>
      <div className="mt-4 border-t border-[var(--border-panel)] pt-4">
        <TrackedLinkBuilder campaignId={campaignId} />
      </div>
    </Panel>
  );
}
