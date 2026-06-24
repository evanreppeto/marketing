import type { ReactNode } from "react";

import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import { STATUS_TONE } from "@/lib/dispatch/status";

import type { CampaignResults as CampaignResultsModel, DeliveryTier, EngagementTier, MetricStat, OutcomesTier } from "./campaign-results-model";

export function CampaignResults({ results }: { results: CampaignResultsModel }) {
  return (
    <section
      id="results"
      className="scroll-mt-5 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]"
    >
      <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Results</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
          What happened after this campaign went out — delivery, engagement, and booked outcomes.
        </p>
      </header>

      {results.isEmpty ? (
        <p className="px-4 py-6 text-sm leading-6 text-[var(--text-muted)]">
          Results appear after the campaign goes out. Deploy a piece to start tracking delivery, engagement, and outcomes.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          <DeliveryTierView delivery={results.delivery} />
          <EngagementTierView engagement={results.engagement} />
          <OutcomesTierView outcomes={results.outcomes} />
        </div>
      )}
    </section>
  );
}

function TierShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-4">
      <h3 className="text-xs font-medium text-[var(--text-muted)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DeliveryTierView({ delivery }: { delivery: DeliveryTier }) {
  return (
    <TierShell title="Delivery">
      {delivery.hasAnyDispatch ? (
        <>
          <div className="flex flex-wrap gap-2">
            {delivery.buckets.map((b) => (
              <span key={b.status} className="inline-flex items-center gap-1.5">
                <StatusPill tone={STATUS_TONE[b.status]}>{b.label}</StatusPill>
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{b.count}</span>
              </span>
            ))}
          </div>
          {delivery.failures.length > 0 ? (
            <div className="mt-3 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--warn-text)]">
                  {delivery.failures.length} delivery failure{delivery.failures.length === 1 ? "" : "s"}
                </span>
                <Link href="/outbox" className="text-xs font-semibold text-[var(--accent)] hover:underline">
                  Manage in Outbox
                </Link>
              </div>
              <ul className="mt-2 space-y-1">
                {delivery.failures.map((f) => (
                  <li key={f.id} className="text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{f.deliverable}</span> &middot; {f.channel}
                    {f.note ? <span className="text-[var(--text-muted)]"> — {f.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Nothing has been sent yet.</p>
      )}
    </TierShell>
  );
}

function EngagementTierView({ engagement }: { engagement: EngagementTier }) {
  return (
    <TierShell title="Engagement">
      {engagement.state === "untracked" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Engagement isn&apos;t tracked for this campaign yet.</p>
      ) : engagement.state === "empty" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">No engagement recorded yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="font-mono text-sm font-bold text-[var(--text-primary)]">{engagement.totalEvents} total events</div>
          <MetricRow label="By type" stats={engagement.byType} />
          <MetricRow label="By channel" stats={engagement.byChannel} />
        </div>
      )}
    </TierShell>
  );
}

function OutcomesTierView({ outcomes }: { outcomes: OutcomesTier }) {
  return (
    <TierShell title="Business outcomes">
      {outcomes.state === "unavailable" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">Outcomes appear once the campaign produces booked work.</p>
      ) : outcomes.state === "empty" ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">No booked outcomes attributed yet.</p>
      ) : (
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {outcomes.stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
              <dt className="text-[10px] font-medium text-[var(--text-muted)]">{s.label}</dt>
              <dd className="mt-1 font-mono text-lg font-bold leading-none tabular-nums text-[var(--text-primary)]">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </TierShell>
  );
}

function MetricRow({ label, stats }: { label: string; stats: MetricStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-medium text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {stats.map((s) => (
          <span key={s.label} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {s.label}: <span className="font-mono font-bold text-[var(--text-primary)]">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
