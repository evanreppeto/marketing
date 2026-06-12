"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ReactNode } from "react";

import { Button, StatusPill } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { statusLabel, STATUS_TONE, type DispatchView } from "@/lib/dispatch/status";

import { launchCampaignAction, sendMarkMessageAction } from "../actions";
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
        {launchState.ready && !launchState.live ? <LaunchCampaignForm campaignId={campaign.id} /> : null}
        {launchState.live ? (
          <p className="mt-3 rounded-lg border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] px-3 py-2 text-xs font-semibold text-[var(--ok-text)]">
            Campaign handoff is active.
          </p>
        ) : null}
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
        <MarkMessageForm campaignId={campaign.id} />
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

function LaunchCampaignForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, isPending] = useActionState(launchCampaignAction, null);

  return (
    <form action={formAction} className="mt-3 rounded-lg border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] p-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--ok-text)]">All pieces are approved.</span>
        <Button type="submit" variant="approve" size="sm" disabled={isPending}>
          {isPending ? "Recording..." : "Launch handoff"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
        Records the campaign handoff and queues approved pieces. This does not directly send to customers.
      </p>
      {state ? <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function MarkMessageForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, isPending] = useActionState(sendMarkMessageAction, null);

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Ask Mark</span>
        <textarea
          name="message"
          rows={3}
          placeholder="Tell Mark what to revise, add, or explain."
          className="mt-2 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs leading-5 text-[var(--text-muted)]">Queues a campaign-specific message.</span>
        <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
          {isPending ? "Sending..." : "Send to Mark"}
        </Button>
      </div>
      {state ? <p className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>{state.message}</p> : null}
    </form>
  );
}

function factTone(value: string) {
  if (value === "Ready" || value === "Live" || value === "Sent") return "green";
  if (value === "Blocked") return "amber";
  return "gray";
}
