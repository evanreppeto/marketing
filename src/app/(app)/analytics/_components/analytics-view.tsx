"use client";

import { useState } from "react";

import type { AnalyticsOverview, TrendKey, TrendSeries } from "@/lib/analytics/overview";

export type ActivityRowVM = { id: string; dot: string; title: string; detail: string; meta: string[]; time: string };
export type ActivityDayVM = { label: string; rows: ActivityRowVM[] };

type View = "overview" | "personas" | "channels" | "activity";

const METRICS: { key: TrendKey; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "leads", label: "Leads" },
  { key: "bookings", label: "Bookings" },
];

function fmtRevenue(cents: number): string {
  const d = Math.round(cents / 100);
  return d >= 1000 ? `$${Math.round(d / 1000)}k` : `$${d}`;
}
function axisValue(metric: TrendKey, v: number): string {
  return metric === "revenue" ? fmtRevenue(v) : String(Math.round(v));
}

// Centered moving average — smooths lumpy daily counts into a readable trend line.
function smoothed(arr: number[], w = 5): number[] {
  const half = Math.floor(w / 2);
  return arr.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) { sum += arr[j]; count++; }
    return count ? sum / count : 0;
  });
}
// Catmull-Rom → cubic-bezier so the line curves through the points.
function curve(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function TrendChart({ metric, series, labels }: { metric: TrendKey; series: TrendSeries; labels: string[] }) {
  const W = 720, H = 216, padL = 46, padR = 14, padT = 12, padB = 24;
  const n = series.cur.length;
  if (n < 2) return null;
  const cur = smoothed(series.cur);
  const prev = smoothed(series.prev);
  const max = Math.max(1, ...cur, ...prev);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const pts = (arr: number[]): [number, number][] => arr.map((v, i) => [x(i), y(v)]);
  const curPath = curve(pts(cur));
  const area = `${curPath} L${x(n - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  // Label roughly every 6th day so the axis isn't crowded.
  const tickEvery = Math.ceil(n / 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric} trend, last ${n} days vs previous period`}>
      <defs>
        <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((g) => {
        const gy = padT + g * (H - padT - padB);
        const val = max * (1 - g);
        return (
          <g key={g}>
            <line className="grid" x1={padL} y1={gy} x2={W - padR} y2={gy} />
            <text className="axis" x={padL - 8} y={gy + 3} textAnchor="end">{axisValue(metric, val)}</text>
          </g>
        );
      })}
      {labels.map((lab, i) =>
        i % tickEvery === 0 || i === n - 1 ? (
          <text key={i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{lab}</text>
        ) : null,
      )}
      <path className="area" d={area} />
      <path className="prev" d={curve(pts(prev))} />
      <path className="cur" d={curPath} />
    </svg>
  );
}

function Breakdown({ rows }: { rows: AnalyticsOverview["revenueByPersona"] }) {
  if (rows.length === 0) return <div className="psub">No data in this window yet.</div>;
  return (
    <div className="bd">
      {rows.map((b) => (
        <div className="bdrow" key={b.label}>
          <span className="bn"><span className="dot" style={{ background: b.dot }} />{b.label}</span>
          <span className="bb"><i style={{ width: `${b.width}%`, background: b.dot }} /></span>
          <span className="bv">{b.valueLabel ?? b.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsView({
  overview,
  activitySummary,
  activityDays,
}: {
  overview: AnalyticsOverview;
  activitySummary: { label: string; value: number }[];
  activityDays: ActivityDayVM[];
}) {
  const [view, setView] = useState<View>("overview");
  const [metric, setMetric] = useState<TrendKey>("revenue");

  return (
    <div className="arc-analytics">
      <div className="ctrlbar">
        <div className="vtabs">
          {([["overview", "Overview"], ["personas", "Personas"], ["channels", "Channels"], ["activity", "Activity"]] as [View, string][]).map(([k, label]) => (
            <button type="button" key={k} className={`vtab${view === k ? " on" : ""}`} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <span className="cspacer" />
        <span className="ctl">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
          Last 30 days <span className="cv">▾</span>
        </span>
        <span className="ctl">
          <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /></svg>
          Persona <span className="cv">▾</span>
        </span>
      </div>

      <div className="body">
        <div className="inner">
          {view === "overview" && (
            <>
              <div className="vhead">
                <div>
                  <h1 className="pt">Performance overview</h1>
                  <div className="psub">Last 30 days · compared to the prior 30 · org-scoped, straight from CRM</div>
                </div>
              </div>

              <div className="kpis">
                {overview.kpis.map((k) => (
                  <div className="kpi" key={k.label}>
                    <div className="kl">
                      {k.label}
                      <span className={`tg ${k.tag === "wired" ? "wired" : "sync"}`}>{k.tagLabel}</span>
                    </div>
                    <div className="kv">{k.value}</div>
                    <div className={`kd ${k.dir}`}>{k.dir === "up" ? "▲" : k.dir === "dn" ? "▼" : "—"} {k.deltaLabel}</div>
                    <div className="kp">{k.prevLabel}</div>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="ph">
                  <h2>Trend</h2>
                  <div className="seg">
                    {METRICS.map((m) => (
                      <button type="button" key={m.key} className={metric === m.key ? "on" : ""} onClick={() => setMetric(m.key)}>{m.label}</button>
                    ))}
                  </div>
                  <div className="legend">
                    <span><i className="cur" />This period</span>
                    <span><i className="prev" />Previous</span>
                  </div>
                </div>
                <div className="chart" key={metric}>
                  {overview.hasHistory ? (
                    <TrendChart metric={metric} series={overview.trend[metric]} labels={overview.trendLabels} />
                  ) : (
                    <div className="psub" style={{ padding: "40px 0", textAlign: "center" }}>Trend builds as leads, jobs, and outcomes accrue.</div>
                  )}
                </div>
              </div>

              <div className="grid2">
                <div className="col">
                  <div className="blk">
                    <h2>Funnel <span className="tg wired">wired · CRM</span></h2>
                    <div className="funnel">
                      {overview.funnel.map((s) => (
                        <div className="fstage" key={s.label}>
                          <span className="fl">{s.label}</span>
                          <span className="ftrack"><i style={{ width: `${s.width}%` }} /></span>
                          <span className="fv"><b>{s.count.toLocaleString()}</b> {s.note && <span>{s.note}</span>}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="blk">
                    <h2>Revenue by persona <span className="tg wired">wired · outcomes</span></h2>
                    <Breakdown rows={overview.revenueByPersona} />
                  </div>
                  <div className="blk">
                    <h2>Leads by source <span className="tg wired">wired · CRM</span></h2>
                    <Breakdown rows={overview.leadsBySource} />
                  </div>
                </div>

                <div className="airead">
                  <div className="al"><span className="am">A</span><span className="at">Arc&apos;s read</span></div>
                  <p>{overview.arcRead.text}</p>
                  {overview.arcRead.cites.length > 0 && (
                    <div className="cited">{overview.arcRead.cites.map((c) => <span className="cit" key={c}>{c}</span>)}</div>
                  )}
                  {overview.arcRead.rec && (
                    <div className="recbox">
                      <div className="rl">Recommended next iteration · Arc estimate</div>
                      <div className="rt">{overview.arcRead.rec}</div>
                    </div>
                  )}
                  <div className="abtns">
                    <button type="button" className="gbtn gold"><svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>Draft the iteration</button>
                    <button type="button" className="gbtn"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z" /></svg>Ask Arc</button>
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginTop: 11, lineHeight: 1.5 }}>
                    Numbers from real leads / jobs / outcomes. The recommendation is Arc&apos;s interpretation — not an automated decision.
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "personas" && (
            <>
              <div className="vhead"><div><h1 className="pt">By persona</h1><div className="psub">Revenue per persona this period · wired from outcomes</div></div></div>
              <div className="blk"><h2>Revenue by persona <span className="tg wired">wired · outcomes</span></h2><Breakdown rows={overview.revenueByPersona} /></div>
            </>
          )}

          {view === "channels" && (
            <>
              <div className="vhead"><div><h1 className="pt">By channel</h1><div className="psub">Lead source mix · spend / ROAS need an ad-platform sync</div></div></div>
              <div className="blk"><h2>Leads by source <span className="tg wired">wired · CRM</span></h2><Breakdown rows={overview.leadsBySource} /></div>
              <div className="blk" style={{ marginTop: 18 }}><h2>ROAS by channel <span className="tg sync">needs spend sync</span></h2><div className="psub">Return-on-ad-spend fills in once an ad-platform connector reports spend against these sources.</div></div>
            </>
          )}

          {view === "activity" && (
            <>
              <div className="vhead"><div><h1 className="pt">Activity</h1><div className="psub">The full audit trail — every Arc action, approval, and signal, merged from your workspace.</div></div></div>
              <div className="asum">
                {activitySummary.map((s) => (
                  <div className="kpi" key={s.label}><div className="kl">{s.label}</div><div className="kv">{s.value}</div></div>
                ))}
              </div>
              {activityDays.length === 0 ? (
                <div className="blk"><div className="psub">No activity recorded yet. Arc logs its actions here as it works.</div></div>
              ) : (
                activityDays.map((day) => (
                  <div key={day.label}>
                    <div className="aday">{day.label}</div>
                    {day.rows.map((r) => (
                      <div className="arow" key={r.id}>
                        <span className="adot" style={{ background: r.dot }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="atitle">{r.title}</div>
                          {r.detail && <div className="adetail">{r.detail}</div>}
                          {r.meta.length > 0 && <div className="ameta">{r.meta.map((m, i) => <span className="achip" key={i}>{m}</span>)}</div>}
                        </div>
                        <span className="atime">{r.time}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
