import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { LiveTime } from "../_components/live-time";
import { ActionFeedback, OperatorBar, PageHeader, Panel, StatusPill, buttonClasses } from "../_components/page-header";
import { getLeadIngestionData, type IntakeLead } from "@/lib/lead-ingestion/read-model";

type ViewKey = "all" | "ready" | "blocked";

const validationChecks = [
  "Customer type confirmed",
  "Loss scope classified (water vs out-of-scope)",
  "Contact path captured",
  "Source and consent recorded",
];

export default async function LeadIngestionPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; journey?: string | string[]; lead?: string | string[]; view?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const view = normalizeView(query.view);
  const journey = getValue(query.journey) ?? "all";
  const leadId = getValue(query.lead);

  const data = await getLeadIngestionData();
  const isLive = data.status === "live";
  const allLeads = isLive ? data.leads : [];
  const funnel = isLive ? data.funnel : [];
  const sources = isLive ? data.sources : [];
  const stats = isLive ? data.stats : [];

  const viewLeads = filterByView(allLeads, view);
  const selectedLeads = journey === "all" ? viewLeads : viewLeads.filter((lead) => lead.status === journey);
  const selectedLead = selectedLeads.find((lead) => lead.id === leadId) ?? selectedLeads[0] ?? viewLeads[0] ?? allLeads[0];

  return (
    <AppShell active="/lead-ingestion">
      <PageHeader
        eyebrow="Lead Intake"
        title="Track each lead through the customer journey"
        description="Intake reads live Supabase leads — source, loss summary, persona, score, and routing recommendation — before routing, CRM, or campaign intelligence use the record."
        aside={<StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live intake" : "Supabase unavailable"}</StatusPill>}
      />

      <ActionFeedback
        action={action}
        messages={{
          "send-journey-signal": "Journey signals require the live intake-to-persona workflow.",
        }}
      />

      {!isLive ? (
        <div className="module-rise mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live intake unavailable: </span>
          {data.status === "unavailable" ? data.message : ""}
        </div>
      ) : null}

      <OperatorBar
        task="Find where this lead is in intake and what moves it forward safely."
        detail="Intake reads the live lead record — source, loss summary, persona, score, and routing recommendation. Validation still owns the hard gate before routing or AI use."
        status={`${selectedLeads.length} visible leads`}
        primary={
          <Link className={buttonClasses({ variant: "ghost" })} href="/loss-routing">
            Open loss routing
          </Link>
        }
        secondary={
          <Link className={buttonClasses({ variant: "ghost" })} href="/persona-intelligence">
            Open persona view
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Panel className="module-rise [animation-delay:70ms]" key={stat.label}>
            <div className="text-sm text-[var(--text-secondary)]">{stat.label}</div>
            <div className="mt-2 font-display text-3xl font-extrabold tabular-nums tracking-[-0.04em]"><CountUp value={stat.value} /></div>
            <div
              className={`mt-3 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                stat.tone === "green"
                  ? "bg-[oklch(0.78_0.14_158/0.14)] text-[oklch(0.88_0.1_158)]"
                  : stat.tone === "red"
                    ? "bg-[oklch(0.68_0.2_26/0.16)] text-[oklch(0.86_0.09_26)]"
                    : "bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]"
              }`}
            >
              {stat.delta}
            </div>
          </Panel>
        ))}
        {stats.length === 0 ? <Panel className="module-rise md:col-span-4">No live intake stats available.</Panel> : null}
      </div>

      <Panel className="module-rise mt-4 overflow-hidden p-0 [animation-delay:90ms]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Intake funnel</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Live lead status from new arrival through conversion. Select a stage to filter the queue.
              </p>
            </div>
            <Link
              className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                journey === "all"
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
              }`}
              href={`/lead-ingestion?view=${view}`}
            >
              All stages
            </Link>
          </div>
        </div>
        <div className="grid gap-0 lg:grid-cols-5">
          {funnel.map((stage) => {
            const active = journey === stage.key;
            return (
              <Link
                className={`border-b border-[var(--border-hairline)] p-5 transition hover:bg-[var(--surface-inset)] lg:border-r lg:last:border-r-0 active:-translate-y-px ${
                  active ? "bg-[var(--accent-soft)]" : ""
                }`}
                href={`/lead-ingestion?view=${view}&journey=${stage.key}`}
                key={stage.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{stage.label}</div>
                  <StatusPill tone={active ? "blue" : "gray"}>{stage.count}</StatusPill>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{stage.description}</p>
              </Link>
            );
          })}
          {funnel.length === 0 ? <div className="p-5 text-sm text-[var(--text-secondary)]">No funnel data available.</div> : null}
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise overflow-hidden p-0 [animation-delay:120ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Lead queue</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Live leads with source, persona, loss summary, score, and routing recommendation.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "ready", "blocked"] as const).map((key) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    view === key
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                  href={`/lead-ingestion?view=${key}`}
                  key={key}
                >
                  {viewLabel(key)}
                </Link>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            {selectedLeads.map((lead) => (
              <Link
                className={`grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-inset)] active:-translate-y-px lg:grid-cols-[minmax(180px,0.85fr)_minmax(180px,0.9fr)_minmax(220px,1fr)_120px] ${
                  selectedLead?.id === lead.id ? "bg-[var(--accent-soft)]" : ""
                }`}
                href={`/lead-ingestion?view=${view}&journey=${journey}&lead=${lead.id}`}
                key={lead.id}
              >
                <div>
                  <div className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">{lead.code}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]"><LiveTime baseline={lead.receivedAt} /> · {lead.source}</div>
                  <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{lead.persona}</div>
                </div>
                <div>
                  <div className="font-semibold">{lead.contact}</div>
                  <div className="mt-2">
                    <StatusPill tone={lead.tone}>{lead.statusLabel}</StatusPill>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Loss summary</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{lead.need}</p>
                </div>
                <div className="lg:text-right">
                  <div className="font-mono text-2xl font-semibold tabular-nums tracking-[-0.05em]">{lead.score}</div>
                  <div className="mt-2">
                    <StatusPill tone={lead.isTarget ? "green" : "red"}>{lead.action}</StatusPill>
                  </div>
                </div>
              </Link>
            ))}
            {selectedLeads.length === 0 ? (
              <div className="px-5 py-8 text-sm text-[var(--text-secondary)]">
                {isLive ? "No leads in this view." : "Connect Supabase to load live intake leads."}
              </div>
            ) : null}
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:135ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Selected lead</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedLead ? `${selectedLead.contact} · ${selectedLead.persona}` : "No lead selected"}</p>
                </div>
                {selectedLead ? <StatusPill tone={selectedLead.tone}>{selectedLead.statusLabel}</StatusPill> : null}
              </div>
            </div>
            {selectedLead ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {[
                  ["Code", selectedLead.code],
                  ["Source", selectedLead.source],
                  ["Loss summary", selectedLead.need],
                  ["Routing", selectedLead.action],
                  ["Score", `${selectedLead.score}/100`],
                ].map(([label, value]) => (
                  <div className="px-5 py-4" key={label}>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
                    <div className="mt-1 text-sm font-semibold leading-6">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">Select a lead to see its intake detail.</div>
            )}
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Validation gate</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Required checks before a lead can feed routing or AI use.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {validationChecks.map((check) => (
                <div className="flex items-center justify-between gap-3 px-5 py-4" key={check}>
                  <div className="font-semibold">{check}</div>
                  <StatusPill tone={selectedLead?.status === "validated" || selectedLead?.status === "qualified" ? "green" : "amber"}>
                    {selectedLead?.status === "validated" || selectedLead?.status === "qualified" ? "Pass" : "Review"}
                  </StatusPill>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <Panel className="module-rise mt-4 p-0 [animation-delay:220ms]">
        <div className="border-b border-[var(--border-hairline)] px-5 py-4">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Source mix</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Live touchpoints by share of recent leads.</p>
        </div>
        <div className="grid gap-0 sm:grid-cols-4">
          {sources.map((channel) => (
            <div className="border-b border-[var(--border-hairline)] p-4 sm:border-r sm:last:border-r-0" key={channel.label}>
              <div className="text-sm text-[var(--text-secondary)]">{channel.label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-[-0.05em]">{channel.value}</div>
              <div className="mt-2 text-xs font-semibold text-[var(--accent)]">{channel.share}</div>
            </div>
          ))}
          {sources.length === 0 ? <div className="p-4 text-sm text-[var(--text-secondary)]">No source data available.</div> : null}
        </div>
      </Panel>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeView(value: string | string[] | undefined): ViewKey {
  const view = getValue(value);
  if (view === "ready" || view === "blocked") return view;
  return "all";
}

function viewLabel(view: ViewKey) {
  if (view === "ready") return "Ready";
  if (view === "blocked") return "Blocked";
  return "All";
}

function filterByView(leads: IntakeLead[], view: ViewKey) {
  if (view === "ready") return leads.filter((lead) => lead.isTarget || ["validated", "qualified", "converted"].includes(lead.status));
  if (view === "blocked") return leads.filter((lead) => ["archived", "lost"].includes(lead.status) || ["isolated", "archived"].includes(lead.recommendation));
  return leads;
}
