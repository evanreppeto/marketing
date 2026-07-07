"use client";

import { useMemo, useState } from "react";

export type PersonaVM = {
  slug: string;
  name: string;
  initials: string;
  segment: "acquisition" | "engagement" | "retention";
  segmentLabel: string;
  segColor: string;
  stage: string;
  stageColor: string;
  stageBg: string;
  score: number;
  scoreColor: string;
  audienceShare: number;
  scoreTrend: number[];
  live: boolean;
  quote: string;
  profile: string;
  angle: string;
  cta: string;
  nextAction: string;
  channel: string;
  bestTiming: string;
  audience: string;
  proofPoints: string[];
  sampleSubject: string;
  samplePreview: string;
  radar: { engagement: number; fit: number; intent: number };
  drivers: { engagement: string; fit: string; intent: string };
  perf: { leads: number; jobs: number; revenue: string };
};

const SEGMENTS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "acquisition", label: "Acquisition" },
  { key: "engagement", label: "Engagement" },
  { key: "retention", label: "Retention" },
];

function Sparkline({ points, up, w = 84, h = 26 }: { points: number[]; up: boolean; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 5) - 2.5;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path d={d} stroke={up ? "var(--ok)" : "var(--accent)"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

export function PersonasView({ personas }: { personas: PersonaVM[] }) {
  const [view, setView] = useState<"roster" | "compare">("roster");
  const [segment, setSegment] = useState("all");
  const [q, setQ] = useState("");
  const [slug, setSlug] = useState(personas[0]?.slug ?? "");
  const [alertOpen, setAlertOpen] = useState(true);

  const headStats = useMemo(() => {
    const segs = new Set(personas.map((p) => p.segment));
    const scored = personas.filter((p) => Number.isFinite(p.score));
    const avg = scored.length ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length) : 0;
    const atRiskList = [...personas].filter((p) => p.score < 65).sort((a, b) => a.score - b.score);
    return { segmentCount: segs.size, avgScore: avg, atRisk: atRiskList.length, lowestName: atRiskList[0]?.name ?? "" };
  }, [personas]);

  const segCounts = useMemo(() => {
    const c: Record<string, number> = { all: personas.length };
    for (const p of personas) c[p.segment] = (c[p.segment] ?? 0) + 1;
    return c;
  }, [personas]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return personas.filter((p) => {
      if (segment !== "all" && p.segment !== segment) return false;
      if (needle && !`${p.name} ${p.audience} ${p.angle}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [personas, segment, q]);

  const selected = personas.find((p) => p.slug === slug) ?? filtered[0] ?? personas[0] ?? null;

  const grouped = useMemo(() => {
    const order = ["acquisition", "engagement", "retention"];
    return order
      .map((seg) => ({ seg, label: SEGMENTS.find((s) => s.key === seg)?.label ?? seg, items: filtered.filter((p) => p.segment === seg) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  if (personas.length === 0) {
    return (
      <div className="arc-personas">
        <div className="empty">No personas yet. Arc builds persona intelligence here as it learns your audience.</div>
      </div>
    );
  }

  return (
    <div className="arc-personas">
      <div className="phead">
        <div className="ph1row">
          <div>
            <h1 className="pt">Personas</h1>
            <div className="psub">The revenue-intelligence layer — playbooks that power CRM, targeting &amp; campaigns</div>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="gbtn">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              New persona <span className="tg" style={{ marginLeft: 2 }}>org-config</span>
            </button>
          </div>
        </div>
        <div className="pstats">
          <div className="pstat"><div className="sl">Personas</div><div className="sv">{personas.length}</div><div className="sd">org-defined</div></div>
          <div className="pstat"><div className="sl">Segments</div><div className="sv">{headStats.segmentCount}</div><div className="sd">acq · eng · ret</div></div>
          <div className="pstat"><div className="sl">Avg lead score</div><div className="sv">{headStats.avgScore}</div><div className="sd">across personas</div></div>
          <div className="pstat"><div className="sl">Need attention</div><div className="sv" style={headStats.atRisk > 0 ? { color: "var(--warn-text)" } : undefined}>{headStats.atRisk}</div><div className="sd">below target score</div></div>
        </div>
        {alertOpen && headStats.atRisk > 0 && (
          <div className="arcalert">
            <span className="am">A</span>
            <span className="at">
              <b>{headStats.atRisk} persona{headStats.atRisk === 1 ? "" : "s"} scoring below target</b>
              {headStats.lowestName ? <> — Arc can draft refreshed proof points and a new angle for {headStats.lowestName}. Approval-gated.</> : " — Arc can draft refreshed playbooks. Approval-gated."}
            </span>
            <span className="ab">
              <button type="button" className="miniabtn">Draft updates</button>
              <button type="button" className="miniabtn ghost" onClick={() => setAlertOpen(false)}>Dismiss</button>
            </span>
          </div>
        )}
      </div>

      <div className="segbar">
        <div className="vtog">
          <button type="button" className={view === "roster" ? "on" : ""} onClick={() => setView("roster")}>
            <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Roster
          </button>
          <button type="button" className={view === "compare" ? "on" : ""} onClick={() => setView("compare")}>
            <svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 16v-6M13 16V8M18 16v-4" /></svg>
            Compare
          </button>
        </div>
        <span className="barsep" />
        {SEGMENTS.map((s) => (
          <button key={s.key} type="button" className={`segpill${segment === s.key ? " on" : ""}`} onClick={() => setSegment(s.key)}>
            {s.label} <span className="sc">{segCounts[s.key] ?? 0}</span>
          </button>
        ))}
        <span className="segspacer" />
        <span className="ssearch">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter personas…" aria-label="Filter personas" />
        </span>
      </div>

      <div className={`pbody${view === "compare" ? " cmp" : ""}`}>
        {view === "roster" ? (
          <>
            <aside className="roster">
              {grouped.map((g) => (
                <div key={g.seg}>
                  <div className="seglabel">{g.label}</div>
                  {g.items.map((p) => (
                    <button key={p.slug} type="button" className={`prow${p.slug === selected?.slug ? " on" : ""}`} onClick={() => setSlug(p.slug)}>
                      <span className="pav" style={{ background: `${p.segColor}22`, color: p.segColor, border: `1px solid ${p.segColor}55` }}>{p.initials}</span>
                      <span className="pmid">
                        <span className="pn">{p.name}</span>
                        <span className="pmeta">
                          <span className="stagep" style={{ color: p.stageColor, background: p.stageBg }}>{p.stage}</span>
                          <span className="pshare">{p.audienceShare}% aud.</span>
                        </span>
                      </span>
                      <span className="pright">
                        <span className="pscore" style={{ color: p.scoreColor }}>{p.score}</span>
                        <span className="pbar"><i style={{ width: `${p.score}%`, background: p.scoreColor }} /></span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </aside>

            <section className="detail">
              {selected && <PersonaDetail p={selected} />}
            </section>
          </>
        ) : (
          <section className="compare">
            <div className="cmpinner">
              <div className="cmphead">
                <div>
                  <h2>Persona comparison</h2>
                  <div className="csb">{filtered.length} personas · lead score, audience share, and stage side by side</div>
                </div>
              </div>
              <div className="cmptable">
                <table className="ctbl">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Stage</th>
                      <th>Audience</th>
                      <th>Lead score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.slug}>
                        <td>
                          <div className="cpn">
                            <span className="cav" style={{ background: `${p.segColor}22`, color: p.segColor, border: `1px solid ${p.segColor}55` }}>{p.initials}</span>
                            <div>
                              <div className="cnm">{p.name}</div>
                              <div className="cseg">{p.segmentLabel}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className="stagep" style={{ color: p.stageColor, background: p.stageBg }}>{p.stage}</span></td>
                        <td>{p.audienceShare}%</td>
                        <td>
                          <span className="scellbar">
                            <span className="mb"><i style={{ width: `${p.score}%`, background: p.scoreColor }} /></span>
                            <b style={{ color: p.scoreColor }}>{p.score}</b>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Signals radar (Engage / Fit / Intent triangle) — ported from build-personas.html.
function Radar({ sig }: { sig: { engagement: number; fit: number; intent: number } }) {
  const cx = 85, cy = 72, R = 52;
  const ax: [keyof typeof sig, number, string][] = [["engagement", -90, "Engage"], ["fit", 30, "Fit"], ["intent", 150, "Intent"]];
  const pt = (ang: number, r: number): [number, number] => { const a = (ang * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const rings = [0.4, 0.7, 1].map((f) => ax.map((a) => pt(a[1], R * f).map((n) => n.toFixed(1)).join(",")).join(" "));
  const vpts = ax.map((a) => pt(a[1], (R * sig[a[0]]) / 100).map((n) => n.toFixed(1)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 170 138" width="172" height="140" aria-hidden="true">
      {rings.map((pts, i) => <polygon key={i} points={pts} fill="none" stroke="rgba(232,224,205,.18)" />)}
      {ax.map((a) => { const p = pt(a[1], R); return <line key={a[0]} x1={cx} y1={cy} x2={p[0].toFixed(1)} y2={p[1].toFixed(1)} stroke="rgba(232,224,205,.22)" />; })}
      <polygon points={vpts} fill="rgba(200,162,74,.2)" stroke="#c8a24a" strokeWidth={1.8} strokeLinejoin="round" />
      {ax.map((a) => { const p = pt(a[1], (R * sig[a[0]]) / 100); return <circle key={a[0]} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={2.6} fill="#c8a24a" />; })}
      {ax.map((a) => { const lp = pt(a[1], R + 14); return <text key={a[0]} x={lp[0].toFixed(1)} y={(lp[1] + 3).toFixed(1)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ece7db">{a[2]}</text>; })}
    </svg>
  );
}

function PersonaDetail({ p }: { p: PersonaVM }) {
  const up = p.scoreTrend.length >= 2 && p.scoreTrend[p.scoreTrend.length - 1] >= p.scoreTrend[0];
  return (
    <>
      <div className="dhead">
        <span className="dav" style={{ background: `${p.segColor}22`, color: p.segColor, border: `1px solid ${p.segColor}55` }}>{p.initials}</span>
        <div className="dh-main">
          <h1 className="dname">{p.name}</h1>
          <div className="dmeta">
            <span className="chip seg">{p.segmentLabel}</span>
            <span className="chip org" style={{ color: p.stageColor }}>{p.stage}</span>
          </div>
          {(p.profile || p.quote) && (
            <p className="dprofile">
              {p.profile}
              {p.quote && <> <span className="q">&ldquo;{p.quote}&rdquo;</span></>}
            </p>
          )}
        </div>
        <div className="dconf">
          <div className="cl">Lead score</div>
          <div className="cv" style={{ color: p.scoreColor }}>{p.score}<span style={{ fontSize: 14, color: "var(--muted)" }}>/100</span></div>
          <div className="ct">
            <span className="ctl">90-day</span>
            <span className="sparkwrap"><Sparkline points={p.scoreTrend} up={up} /></span>
          </div>
        </div>
      </div>

      <div className="sec dduo">
        <div className="radarcard">
          <h3 className="sh" style={{ alignSelf: "flex-start", marginBottom: 4 }}>Signals <span className="tg wired">snapshots</span></h3>
          <Radar sig={p.radar} />
          <div className="rdrivers">
            <div className="rdr"><b>Engagement</b>{p.drivers.engagement}</div>
            <div className="rdr"><b>Fit</b>{p.drivers.fit}</div>
            <div className="rdr"><b>Intent</b>{p.drivers.intent}</div>
          </div>
        </div>
        <div className="perfcard">
          <h3 className="sh">Performance <span className="tg wired">wired · leads / outcomes</span></h3>
          <div className="perfgrid">
            <div className="pc"><div className="pl">Leads (30d)</div><div className="pv">{p.perf.leads}</div><div className="pd">attributed</div></div>
            <div className="pc"><div className="pl">Booked jobs</div><div className="pv">{p.perf.jobs}</div><div className="pd">scheduled</div></div>
            <div className="pc"><div className="pl">Won revenue</div><div className="pv">{p.perf.revenue}</div><div className="pd">outcomes</div></div>
            <div className="pc"><div className="pl">Conversion</div><div className="pv">{p.perf.leads > 0 ? `${Math.round((p.perf.jobs / p.perf.leads) * 100)}%` : "—"}</div><div className="pd">lead → job</div></div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sh">Playbook</div>
        <div className="pbk">
          {p.angle && (
            <div className="pbi full">
              <div className="pl">Message angle</div>
              <div className="pv angle">{p.angle}</div>
            </div>
          )}
          {p.cta && (
            <div className="pbi">
              <div className="pl">Recommended CTA</div>
              <div className="pv"><span className="ctaval">→ {p.cta}</span></div>
            </div>
          )}
          {p.nextAction && (
            <div className="pbi">
              <div className="pl">Next best action</div>
              <div className="pv">{p.nextAction}</div>
            </div>
          )}
          {p.channel && (
            <div className="pbi">
              <div className="pl">Preferred channel</div>
              <div className="pv">{p.channel}</div>
            </div>
          )}
          {p.bestTiming && (
            <div className="pbi">
              <div className="pl">Best timing</div>
              <div className="pv">{p.bestTiming}</div>
            </div>
          )}
          {p.audience && (
            <div className="pbi full">
              <div className="pl">Who they are</div>
              <div className="pv">{p.audience}</div>
            </div>
          )}
          {p.proofPoints.length > 0 && (
            <div className="pbi full">
              <div className="pl">Proof points</div>
              <div className="ppchips">
                {p.proofPoints.map((pt) => (
                  <span className="ppchip" key={pt}>{pt}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {(p.sampleSubject || p.samplePreview) && (
        <div className="sec">
          <div className="sh">Sample message · what Arc would send</div>
          <div className="msg">
            <div className="mh">
              <span className="mfrom">A</span>
              <div>
                <div className="msub">{p.sampleSubject || "Draft subject"}</div>
                <div className="mfl">Arc draft · nothing sends until you approve</div>
              </div>
            </div>
            {p.samplePreview && <div className="mpv">{p.samplePreview}</div>}
          </div>
        </div>
      )}
    </>
  );
}
