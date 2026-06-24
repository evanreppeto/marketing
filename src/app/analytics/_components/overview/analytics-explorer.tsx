"use client";

import { useMemo, useState } from "react";

import { ChannelLogo } from "@/app/_components/brand-logos";
import { theme } from "@/app/_components/theme";
import { WorkspacePanel } from "@/app/_components/workspace";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/app/_components/page-header";
import type { ChannelPerformance, CampaignPerformanceRow } from "@/lib/performance/read-model";
import { FunnelFlow, type FunnelStage } from "../charts/funnel-flow";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");

const ALL = "__all__";

type ExplorerProps = {
  funnelStages: FunnelStage[];
  channels: ChannelPerformance[];
  campaignRows: CampaignPerformanceRow[];
};

/**
 * Client-side analytics explorer: a premium segmented filter bar (Channel /
 * Persona / Campaign) that re-derives the funnel, channel bars, and campaign
 * table from the demo read-model. Filtering happens in the browser so the
 * charts respond instantly without a round-trip. Read-only display.
 */
export function AnalyticsExplorer({ funnelStages, channels, campaignRows }: ExplorerProps) {
  const [channel, setChannel] = useState<string>(ALL);
  const [persona, setPersona] = useState<string>(ALL);
  const [campaign, setCampaign] = useState<string>(ALL);

  const channelOptions = useMemo(() => channels.map((c) => c.channel), [channels]);
  const personaOptions = useMemo(
    () => Array.from(new Set(campaignRows.map((r) => r.persona))).sort(),
    [campaignRows],
  );
  const campaignOptions = useMemo(
    () => campaignRows.map((r) => ({ id: r.id, name: r.name })),
    [campaignRows],
  );

  // Filter campaign rows by persona + campaign selection.
  const filteredRows = useMemo(
    () =>
      campaignRows.filter(
        (r) => (persona === ALL || r.persona === persona) && (campaign === ALL || r.id === campaign),
      ),
    [campaignRows, persona, campaign],
  );

  // Channel bars honor the channel selection (and dim others rather than hiding,
  // so the mix stays legible). When a channel is picked we isolate it.
  const visibleChannels = useMemo(
    () => (channel === ALL ? channels : channels.filter((c) => c.channel === channel)),
    [channels, channel],
  );

  // Funnel scales to the filtered campaign set so the headline counts move with
  // the persona/campaign filter. Channel filter narrows leads → booked share.
  const filteredFunnel = useMemo(() => {
    const personaActive = persona !== ALL || campaign !== ALL;
    const channelActive = channel !== ALL;
    if (!personaActive && !channelActive) return funnelStages;

    const rows = filteredRows;
    // When a persona/campaign filter is active, the funnel sums the matching
    // rows; otherwise it keeps the portfolio totals. A channel filter then
    // scales every stage by that channel's share of all leads.
    const channelShare = (() => {
      if (!channelActive) return 1;
      const total = channels.reduce((s, c) => s + c.leads, 0) || 1;
      const chan = channels.find((c) => c.channel === channel);
      return chan ? chan.leads / total : 0;
    })();

    const baseImpr = personaActive ? rows.reduce((s, r) => s + r.impressions, 0) : funnelStages[0]?.count ?? 0;
    const baseClicks = personaActive ? rows.reduce((s, r) => s + r.clicks, 0) : funnelStages[1]?.count ?? 0;
    const baseLeads = personaActive ? rows.reduce((s, r) => s + r.leads, 0) : funnelStages[2]?.count ?? 0;
    const baseBooked = personaActive ? rows.reduce((s, r) => s + r.booked, 0) : funnelStages[3]?.count ?? 0;

    return [
      { label: "Impressions", count: Math.round(baseImpr * channelShare) },
      { label: "Clicks", count: Math.round(baseClicks * channelShare) },
      { label: "Leads", count: Math.round(baseLeads * channelShare) },
      { label: "Booked", count: Math.round(baseBooked * channelShare) },
    ];
  }, [funnelStages, filteredRows, channels, channel, persona, campaign]);

  const isFiltered = channel !== ALL || persona !== ALL || campaign !== ALL;

  return (
    <div className="grid gap-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--border-hairline)] pb-3">
        <FilterGroup
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={[{ value: ALL, label: "All" }, ...channelOptions.map((c) => ({ value: c, label: c, channel: c }))]}
          withLogos
        />
        <Divider />
        <FilterGroup
          label="Persona"
          value={persona}
          onChange={(v) => {
            setPersona(v);
            // Picking a persona that excludes the chosen campaign clears the campaign.
            if (v !== ALL && campaign !== ALL) {
              const row = campaignRows.find((r) => r.id === campaign);
              if (row && row.persona !== v) setCampaign(ALL);
            }
          }}
          options={[{ value: ALL, label: "All" }, ...personaOptions.map((p) => ({ value: p, label: p }))]}
        />
        <Divider />
        <FilterGroup
          label="Campaign"
          value={campaign}
          onChange={setCampaign}
          options={[{ value: ALL, label: "All" }, ...campaignOptions.map((c) => ({ value: c.id, label: c.name }))]}
          dropdown
        />
        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setChannel(ALL);
              setPersona(ALL);
              setCampaign(ALL);
            }}
            className="ml-auto rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition-[transform,border-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] active:scale-[0.96]"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <WorkspacePanel eyebrow="Funnel" title="Impressions to booked work" description="How reach narrows into booked jobs.">
          <FunnelFlow stages={filteredFunnel} />
        </WorkspacePanel>
        <WorkspacePanel eyebrow="Channels" title="Channel performance" description="Leads, booked work, and revenue by channel.">
          <ChannelBarsWithLogos channels={visibleChannels} />
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        eyebrow="Per campaign"
        title="Campaign performance"
        description="Reach, leads, booked work, and revenue per campaign. Select one to open its full analytics."
        aside={
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {filteredRows.length} of {campaignRows.length}
          </span>
        }
      >
        <DataTable
          columns={CAMPAIGN_COLUMNS}
          data={filteredRows}
          getRowId={(row) => row.id}
          rowHref={(row) => `/analytics/${row.id}`}
          minWidth="min-w-[820px]"
          emptyState={<EmptyState title="No campaigns match" detail="No campaigns match the current filters. Clear a filter to see more." />}
        />
      </WorkspacePanel>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-5 w-px bg-[var(--border-hairline)] sm:block" aria-hidden="true" />;
}

type Option = { value: string; label: string; channel?: string };

/** A labeled segmented control (or a compact select for long lists). */
function FilterGroup({
  label,
  value,
  onChange,
  options,
  withLogos = false,
  dropdown = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  withLogos?: boolean;
  dropdown?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
      {dropdown ? (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="max-w-[220px] cursor-pointer appearance-none rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] py-1 pl-3 pr-7 text-xs font-semibold text-[var(--text-secondary)] outline-none transition hover:border-[var(--border-strong)] focus:border-[var(--accent)]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      ) : (
        <div className="inline-flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`relative inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold transition duration-150 active:translate-y-px ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {withLogos && o.channel ? <ChannelLogo channel={o.channel} size={15} /> : null}
                {o.label}
                {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Channel bars with real channel logos in front of each row. */
function ChannelBarsWithLogos({ channels }: { channels: ChannelPerformance[] }) {
  if (channels.length === 0) {
    return <div className="p-5"><EmptyState title="No channels" detail="No channel data for this filter." /></div>;
  }
  const max = Math.max(1, ...channels.map((c) => c.leads));
  const shareTotal = channels.reduce((s, c) => s + c.leads, 0) || 1;
  return (
    <div className="space-y-3 p-5">
      {channels.map((c) => {
        const pct = Math.max((c.leads / max) * 100, 4);
        const share = Math.round((c.leads / shareTotal) * 100);
        return (
          <div key={c.channel}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <ChannelLogo channel={c.channel} size={18} />
                {c.channel}
              </span>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                <span className="text-[var(--text-secondary)]">{c.leads} leads</span>
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                {c.booked} booked
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                <span className="font-semibold text-[var(--text-primary)]">{USD.format(c.revenueCents / 100)}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{share}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Campaign performance table (mirrors campaign-performance-table.tsx) ------

const TREND: Record<CampaignPerformanceRow["trend"], { glyph: string; className: string }> = {
  up: { glyph: "▲", className: "text-[var(--ok-text)]" },
  down: { glyph: "▼", className: "text-[var(--priority-text)]" },
  flat: { glyph: "—", className: "text-[var(--text-muted)]" },
};

function Num({ value, accent = false }: { value: number; accent?: boolean }) {
  return (
    <span className={`font-mono text-sm tabular-nums ${accent ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
      {NUM.format(value)}
    </span>
  );
}

const CAMPAIGN_COLUMNS: ColumnDef<CampaignPerformanceRow>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--text-primary)]">{row.original.name}</div>
        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{row.original.persona}</div>
      </div>
    ),
  },
  { id: "impressions", header: "Impressions", meta: { align: "right", width: "w-[120px]" }, cell: ({ row }) => <Num value={row.original.impressions} /> },
  { id: "clicks", header: "Clicks", meta: { align: "right", width: "w-[90px]" }, cell: ({ row }) => <Num value={row.original.clicks} /> },
  { id: "leads", header: "Leads", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.leads} /> },
  { id: "booked", header: "Booked", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.booked} accent /> },
  {
    id: "revenue",
    header: "Revenue",
    meta: { align: "right", width: "w-[120px]" },
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{USD.format(row.original.revenueCents / 100)}</span>
    ),
  },
  {
    id: "conversion",
    header: "Conv.",
    meta: { align: "right", width: "w-[96px]" },
    cell: ({ row }) => {
      const t = TREND[row.original.trend];
      return (
        <span className="inline-flex items-center justify-end gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{row.original.conversion}%</span>
          <span className={`text-[11px] ${t.className}`} aria-hidden="true">{t.glyph}</span>
        </span>
      );
    },
  },
];
