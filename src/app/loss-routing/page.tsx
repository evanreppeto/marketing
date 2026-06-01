import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { LiveTime } from "../_components/live-time";
import { ActionFeedback, Button, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { decideRoutingAction } from "./actions";
import { getLossRoutingData, type RoutingQueueLead } from "@/lib/loss-routing/read-model";

type LeadTab = "new" | "review" | "routed" | "all";
type SearchValue = string | string[] | undefined;

const TARGET_LOSS_KEYWORDS = ["Water damage", "Burst pipe", "Sewage backup", "Flooding", "Mold", "Storm surge", "Standing water", "Fire + water"];

const routingReviewLanes = [
  ["Mitigation-ready", "Water, sewage, mold, fire, or burst pipe with a usable contact path.", "15 min"],
  ["Dispatcher review", "Water context exists, but property access, source, or severity needs confirmation.", "1 hr"],
  ["Scope isolation", "Hail-only, wind-only, exterior-only roof, or unrelated remodeling stays out.", "Archive"],
];

const actionMessages: Record<string, string> = {
  "mitigation-done": "Routed to mitigation. A routing decision was recorded and the lead was updated to a target water loss.",
  "review-done": "Sent to review. The lead is flagged for a human check before routing.",
  "out_of_scope-done": "Marked out of scope. The lead was isolated from the priority lane and the decision was logged.",
  "routing-error": "The routing decision could not be saved. Check the details or server logs and try again.",
  "not-configured": "Supabase is not connected, so no routing decision was saved.",
};

export default async function LossRoutingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchValue>>;
}) {
  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
  const action = getSingle(query.action);

  const data = await getLossRoutingData();
  const isLive = data.status === "live";
  const queue = isLive ? data.queue : [];
  const metrics = isLive ? data.metrics : [];

  const visibleLeads = getVisibleLeads(queue, activeTab).slice(0, 12);
  const selectedLeadId = getSingle(query.selected) ?? visibleLeads[0]?.id ?? queue[0]?.id;
  const selectedLead = queue.find((lead) => lead.id === selectedLeadId);
  const tabCounts = countTabs(queue);

  return (
    <AppShell active="/loss-routing">
      <PageHeader
        eyebrow="Loss Routing"
        title="Route water losses to the right team"
        description="Water-related structural losses go to mitigation. Hail-only and exterior-only work stays out of the priority lane."
        aside={
          <div className="signal-panel flex items-center gap-2.5 px-3.5 py-2">
            <span className={`h-2 w-2 rounded-full status-breathe ${isLive ? "bg-[oklch(0.78_0.14_158)]" : "bg-[oklch(0.82_0.13_85)]"}`} />
            <div className="text-xs">
              <span className="font-semibold text-[var(--text-primary)]">{isLive ? "Routing live" : "Routing unavailable"}</span>
              <span className="ml-2 text-[var(--text-secondary)]">{queue.length} in queue</span>
            </div>
          </div>
        }
      />

      <ActionFeedback action={action} messages={actionMessages} />

      {!isLive ? (
        <div className="module-rise mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live routing unavailable: </span>
          {data.status === "unavailable" ? data.message : ""}
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 pb-2 xl:grid-cols-[minmax(0,1.68fr)_minmax(360px,0.72fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="flex flex-col gap-4 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Incoming leads</h2>
                  <span className="rounded-full border border-[var(--border-hairline)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chicago-blue-soft)]">
                    {queue.length}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-5 text-sm" role="tablist" aria-label="Lead queue filters">
                  {(["new", "review", "routed", "all"] as const).map((tab) => (
                    <Link
                      aria-selected={activeTab === tab}
                      className={`py-1 pl-3 pr-1 text-left transition hover:text-[var(--accent)] ${
                        activeTab === tab
                          ? "font-semibold text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                      href={lossRoutingHref({ tab, selected: getDefaultLeadIdForTab(queue, tab) })}
                      key={tab}
                      role="tab"
                    >
                      {tabLabel(tab)} {tabCounts[tab]}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <th className="w-[33%] px-5 py-4 font-semibold">Lead</th>
                    <th className="w-[25%] px-4 py-4 font-semibold">Source</th>
                    <th className="w-[18%] px-4 py-4 font-semibold">Issue</th>
                    <th className="w-[24%] px-4 py-4 font-semibold">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead) => {
                    const isSelected = selectedLead?.id === lead.id;

                    return (
                      <tr className={`group transition ${isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-inset)]"}`} key={lead.id}>
                        <td className="border-t border-[var(--border-hairline)] px-5 py-4">
                          <div className="flex items-start gap-3">
                            <Link
                              aria-label={`${isSelected ? "Deselect" : "Select"} ${lead.code}`}
                              aria-pressed={isSelected}
                              className={`mt-1.5 flex h-4 w-4 items-center justify-center rounded-full border transition ${
                                isSelected
                                  ? "border-[var(--priority)] bg-[var(--priority)]"
                                  : "border-[var(--border-strong)] bg-[var(--surface-inset)] hover:border-[var(--priority)]"
                              }`}
                              href={lossRoutingHref({ tab: activeTab, selected: isSelected ? undefined : lead.id })}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full bg-white ${isSelected ? "opacity-100" : "opacity-0"}`} />
                            </Link>
                            <div>
                              <div className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">{lead.code}</div>
                              <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                {lead.lead} · <LiveTime baseline={lead.receivedAt} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-4">
                          <div className="font-semibold">{lead.source}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">{lead.channel}</div>
                        </td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-4">
                          <div className="font-semibold">{lead.issue}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">{lead.location}</div>
                        </td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <StatusPill tone={lead.tone}>{lead.decision}</StatusPill>
                            <span className="font-mono text-lg font-semibold tabular-nums">{lead.score}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleLeads.length === 0 ? (
                    <tr>
                      <td className="border-t border-[var(--border-hairline)] px-5 py-8 text-sm text-[var(--text-secondary)]" colSpan={4}>
                        {isLive ? "No leads in this view." : "Connect Supabase to load the live routing queue."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="grid border-t border-[var(--border-hairline)] md:grid-cols-4">
              {metrics.map((metric) => (
                <div className="border-t border-[var(--border-hairline)] px-5 py-4 md:border-l md:border-t-0 first:md:border-l-0" key={metric.label}>
                  <div className="text-xs text-[var(--text-secondary)]">{metric.label}</div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-display text-3xl font-extrabold tabular-nums tracking-[-0.04em]"><CountUp value={metric.value} /></span>
                    <span className="mb-1 rounded-md bg-[oklch(0.78_0.14_158/0.14)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.88_0.1_158)]">
                      {metric.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:135ms]">
            <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing workbench</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Selected lead context, proof requirements, and the next safe operator move.</p>
              </div>
              <span className="rounded-full border border-[var(--border-hairline)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--chicago-blue-soft)]">
                {selectedLead ? selectedLead.code : "No selection"}
              </span>
            </div>
            <div className="grid md:grid-cols-3">
              <div className="border-b border-[var(--border-hairline)] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Selected lead</div>
                <div className="mt-3 font-mono text-sm font-semibold">{selectedLead?.code ?? "No lead selected"}</div>
                <div className="mt-1 text-lg font-semibold">{selectedLead?.lead ?? "Choose a record"}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {selectedLead ? `${selectedLead.source} · ${selectedLead.issue} · ${selectedLead.location}` : "Routing details will load here."}
                </p>
              </div>
              <div className="border-b border-[var(--border-hairline)] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Proof needed</div>
                <div className="mt-3 space-y-2 text-sm">
                  {["Interior water confirmed", "Property access known", "Photo or call note attached"].map((item) => (
                    <div className="flex items-center justify-between gap-3" key={item}>
                      <span>{item}</span>
                      <span className="rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chicago-blue-soft)]">Check</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Next operator move</div>
                <div className="mt-3 text-lg font-semibold">
                  {selectedLead?.tone === "red" ? "Hold for scope review" : "Call and dispatch mitigation"}
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {selectedLead?.tone === "red"
                    ? "Confirm whether there is interior water before any campaign or dispatch action."
                    : "Keep copy coverage-neutral and route only the water-loss context to the mitigation team."}
                </p>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:165ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Next queue after this lead</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Keeps the dispatcher oriented without needing to scroll back to the top.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <th className="px-5 py-3">Lead</th>
                    <th className="px-4 py-3">Signal</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {queue
                    .filter((lead) => lead.id !== selectedLead?.id)
                    .slice(0, 4)
                    .map((lead) => (
                      <tr key={lead.id}>
                        <td className="border-t border-[var(--border-hairline)] px-5 py-3">
                          <div className="font-mono text-xs font-semibold">{lead.code}</div>
                          <div className="mt-1 font-semibold">{lead.lead}</div>
                        </td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-3">
                          <div className="font-semibold">{lead.issue}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">{lead.location}</div>
                        </td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-3">{lead.source}</td>
                        <td className="border-t border-[var(--border-hairline)] px-4 py-3">
                          {lead.tone === "red" ? "Confirm interior water" : "Prepare mitigation handoff"}
                        </td>
                      </tr>
                    ))}
                  {queue.length === 0 ? (
                    <tr>
                      <td className="border-t border-[var(--border-hairline)] px-5 py-6 text-sm text-[var(--text-secondary)]" colSpan={4}>
                        No additional leads in the queue.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing guidance</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              We route for water losses, not hail or wind. Keep the rule simple enough for a dispatcher to trust it at speed.
            </p>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">Target: water damage signals</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {TARGET_LOSS_KEYWORDS.map((keyword) => (
                  <div className="rounded-md border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--chicago-blue-soft)]" key={keyword}>
                    {keyword}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-[var(--border-hairline)] pt-5">
              <h3 className="text-sm font-semibold">Out of scope: hail and wind damage</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {["Hail impact", "Roof damage", "Wind damage", "Siding / exterior"].map((item) => (
                  <div className="rounded-md border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-3 py-2 text-xs font-semibold text-[oklch(0.86_0.09_26)]" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Decision path</h2>
            <div className="mt-5 space-y-4">
              {buildDecisionPath(selectedLead).map((step) => (
                <div className="grid grid-cols-[28px_1fr] gap-3" key={step.label}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--accent-soft)] text-[var(--accent)]">
                    <CheckIcon />
                  </span>
                  <div>
                    <div className="font-semibold">{step.label}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{step.detail}</div>
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
                <div className="text-sm font-semibold">Route decision</div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  {selectedLead?.tone === "red" ? "Keep in review until interior water damage is confirmed." : "Send to mitigation team with a 15 minute SLA."}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:245ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Review lanes</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Where the selected record goes after the routing check.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {routingReviewLanes.map(([lane, detail, sla]) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4" key={lane}>
                  <div>
                    <div className="font-semibold">{lane}</div>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
                  </div>
                  <div className="font-mono text-sm font-semibold">{sla}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="signal-panel module-rise sticky bottom-0 mt-4 p-3 backdrop-blur [animation-delay:260ms]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm">
            {selectedLead ? (
              <>
                <span className="font-semibold">{selectedLead.code} selected</span>
                <span className="ml-3 text-[var(--text-secondary)]">{selectedLead.lead} · {selectedLead.decision}</span>
              </>
            ) : (
              <span className="text-[var(--text-secondary)]">Select a lead to record a routing decision.</span>
            )}
          </div>
          {selectedLead ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <RoutingDecisionButton lead={selectedLead} decision="mitigation" variant="priority" label="Route to mitigation" />
              <RoutingDecisionButton lead={selectedLead} decision="out_of_scope" variant="ghost" label="Mark out of scope" />
              <RoutingDecisionButton lead={selectedLead} decision="review" variant="ghost" label="Send to review" />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function RoutingDecisionButton({
  lead,
  decision,
  variant,
  label,
}: {
  lead: RoutingQueueLead;
  decision: "mitigation" | "out_of_scope" | "review";
  variant: "priority" | "ghost";
  label: string;
}) {
  return (
    <form action={decideRoutingAction}>
      <input type="hidden" name="leadId" value={lead.id} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="score" value={lead.score} />
      <Button variant={variant} type="submit" className="w-full">
        {label}
      </Button>
    </form>
  );
}

function getVisibleLeads(queue: RoutingQueueLead[], activeTab: LeadTab) {
  if (activeTab === "all") return queue;
  if (activeTab === "review") return queue.filter((lead) => lead.tone === "red" || lead.status === "needs_review");
  if (activeTab === "routed") return queue.filter((lead) => lead.routed);
  return queue.filter((lead) => lead.status === "new");
}

function getDefaultLeadIdForTab(queue: RoutingQueueLead[], activeTab: LeadTab) {
  return getVisibleLeads(queue, activeTab)[0]?.id;
}

function countTabs(queue: RoutingQueueLead[]): Record<LeadTab, number> {
  return {
    new: getVisibleLeads(queue, "new").length,
    review: getVisibleLeads(queue, "review").length,
    routed: getVisibleLeads(queue, "routed").length,
    all: queue.length,
  };
}

function tabLabel(tab: LeadTab) {
  if (tab === "new") return "New";
  if (tab === "review") return "In review";
  if (tab === "routed") return "Routed";
  return "All";
}

function getSingle(value: SearchValue) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeTab(value: SearchValue): LeadTab {
  const tab = getSingle(value);
  if (tab === "review" || tab === "routed" || tab === "all") return tab;
  return "new";
}

function lossRoutingHref({ tab, selected }: { tab: LeadTab; selected?: string }) {
  const params = new URLSearchParams();
  if (tab !== "new") params.set("tab", tab);
  if (selected) params.set("selected", selected);
  const query = params.toString();
  return query ? `/loss-routing?${query}` : "/loss-routing";
}

function buildDecisionPath(lead: RoutingQueueLead | undefined) {
  if (!lead) {
    return [
      { label: "Signal detected", detail: "Awaiting selection." },
      { label: "Scope checked", detail: "Awaiting selection." },
      { label: "Intent confirmed", detail: "Awaiting selection." },
    ];
  }

  if (lead.tone === "red") {
    return [
      { label: "Signal detected", detail: `Loss "${lead.issue}" did not match a target water-loss signal.` },
      { label: "Scope checked", detail: `Location "${lead.location}" — flagged out of scope for the water-loss queue.` },
      { label: "Intent confirmed", detail: `Source "${lead.source}" — recommend review or partner redirect.` },
    ];
  }

  return [
    { label: "Signal detected", detail: `Loss "${lead.issue}" matches target water-loss signals.` },
    { label: "Scope checked", detail: `Location "${lead.location}" — no out-of-scope keywords found.` },
    { label: "Intent confirmed", detail: `Source "${lead.source}" via ${lead.channel.toLowerCase()}.` },
  ];
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8.2 2.8 2.7 6.2-6.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
