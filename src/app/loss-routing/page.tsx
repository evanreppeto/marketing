import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { routingMetrics, routingQueue, targetLossKeywords } from "../_data/growth-engine";

type LeadTab = "new" | "review" | "routed" | "all";
type SearchValue = string | string[] | undefined;

const leadTabs: Array<{ key: LeadTab; label: string; count: string }> = [
  { key: "new", label: "New", count: "24" },
  { key: "review", label: "In review", count: "8" },
  { key: "routed", label: "Routed today", count: "19" },
  { key: "all", label: "All", count: "" },
];

const filterChips = [
  { label: "Water losses", tab: "routed" as const },
  { label: "Needs review", tab: "review" as const },
  { label: "All leads", tab: "all" as const },
];

const actionLabels: Record<string, string> = {
  "route-selected": "Route selected",
  "route-mitigation": "Route to mitigation",
  "out-of-scope": "Out of scope",
  review: "Send to review",
  "needs-selection": "Select a lead first",
};

export default async function LossRoutingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchValue>>;
}) {
  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
  const filtersOpen = getSingle(query.filters) === "open";
  const selectedLeadId = getSingle(query.selected) ?? routingQueue[0]?.id;
  const action = getSingle(query.action);
  const selectedLead = routingQueue.find((lead) => lead.id === selectedLeadId);
  const selectedCount = selectedLead ? 1 : 0;

  const visibleLeads = getVisibleLeads(activeTab);
  const actionMessage = getActionMessage(action, selectedLead);

  return (
    <AppShell active="/loss-routing">
      <PageHeader
        eyebrow="Loss Routing"
        title="Route water losses with confidence"
        description="Surface signal, intent, and context. The system routes water-related structural losses to the right team while keeping hail-only and exterior-only work out of the priority lane."
        aside={
          <div className="rounded-md border border-[#ddd6cd] bg-white px-5 py-4 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)]">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#23a455] status-breathe" />
              <div>
                <div className="text-sm font-semibold">Routing system: Healthy</div>
                <div className="mt-1 text-sm text-[#6e6962]">Last updated 2 min ago</div>
              </div>
            </div>
          </div>
        }
      />

      <div className="grid min-w-0 items-start gap-4 pb-24 xl:grid-cols-[minmax(0,1.68fr)_minmax(360px,0.72fr)] xl:pb-28">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="flex flex-col gap-4 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Incoming leads</h2>
                <StatusPill tone="red">24</StatusPill>
              </div>
              <div className="mt-4 flex flex-wrap gap-5 text-sm" role="tablist" aria-label="Lead queue filters">
                {leadTabs.map((tab) => (
                  <Link
                    aria-selected={activeTab === tab.key}
                    className={`border-b-2 pb-2 text-left transition hover:text-[#151515] ${
                      activeTab === tab.key
                        ? "border-[#e7352f] font-semibold text-[#151515]"
                        : "border-transparent text-[#6e6962]"
                    }`}
                    href={lossRoutingHref({ tab: tab.key, selected: getDefaultLeadIdForTab(tab.key), filters: filtersOpen })}
                    key={tab.key}
                    role="tab"
                  >
                    {tab.label} {tab.count}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                aria-expanded={filtersOpen}
                className="inline-flex min-h-11 items-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                href={lossRoutingHref({
                  tab: activeTab,
                  selected: selectedLeadId,
                  filters: !filtersOpen,
                })}
              >
                {filtersOpen ? "Hide filters" : "Filters"}
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href={lossRoutingHref({
                  tab: activeTab,
                  selected: selectedLeadId,
                  filters: filtersOpen,
                  action: selectedLead ? "route-selected" : "needs-selection",
                })}
              >
                Route selected
              </Link>
            </div>
          </div>

          {filtersOpen ? (
            <div className="border-b border-[#e7e0d8] bg-[#fbfaf8] px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold">Scaffold filters</div>
                  <div className="mt-1 text-sm text-[#6e6962]">
                    These controls only change the preview list. Live routing rules stay untouched.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filterChips.map((chip) => (
                    <Link
                      className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                        activeTab === chip.tab
                          ? "border-[#151515] bg-[#151515] text-white"
                          : "border-[#ddd6cd] bg-white text-[#3b3834] hover:border-[#151515]"
                      }`}
                      href={lossRoutingHref({
                        tab: chip.tab,
                        selected: getDefaultLeadIdForTab(chip.tab),
                        filters: true,
                        action: `filter-${chip.tab}`,
                      })}
                      key={chip.label}
                    >
                      {chip.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
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
                    <tr className={`group transition ${isSelected ? "bg-[#fff8f4]" : "hover:bg-[#fbfaf8]"}`} key={lead.id}>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
                        <div className="flex items-start gap-3">
                          <Link
                            aria-label={`${isSelected ? "Deselect" : "Select"} ${lead.id}`}
                            aria-pressed={isSelected}
                            className={`mt-1.5 flex h-4 w-4 items-center justify-center rounded-full border transition ${
                              isSelected
                                ? "border-[#e7352f] bg-[#e7352f]"
                                : "border-[#d3cbc1] bg-white hover:border-[#e7352f]"
                            }`}
                            href={lossRoutingHref({
                              tab: activeTab,
                              selected: isSelected ? undefined : lead.id,
                              filters: filtersOpen,
                              action: isSelected ? "selection-cleared" : "selection-updated",
                            })}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full bg-white ${isSelected ? "opacity-100" : "opacity-0"}`} />
                          </Link>
                          <div>
                            <div className="font-mono text-[13px] font-semibold text-[#151515]">{lead.id}</div>
                            <div className="mt-1 text-xs text-[#6e6962]">
                              {lead.lead} - {lead.age}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="font-semibold">{lead.source}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{lead.channel}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="font-semibold">{lead.issue}</div>
                        <div className="mt-1 text-xs text-[#6e6962]">{lead.location}</div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <StatusPill tone={lead.tone}>{lead.decision}</StatusPill>
                          <span className="font-mono text-lg font-semibold">{lead.score}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid border-t border-[#e7e0d8] md:grid-cols-4">
            {routingMetrics.map((metric) => (
              <div className="border-t border-[#eee8e1] px-5 py-4 md:border-l md:border-t-0 first:md:border-l-0" key={metric.label}>
                <div className="text-xs text-[#6e6962]">{metric.label}</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-[-0.04em]">{metric.value}</span>
                  <span className="mb-1 rounded-md bg-[#e4f5eb] px-2 py-0.5 text-xs font-semibold text-[#117343]">
                    {metric.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing guidance</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e6962]">
              We route for water losses, not hail or wind. Keep the rule simple enough for a dispatcher to trust it at speed.
            </p>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">Target: water damage signals</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {targetLossKeywords.map((keyword) => (
                  <div className="rounded-md border border-[#cfe0f5] bg-[#f2f7ff] px-3 py-2 text-xs font-semibold text-[#285f98]" key={keyword}>
                    {keyword}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-[#eee8e1] pt-5">
              <h3 className="text-sm font-semibold">Out of scope: hail and wind damage</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {["Hail impact", "Roof damage", "Wind damage", "Siding / exterior"].map((item) => (
                  <div className="rounded-md border border-[#f1cdc8] bg-[#fff5f3] px-3 py-2 text-xs font-semibold text-[#bd2b23]" key={item}>
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
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#efeeeb] text-[#151515]">
                    <CheckIcon />
                  </span>
                  <div>
                    <div className="font-semibold">{step.label}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">{step.detail}</div>
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
                <div className="text-sm font-semibold">Route decision</div>
                <div className="mt-2 text-sm text-[#6e6962]">
                  {selectedLead?.tone === "red" ? "Keep in review until interior water damage is confirmed." : "Send to mitigation team with a 15 minute SLA."}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:220ms]">
            <div className="border-b border-[#eee8e1] p-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Routing outcome</h2>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#edf4ff] text-[#285f98]">
                  <DropIcon />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[#117343]">Route to mitigation</div>
                  <div className="mt-1 text-sm text-[#6e6962]">
                    {selectedLead ? `${selectedLead.id}: ${selectedLead.lead}` : "Select a lead to preview outcome"}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#eee8e1]">
              {[
                ["Confidence", selectedLead ? `${selectedLead.score}/100` : "--"],
                ["Est. value", "$4,200"],
                ["SLA", selectedLead?.tone === "red" ? "Review" : "15 min"],
              ].map(([label, value]) => (
                <div className="p-4" key={label}>
                  <div className="text-xs text-[#6e6962]">{label}</div>
                  <div className="mt-1 font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="module-rise sticky bottom-0 mt-4 rounded-md border border-[#ddd6cd] bg-white/95 p-3 shadow-[0_-18px_50px_-42px_rgba(52,43,34,0.7)] backdrop-blur [animation-delay:260ms]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm">
            <span className="font-semibold">{selectedCount} selected</span>
            <span className="ml-3 text-[#6e6962]">{actionMessage}</span>
            <Link
              className="ml-4 font-semibold text-[#e7352f]"
              href={lossRoutingHref({ tab: activeTab, filters: filtersOpen, action: "selection-cleared" })}
            >
              Clear
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#e7352f] px-5 text-sm font-semibold text-white transition hover:bg-[#c82923] active:-translate-y-px"
              href={lossRoutingHref({
                tab: activeTab,
                selected: selectedLeadId,
                filters: filtersOpen,
                action: selectedLead ? "route-mitigation" : "needs-selection",
              })}
            >
              Route to mitigation
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#151515] bg-white px-5 text-sm font-semibold text-[#151515] transition hover:bg-[#f2efeb] active:-translate-y-px"
              href={lossRoutingHref({
                tab: activeTab,
                selected: selectedLeadId,
                filters: filtersOpen,
                action: selectedLead ? "out-of-scope" : "needs-selection",
              })}
            >
              Mark out of scope
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-5 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
              href={lossRoutingHref({
                tab: activeTab,
                selected: selectedLeadId,
                filters: filtersOpen,
                action: selectedLead ? "review" : "needs-selection",
              })}
            >
              Send to review
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getVisibleLeads(activeTab: LeadTab) {
  if (activeTab === "all") return routingQueue;
  if (activeTab === "review") return routingQueue.filter((lead) => lead.tone === "red");
  if (activeTab === "routed") return routingQueue.filter((lead) => lead.tone === "green");
  return routingQueue.slice(0, 3);
}

function getDefaultLeadIdForTab(activeTab: LeadTab) {
  return getVisibleLeads(activeTab)[0]?.id;
}

function getActionMessage(action: string | undefined, selectedLead: (typeof routingQueue)[number] | undefined) {
  if (action?.startsWith("filter-")) return "Filter applied for scaffold preview.";
  if (action === "selection-cleared") return "Selection cleared.";
  if (action === "selection-updated") return selectedLead ? `${selectedLead.id} selected for scaffold preview.` : "Selection updated.";
  if (action === "needs-selection") return "Select a lead before previewing an action.";
  if (action && selectedLead) return `Scaffold only: ${selectedLead.id} would be marked as "${actionLabels[action] ?? action}".`;
  return selectedLead ? `${selectedLead.id} selected for scaffold preview.` : "Select a lead to preview routing actions.";
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

function lossRoutingHref({
  tab,
  selected,
  filters,
  action,
}: {
  tab: LeadTab;
  selected?: string;
  filters?: boolean;
  action?: string;
}) {
  const params = new URLSearchParams();
  if (tab !== "new") params.set("tab", tab);
  if (selected) params.set("selected", selected);
  if (filters) params.set("filters", "open");
  if (action) params.set("action", action);
  const query = params.toString();
  return query ? `/loss-routing?${query}` : "/loss-routing";
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.2 2.8 2.7 6.2-6.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function buildDecisionPath(lead: (typeof routingQueue)[number] | undefined) {
  if (!lead) {
    return [
      { label: "Signal detected", detail: "Awaiting selection." },
      { label: "Scope checked", detail: "Awaiting selection." },
      { label: "Intent confirmed", detail: "Awaiting selection." },
    ];
  }

  if (lead.tone === "red") {
    return [
      { label: "Signal detected", detail: `Loss type "${lead.issue}" matched a non-target keyword.` },
      { label: "Scope checked", detail: `Location "${lead.location}" — out of scope for water-loss queue.` },
      { label: "Intent confirmed", detail: `Source "${lead.source}" — recommend archive or partner redirect.` },
    ];
  }

  return [
    { label: "Signal detected", detail: `Loss type "${lead.issue}" matches target water-loss signals.` },
    { label: "Scope checked", detail: `Location "${lead.location}" — no out-of-scope keywords found.` },
    { label: "Intent confirmed", detail: `Source "${lead.source}" via ${lead.channel.toLowerCase()}, ${lead.age} old.` },
  ];
}

function DropIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5c3.7 4.1 5.5 7.3 5.5 10.1A5.4 5.4 0 0 1 12 19a5.4 5.4 0 0 1-5.5-5.4c0-2.8 1.8-6 5.5-10.1Z"
        fill="currentColor"
      />
    </svg>
  );
}
