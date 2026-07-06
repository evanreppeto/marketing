"use client";

import { useState } from "react";

export type KpiVM = { label: string; value: string; sub: string; wired: boolean };
export type FunnelStage = { label: string; count: number; width: number; note: string };
export type BreakdownRow = { label: string; count: number; width: number; dot: string };
export type ActivityRowVM = { id: string; dot: string; title: string; detail: string; meta: string[]; time: string };
export type ActivityDayVM = { label: string; rows: ActivityRowVM[] };

export type AnalyticsData = {
  kpis: KpiVM[];
  funnel: FunnelStage[];
  breakdown: BreakdownRow[];
  arcRead: string;
  arcCites: string[];
  activitySummary: { label: string; value: number }[];
  activityDays: ActivityDayVM[];
};

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const [view, setView] = useState<"overview" | "activity">("overview");

  return (
    <div className="arc-analytics">
      <div className="ctrlbar">
        <div className="vtabs">
          <button type="button" className={`vtab${view === "overview" ? " on" : ""}`} onClick={() => setView("overview")}>Overview</button>
          <button type="button" className={`vtab${view === "activity" ? " on" : ""}`} onClick={() => setView("activity")}>Activity</button>
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
          {view === "overview" ? (
            <>
              <div className="vhead">
                <div>
                  <h1 className="pt">Performance</h1>
                  <div className="psub">Your funnel and pipeline, straight from CRM. Send/spend metrics fill in as campaigns report.</div>
                </div>
              </div>

              <div className="kpis">
                {data.kpis.map((k) => (
                  <div className="kpi" key={k.label}>
                    <div className="kl">
                      {k.label}
                      <span className={`tg ${k.wired ? "wired" : "sync"}`}>{k.wired ? "wired" : "needs data"}</span>
                    </div>
                    <div className="kv">{k.value}</div>
                    <div className="kp">{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid2">
                <div className="col">
                  <div className="blk">
                    <h2>Lifecycle funnel <span className="tg wired">wired · CRM</span></h2>
                    <div className="funnel">
                      {data.funnel.map((s) => (
                        <div className="fstage" key={s.label}>
                          <span className="fl">{s.label}</span>
                          <span className="ftrack"><i style={{ width: `${s.width}%` }} /></span>
                          <span className="fv">{s.count.toLocaleString()} <span>{s.note}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="blk">
                    <h2>Leads by persona <span className="tg wired">wired · CRM</span></h2>
                    {data.breakdown.length === 0 ? (
                      <div className="psub">No leads yet — persona breakdown appears as leads come in.</div>
                    ) : (
                      <div className="bd">
                        {data.breakdown.map((b) => (
                          <div className="bdrow" key={b.label}>
                            <span className="bn"><span className="dot" style={{ background: b.dot }} />{b.label}</span>
                            <span className="bb"><i style={{ width: `${b.width}%`, background: b.dot }} /></span>
                            <span className="bv">{b.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="airead">
                  <div className="al">
                    <span className="am">A</span>
                    <span className="at">Arc read</span>
                  </div>
                  <p>{data.arcRead}</p>
                  {data.arcCites.length > 0 && (
                    <div className="cited">
                      {data.arcCites.map((c) => (
                        <span className="cit" key={c}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="vhead">
                <div>
                  <h1 className="pt">Activity</h1>
                  <div className="psub">The full audit trail — every Arc action, approval, and signal, merged from your workspace.</div>
                </div>
              </div>

              <div className="asum">
                {data.activitySummary.map((s) => (
                  <div className="kpi" key={s.label}>
                    <div className="kl">{s.label}</div>
                    <div className="kv">{s.value}</div>
                  </div>
                ))}
              </div>

              {data.activityDays.length === 0 ? (
                <div className="blk"><div className="psub">No activity recorded yet. Arc logs its actions here as it works.</div></div>
              ) : (
                data.activityDays.map((day) => (
                  <div key={day.label}>
                    <div className="aday">{day.label}</div>
                    {day.rows.map((r) => (
                      <div className="arow" key={r.id}>
                        <span className="adot" style={{ background: r.dot }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="atitle">{r.title}</div>
                          {r.detail && <div className="adetail">{r.detail}</div>}
                          {r.meta.length > 0 && (
                            <div className="ameta">
                              {r.meta.map((m, i) => (
                                <span className="achip" key={i}>{m}</span>
                              ))}
                            </div>
                          )}
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
