"use client";

import { useMemo, useState } from "react";

import { type ColumnDef } from "@tanstack/react-table";
import { ChannelLogo } from "@/app/_components/brand-logos";
import { theme } from "@/app/_components/theme";
import { WorkspacePanel } from "@/app/_components/workspace";
import { StatusPill } from "@/app/_components/page-header";
import { DataTable } from "@/components/ui/data-table";
import type {
  CampaignAnalyticsDemoDetail,
  CampaignDetailAssetRow,
  CampaignDetailChannelRow,
} from "@/lib/performance/campaign-demo-detail";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");
const ALL = "__all__";

/**
 * Client island for the per-campaign analytics detail: a channel filter (drives
 * the funnel, channel table, and asset table) plus an asset-source filter. All
 * filtering is in-browser so the charts respond instantly. Read-only display.
 */
export function CampaignDetailExplorer({ detail }: { detail: CampaignAnalyticsDemoDetail }) {
  const [channel, setChannel] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);

  const channelOptions = useMemo(() => detail.channels.map((c) => c.channel), [detail.channels]);
  const sourceOptions = useMemo(
    () => Array.from(new Set(detail.assets.map((a) => a.source))),
    [detail.assets],
  );

  const visibleChannels = useMemo(
    () => (channel === ALL ? detail.channels : detail.channels.filter((c) => c.channel === channel)),
    [detail.channels, channel],
  );

  const visibleAssets = useMemo(
    () =>
      detail.assets.filter(
        (a) => (channel === ALL || a.channel === channel) && (source === ALL || a.source === source),
      ),
    [detail.assets, channel, source],
  );

  // Funnel scales by the chosen channel's lead share; leads/booked come straight
  // from that channel row, impressions/clicks scale proportionally.
  const funnel = useMemo(() => {
    if (channel === ALL) return detail.funnel;
    const chan = detail.channels.find((c) => c.channel === channel);
    const totalLeads = detail.channels.reduce((s, c) => s + c.leads, 0) || 1;
    const share = chan ? chan.leads / totalLeads : 0;
    return detail.funnel.map((stage) =>
      stage.label === "Leads"
        ? { ...stage, count: chan?.leads ?? 0 }
        : stage.label === "Booked"
          ? { ...stage, count: chan?.booked ?? 0 }
          : { ...stage, count: Math.round(stage.count * share) },
    );
  }, [detail.funnel, detail.channels, channel]);

  const isFiltered = channel !== ALL || source !== ALL;

  return (
    <div className="grid gap-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--border-hairline)] pb-3">
        <Segmented
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={[{ value: ALL, label: "All" }, ...channelOptions.map((c) => ({ value: c, label: c, channel: c }))]}
          withLogos
        />
        <span className="hidden h-5 w-px bg-[var(--border-hairline)] sm:block" aria-hidden="true" />
        <Segmented
          label="Asset source"
          value={source}
          onChange={setSource}
          options={[{ value: ALL, label: "All" }, ...sourceOptions.map((s) => ({ value: s, label: s }))]}
        />
        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setChannel(ALL);
              setSource(ALL);
            }}
            className="ml-auto rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <WorkspacePanel eyebrow="Funnel" title="Reach to booked work" description="How impressions narrow into booked jobs.">
            <Funnel stages={funnel} />
          </WorkspacePanel>
          <WorkspacePanel eyebrow="Channels" title="Channel performance" description="Leads, booked work, spend, and revenue by channel.">
            <ChannelTable channels={visibleChannels} />
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          eyebrow="Approval"
          title="Package readiness"
          description="Every deliverable in this package by approval state. Nothing reaches the outside world until you sign off."
          aside={<StatusPill tone="amber">Gate active</StatusPill>}
        >
          <div className="grid gap-5 p-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
            <ApprovalDonut approval={detail.approval} />
            <dl className="space-y-2.5 text-sm">
              <LegendRow dotClass="bg-[var(--ok)]" label="Approved" value={detail.approval.approved} />
              <LegendRow dotClass="bg-[var(--warn)]" label="Needs review" value={detail.approval.pending} />
              <LegendRow dotClass="bg-[var(--border-strong)]" label="In draft" value={detail.approval.draft} />
              <div className="mt-3 border-t border-[var(--border-hairline)] pt-3 text-xs leading-5 text-[var(--text-secondary)]">
                {detail.approval.pending > 0
                  ? `${detail.approval.pending} ${detail.approval.pending === 1 ? "piece" : "pieces"} waiting on your review before this package can go live.`
                  : "All gating pieces approved. Outbound stays locked until you launch."}
              </div>
            </dl>
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        eyebrow="Per asset"
        title="Asset performance & provenance"
        description="Every produced deliverable — its source, format, delivery, and approval state. Real brand media is preferred; AI work enhances and packages authentic proof."
        aside={
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {visibleAssets.length} of {detail.assets.length}
          </span>
        }
      >
        <AssetTable assets={visibleAssets} />
      </WorkspacePanel>
    </div>
  );
}

type SegOption = { value: string; label: string; channel?: string };

function Segmented({
  label,
  value,
  onChange,
  options,
  withLogos = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SegOption[];
  withLogos?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-[var(--text-muted)]">{label}</span>
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
    </div>
  );
}

function LegendRow({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-[var(--text-secondary)]">
        <span className={`h-2 w-2 rounded-sm ${dotClass}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Funnel({ stages }: { stages: CampaignAnalyticsDemoDetail["funnel"] }) {
  const top = stages[0]?.count ?? 0;
  return (
    <div className="space-y-3.5 p-4">
      {stages.map((stage, index) => {
        const raw = top > 0 ? (stage.count / top) * 100 : 0;
        const pct = stage.count > 0 ? Math.max(raw, 14) : 0;
        const stepRate = index > 0 && stages[index - 1].count > 0 ? Math.round((stage.count / stages[index - 1].count) * 100) : null;
        const ofTop = top > 0 ? (stage.count / top) * 100 : 0;
        const ofTopLabel = ofTop >= 10 ? `${Math.round(ofTop)}%` : ofTop >= 1 ? `${ofTop.toFixed(1)}%` : `${ofTop.toFixed(2)}%`;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{stage.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {NUM.format(stage.count)}
                {stepRate !== null ? <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{stepRate}% of prior</span> : null}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{index === 0 ? "100%" : ofTopLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChannelTable({ channels }: { channels: CampaignDetailChannelRow[] }) {
  if (channels.length === 0) {
    return <div className="p-5 text-sm text-[var(--text-muted)]">No channels for this filter.</div>;
  }
  const max = Math.max(1, ...channels.map((c) => c.leads));
  return (
    <div className="space-y-3 p-5">
      {channels.map((c) => {
        const pct = Math.max((c.leads / max) * 100, 4);
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
                {c.spendCents > 0 ? (
                  <>
                    <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                    {USD.format(c.spendCents / 100)} spend
                  </>
                ) : null}
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                <span className="font-semibold text-[var(--text-primary)]">{USD.format(c.revenueCents / 100)}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{c.share}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ApprovalDonut({ approval }: { approval: CampaignAnalyticsDemoDetail["approval"] }) {
  const segments = [
    { value: approval.approved, color: "var(--ok)" },
    { value: approval.pending, color: "var(--warn)" },
    { value: approval.draft, color: "var(--border-strong)" },
  ];
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative mx-auto flex h-[140px] w-[140px] items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Approval readiness">
        <circle cx={70} cy={70} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={14} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * c;
          const dasharray = `${dash} ${c - dash}`;
          const el = (
            <circle
              key={i}
              cx={70}
              cy={70}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={14}
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">{approval.readiness}%</span>
        <span className="text-[10px] font-medium text-[var(--text-muted)]">approved</span>
      </div>
    </div>
  );
}

const SOURCE_TONE: Record<CampaignDetailAssetRow["source"], string> = {
  "Real media": "text-[var(--ok-text)] border-[var(--ok-border-soft)] bg-[var(--ok-soft)]",
  Composite: "text-[var(--accent-contrast)] border-[var(--accent-border-strong)] bg-[var(--accent-soft)]",
  "AI-generated": "text-[var(--warn-text)] border-[var(--warn-border-soft)] bg-[var(--warn-soft)]",
  Stock: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
};

const STATUS_TONE: Record<CampaignDetailAssetRow["status"], string> = {
  Approved: "text-[var(--ok-text)] border-[var(--ok-border-soft)] bg-[var(--ok-soft)]",
  "Needs review": "text-[var(--warn-text)] border-[var(--warn-border-soft)] bg-[var(--warn-soft)]",
  Draft: "text-[var(--text-secondary)] border-[var(--border-strong)] bg-[var(--surface-raised)]",
  Rejected: "text-[var(--priority-text)] border-[var(--priority-border-soft)] bg-[var(--priority-soft)]",
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {children}
    </span>
  );
}

const ASSET_COLUMNS: ColumnDef<CampaignDetailAssetRow>[] = [
  {
    id: "asset",
    header: "Asset",
    meta: { headClassName: "px-5", cellClassName: "px-5" },
    cell: ({ row }) => {
      const a = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <ChannelLogo channel={a.channel} size={20} />
          <div>
            <div className="font-semibold text-[var(--text-primary)]">{a.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {a.channel} · {a.format}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: "source",
    header: "Source",
    cell: ({ row }) => <Chip className={SOURCE_TONE[row.original.source]}>{row.original.source}</Chip>,
  },
  {
    id: "impressions",
    header: "Impr.",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => NUM.format(row.original.impressions),
  },
  {
    id: "clicks",
    header: "Clicks",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => NUM.format(row.original.clicks),
  },
  {
    id: "leads",
    header: "Leads",
    meta: { align: "right", cellClassName: "font-mono font-semibold tabular-nums text-[var(--text-primary)]" },
    cell: ({ row }) => NUM.format(row.original.leads),
  },
  {
    id: "ctr",
    header: "CTR",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => `${row.original.ctr}%`,
  },
  {
    id: "status",
    header: "Status",
    meta: { align: "right", headClassName: "px-5", cellClassName: "px-5" },
    cell: ({ row }) => <Chip className={STATUS_TONE[row.original.status]}>{row.original.status}</Chip>,
  },
];

function AssetTable({ assets }: { assets: CampaignDetailAssetRow[] }) {
  return (
    <DataTable
      columns={ASSET_COLUMNS}
      data={assets}
      getRowId={(a) => a.id}
      minWidth="min-w-[760px]"
      emptyState={<div className="text-sm text-[var(--text-muted)]">No assets match the current filters.</div>}
    />
  );
}
