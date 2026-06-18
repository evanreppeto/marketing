import Link from "next/link";

import { PageHeader, StatStrip, StatusPill, type StatItem } from "@/app/_components/page-header";
import { WorkspacePanel } from "@/app/_components/workspace";
import type {
  CampaignAnalyticsDemoDetail,
  CampaignDetailTrendPoint,
} from "@/lib/performance/campaign-demo-detail";
import { CampaignDetailExplorer } from "./campaign-detail-explorer";

/**
 * Rich single-campaign analytics view for the demo dataset (no Supabase): KPI
 * strip, a full performance-over-time area chart, funnel + channel breakdown +
 * approval readiness, and a per-asset table with provenance. All charts are pure
 * inline SVG (no recharts). Read-only — the approval/outbound gate stays visible.
 */
export function CampaignAnalyticsDemoDetail({ detail }: { detail: CampaignAnalyticsDemoDetail }) {
  const statItems: StatItem[] = detail.kpis.map((k) => ({
    label: k.label,
    value: k.value,
    hint: k.hint,
    delta: k.delta,
    deltaTone: k.deltaTone,
    tone: k.key === "revenue" ? "accent" : "neutral",
    spark: k.spark,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={detail.name}
        description={detail.objective}
        backHref="/analytics"
        backLabel="analytics"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="blue">{detail.persona}</StatusPill>
            <StatusPill tone={detail.lifecycle === "Live" ? "green" : "amber"}>{detail.lifecycle}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
            <span className="font-mono text-xs text-[var(--text-muted)]">updated {detail.updatedAt}</span>
          </div>
        }
      />

      <StatStrip items={statItems} />

      <WorkspacePanel
        eyebrow="Performance over time"
        title="Leads, booked work & revenue"
        description="Weekly delivery across the campaign window. Bars are marketing-attributed revenue; lines are new leads and booked jobs."
        aside={<span className="font-mono text-xs text-[var(--text-muted)]">{detail.windowLabel}</span>}
      >
        <PerformanceOverTime points={detail.trend} />
      </WorkspacePanel>

      {/* Filterable funnel + channels + approval + asset table (client island). */}
      <CampaignDetailExplorer detail={detail} />

      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        These figures are illustrative demo data (Supabase not connected).{" "}
        <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href="/campaigns">
          Open the campaign workspace
        </Link>{" "}
        to review the package and its approval gate.
      </p>
    </div>
  );
}

// --- Performance over time: revenue bars + leads/booked lines (inline SVG) ----

const VB_W = 760;
const VB_H = 260;
const PAD = { top: 16, right: 44, bottom: 28, left: 46 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

function niceCeil(value: number): number {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * pow;
}

function PerformanceOverTime({ points }: { points: CampaignDetailTrendPoint[] }) {
  const n = points.length;
  const countMax = niceCeil(Math.max(1, ...points.map((p) => Math.max(p.leads, p.booked))));
  const revMax = niceCeil(Math.max(1, ...points.map((p) => p.revenue)));

  const xCenter = (i: number) => PAD.left + (PLOT_W / n) * (i + 0.5);
  const yCount = (v: number) => PAD.top + PLOT_H - (v / countMax) * PLOT_H;
  const yRev = (v: number) => PAD.top + PLOT_H - (v / revMax) * PLOT_H;

  const barW = (PLOT_W / n) * 0.52;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(countMax * f));
  const revTicks = [0, 0.5, 1].map((f) => Math.round(revMax * f));
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  const line = (key: "leads" | "booked") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${xCenter(i).toFixed(2)} ${yCount(p[key]).toFixed(2)}`).join(" ");

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-[var(--border-strong)] bg-[var(--surface-raised)]" />Revenue / wk</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />New leads</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--ok)]" />Booked jobs</span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        role="img"
        aria-label="Weekly leads, booked jobs, and revenue"
      >
        <defs>
          <clipPath id="detail-plot">
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {ticks.map((t) => {
          const y = yCount(t);
          return (
            <g key={`g-${t}`}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke="var(--border-hairline)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill="var(--accent)" className="tabular-nums">{t}</text>
            </g>
          );
        })}

        {revTicks.map((t, i) => (
          <text key={`rt-${i}`} x={VB_W - PAD.right + 7} y={yRev(t) + 3.5} textAnchor="start" fontSize={10} fill="var(--text-muted)" className="tabular-nums">
            {revMax >= 1000 ? `$${Math.round(t / 1000)}k` : `$${t}`}
          </text>
        ))}

        {/* Revenue context bars — neutral raised fill so they read as the backdrop,
            leaving gold + green for the leads/booked lines that sit on top. */}
        <g clipPath="url(#detail-plot)">
          {points.map((p, i) => {
            const h = PAD.top + PLOT_H - yRev(p.revenue);
            return (
              <rect
                key={`bar-${i}`}
                x={xCenter(i) - barW / 2}
                y={yRev(p.revenue)}
                width={barW}
                height={Math.max(h, 0)}
                rx={2}
                fill="var(--surface-raised)"
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            );
          })}

          <path d={line("booked")} fill="none" stroke="var(--ok)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={line("leads")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

          {points.map((p, i) => (
            <g key={`d-${i}`}>
              <circle cx={xCenter(i)} cy={yCount(p.booked)} r={2.4} fill="var(--ok)" />
              <circle cx={xCenter(i)} cy={yCount(p.leads)} r={2.4} fill="var(--accent)" />
            </g>
          ))}
        </g>

        {points.map((p, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={`x-${i}`} x={xCenter(i)} y={VB_H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)" className="tabular-nums">{p.week}</text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
