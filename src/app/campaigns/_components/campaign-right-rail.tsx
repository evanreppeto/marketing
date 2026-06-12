import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

import { buildSendExportFacts } from "./campaign-detail-model";

export function CampaignRightRail({ detail, dispatches = [] }: { detail: LiveCampaignWorkspace; dispatches?: DispatchView[] }) {
  const facts = buildSendExportFacts(detail);
  const { campaign, launchState, reasoning } = detail;
  const resultText = launchState.live
    ? "This campaign is live. Results will become useful as dispatch, response, and outcome records arrive."
    : "Results appear after approved content is sent or exported and real responses are linked.";

  return (
    <aside className="space-y-3 xl:sticky xl:top-4">
      <RailPanel id="summary" title="Campaign summary">
        <dl className="space-y-3">
          <Fact label="Objective" value={campaign.objective} />
          <Fact label="Audience" value={campaign.audienceSummary} />
          <Fact label="Offer" value={campaign.offerSummary} />
          <Fact label="Owner" value={campaign.owner} />
        </dl>
      </RailPanel>

      <RailPanel id="send-export" title="Send / export">
        {facts.length > 0 ? (
          <ul className="space-y-2">
            {facts.map((fact) => (
              <li key={fact.label} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{fact.label}</span>
                <StatusPill tone={factTone(fact.value)}>{fact.value}</StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Nothing is ready to send or export yet.</p>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          The app shows readiness here. It only sends after approved dispatch records exist.
        </p>
      </RailPanel>

      <RailPanel id="mark" title="Mark">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction || reasoning.whyBuilt}</p>
        {reasoning.guardrailFlags.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-3 py-2">
            <div className="text-xs font-bold text-[var(--warn-text)]">
              {reasoning.guardrailFlags.length} item{reasoning.guardrailFlags.length === 1 ? "" : "s"} for Mark to watch
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{reasoning.guardrailFlags.join(" / ")}</p>
          </div>
        ) : null}
        <Link href="/mark" className={`${buttonClasses({ variant: "ghost", size: "sm" })} mt-3 w-full`}>
          Ask Mark
        </Link>
      </RailPanel>

      <RailPanel id="results" title="Results">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{resultText}</p>
        {dispatches.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {dispatches.slice(0, 4).map((dispatch) => (
              <li key={dispatch.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">{dispatch.deliverable}</span>
                <StatusPill tone={STATUS_TONE[dispatch.status]}>{statusLabel(dispatch.status)}</StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]">
            No dispatch records are attached yet.
          </p>
        )}
        <Link href="/outbox" className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)] hover:underline">
          Open outbox
        </Link>
      </RailPanel>
    </aside>
  );
}

function RailPanel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <h2 className="text-sm font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

function factTone(value: string) {
  if (value === "Ready" || value === "Live" || value === "Sent") return "green";
  if (value === "Blocked") return "amber";
  return "gray";
}
