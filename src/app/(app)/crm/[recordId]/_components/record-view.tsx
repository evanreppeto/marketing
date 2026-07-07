"use client";

import { useState } from "react";

// sparkline path from points
function Spark({ points, tone }: { points: number[]; tone: string }) {
  const w = 58, h = 24, max = Math.max(...points), min = Math.min(...points), span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const c = tone === "ok" ? "var(--ok)" : "var(--muted)";
  return <svg width="58" height="24" viewBox="0 0 58 24" fill="none"><path d={d} stroke={c} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} /></svg>;
}

const GRAPH_NODES = [
  { x: 180, y: 94, r: 24, c: "#c8a24a", t: "LP", center: true, lbl: "Contact" },
  { x: 74, y: 40, r: 17, c: "#7fb89a", t: "MG", lbl: "Company" },
  { x: 300, y: 42, r: 16, c: "#88b6d8", t: "L1", lbl: "Lead" },
  { x: 312, y: 128, r: 14, c: "#88b6d8", t: "L2", lbl: "Lead" },
  { x: 206, y: 166, r: 15, c: "#9678c8", t: "JB", lbl: "Job" },
  { x: 96, y: 158, r: 15, c: "#7fb89a", t: "$$", lbl: "Outcome" },
  { x: 58, y: 108, r: 13, c: "#c8a24a", t: "CP", lbl: "Campaign" },
];
function relGraphHtml() {
  const c = GRAPH_NODES[0];
  const lines = GRAPH_NODES.slice(1).map((n) => `<line x1="${c.x}" y1="${c.y}" x2="${n.x}" y2="${n.y}" stroke="rgba(232,224,205,.16)" stroke-width="1"/>`).join("");
  const circles = GRAPH_NODES.map((n) => `<g style="cursor:pointer"><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.center ? "rgba(200,162,74,.18)" : "var(--inset)"}" stroke="${n.c}" stroke-width="${n.center ? 2 : 1.4}"/><text x="${n.x}" y="${n.y + 3.5}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="${n.center ? 12 : 9}" fill="${n.center ? "#ecd596" : "var(--text-2)"}" font-weight="600">${n.t}</text><text x="${n.x}" y="${n.y + n.r + 11}" text-anchor="middle" font-family="Geist,sans-serif" font-size="8" fill="var(--muted)">${n.lbl}</text></g>`).join("");
  return lines + circles;
}

const svg = (d: string, cls?: string) => <svg viewBox="0 0 24 24" className={cls} dangerouslySetInnerHTML={{ __html: d }} />;
const HOUSE_IC = '<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6"/>';
const STAR_IC = '<path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 21l-5-2.7 1-5.5-4-4 5.5-.8z"/>';
const TASK_IC = '<path d="M9 11l3 3 8-8M4 12v7a1 1 0 001 1h14"/>';
const CK_IC = '<path d="M5 12l4 4L19 6"/>';
const CAMP_IC = '<path d="M4 5h16v6H4z"/><path d="M4 15h10v4H4z"/>';

type Conn = { ic: string; cn: string; cd: string; cv?: string; href?: string };
function ConnRow({ c }: { c: Conn }) {
  const inner = (
    <>
      <span className="ci">{svg(c.ic)}</span>
      <div style={{ minWidth: 0 }}><div className="cn">{c.cn}</div><div className="cd">{c.cd}</div></div>
      {c.cv && <span className="cmeta"><span className="cv">{c.cv}</span></span>}
      <span className="go">→</span>
    </>
  );
  return c.href ? <a className="connrow" href={c.href}>{inner}</a> : <div className="connrow">{inner}</div>;
}

export function RecordView({ name }: { name: string }) {
  const [tab, setTab] = useState("overview");
  const [act, setAct] = useState("timeline");
  const [done, setDone] = useState<Record<number, boolean>>({ 2: true });
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="arc-record">
      <div className="recband">
        <a className="back" href="/crm">{svg('<path d="M15 5l-7 7 7 7"/>')}Back to Contacts</a>
        <div className="idrow">
          <span className="bigav">{initials}</span>
          <div className="idmain">
            <h1 className="rname">{name}</h1>
            <div className="rrole">Homeowner · 12 Oak Ridge Ct · <a>Maple Grove HOA</a></div>
            <div className="idchips">
              <span className="chip persona"><span className="pgd" />Storm-damage homeowner</span>
              <span className="pill active"><span className="pd" />Active</span>
              <span className="chip ghost">{svg('<path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z"/>', "gi")}Inbound · free-inspection form</span>
              <span className="chip ghost">{svg('<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>', "gi")}Owner · Riley</span>
            </div>
          </div>
          <div className="idactions">
            <a className="gbtn gold" href="/arc">{svg('<path d="M4 7h16M4 12h10M4 17h7"/>')}Draft outreach</a>
            <button className="gbtn">{svg('<path d="M4 5h16v11l-4 4H4z"/>')}Note</button>
            <button className="gbtn">{svg(TASK_IC)}Task</button>
            <button className="gbtn ico">{svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>')}</button>
          </div>
        </div>
        <div className="mstrip">
          <div className="mcell"><div className="ml">Lead score <span className="tinytag wired">linked lead</span></div><div className="mv">92<span className="md">+8</span></div></div>
          <div className="mcell"><div className="ml">Interactions</div><div className="mv">24<span className="md">last 1h</span></div></div>
          <div className="mcell"><div className="ml">Open tasks</div><div className="mv">2<span className="md" style={{ color: "var(--warn-text)" }}>1 high</span></div></div>
          <div className="mcell"><div className="ml">Lifetime value</div><div className="mv">$18.4k<span className="md">1 won</span></div></div>
        </div>
      </div>

      <div className="rectabs">
        {[["overview", "Overview", '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z"/>'], ["activity", "Activity", '<path d="M3 12h4l2 6 4-14 2 8h6"/>', "24"], ["intel", "Intelligence", '<path d="M12 4a4 4 0 00-4 4 3 3 0 00-1 6 3 3 0 003 3 3 3 0 006 0 3 3 0 003-3 3 3 0 00-1-6 4 4 0 00-4-4z"/>'], ["related", "Related", '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 8l3 8M16.5 8l-3 8"/>', "9"]].map((t) => (
          <div key={t[0]} className={`rectab${tab === t[0] ? " on" : ""}`} onClick={() => setTab(t[0] as string)}>{svg(t[2] as string)}{t[1]}{t[3] && <span className="cnt">{t[3]}</span>}</div>
        ))}
      </div>

      <div className="recbody">
        <div className="recscroll">
          {tab === "overview" && (
            <div>
              <div className="sec">
                <h3 className="sh">Details <span className="wired">wired</span></h3>
                <div className="fields">
                  {[["Email", "linda.powers@gmail.com", true], ["Phone", "+1 (630) 555-0142"], ["Address", "12 Oak Ridge Ct, Naperville, IL"], ["HOA", "Maple Grove HOA", true], ["Source", "Inbound · free-inspection form"], ["Created", "May 2, 2026"]].map((f) => (
                    <div className="fld" key={f[0] as string}><div className="fl">{f[0]}</div><div className="fv">{f[2] ? <a>{f[1]}</a> : f[1]}</div></div>
                  ))}
                  <div className="fld"><div className="fl">Persona</div><div className="fv"><span className="chip persona" style={{ height: 22 }}><span className="pgd" />Storm-damage homeowner</span></div></div>
                  <div className="fld"><div className="fl">Status</div><div className="fv"><span className="pill active" style={{ height: 22 }}><span className="pd" />Active</span></div></div>
                </div>
              </div>
              <div className="sec">
                <div className="nba">
                  <div className="nl">Next best action <span className="est">Arc estimate</span></div>
                  <div className="nrow"><b>Recommendation:</b> Offer a FREE post-storm roof inspection while the claim window is open.</div>
                  <div className="nrow"><b>Recommended CTA:</b> Schedule a no-cost roof inspection this week.</div>
                  <div className="nrow"><b>Message angle:</b> Lead with insurance-claim coordination and fast local crews — never discounts.</div>
                  <div className="nrow"><b>Proof points:</b> Neighbor restorations on Oak Ridge · workmanship warranty · State Farm claim support.</div>
                  <div className="nbtns"><a className="gbtn gold" href="/arc">{svg('<path d="M4 7h16M4 12h10M4 17h7"/>')}Draft outreach with Arc</a><button className="gbtn">{svg(TASK_IC)}Create task</button></div>
                </div>
              </div>
              <div className="sec">
                <h3 className="sh">Connected records <span className="wired">wired</span></h3>
                <ConnRow c={{ ic: HOUSE_IC, cn: "Maple Grove HOA", cd: "Property mgmt · Tier A · 240 units", cv: "240 units" }} />
                <ConnRow c={{ ic: STAR_IC, cn: "Free-inspection request", cd: "Lead · qualified · score 92", cv: "3h ago" }} />
                <ConnRow c={{ ic: TASK_IC, cn: "JOB-2041 — Roof replacement", cd: "Job · scheduled · Jun 28", cv: "$48,000" }} />
                <ConnRow c={{ ic: CK_IC, cn: "Roof Replacement", cd: "Outcome · won", cv: "$18,400" }} />
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div>
              <div className="tabsmini">
                {["timeline", "tasks", "notes"].map((m) => <span key={m} className={`tabmini${act === m ? " on" : ""}`} onClick={() => setAct(m)}>{m.charAt(0).toUpperCase() + m.slice(1)}</span>)}
              </div>
              {act === "timeline" && (
                <div>
                  {[["note", "Note added", "Riley", "Filed claim with State Farm; adjuster visit scheduled. Wants the roof done before fall.", "Jun 25 · 2:15 PM"], ["ai", "Arc recommendation", "agent", "Flagged fresh hail damage in the storm zone — suggested a free-inspection offer.", "Jun 25 · 9:42 AM"], ["task", "Task completed", "Riley", "Sent the follow-up email regarding the inspection.", "Jun 24 · 10:00 AM"], ["email", "Email logged", "integration", "“Re: Roof inspection and insurance claim questions.”", "Jun 23 · 4:30 PM"], ["status", "Status changed", "system", "Lead promoted from New → Qualified.", "Jun 22 · 11:05 AM"], ["ai", "Arc updated persona", "agent", "Classified as Storm-damage homeowner.", "Jun 20 · 9:10 AM"]].map((e, i) => (
                    <div className="tev" key={i}><span className={`tdot ${e[0]}`} /><div><div className="tt">{e[1]} <span className="by">· {e[2]}</span></div><div className="td">{e[3]}</div><div className="tts">{e[4]}</div></div></div>
                  ))}
                </div>
              )}
              {act === "tasks" && (
                <div>
                  {[["Schedule roof inspection visit", "high", "Due Jun 28 · Riley"], ["Coordinate with State Farm adjuster", "normal", "Due Jul 2 · Riley"], ["Send follow-up email re: inspection", "", "Completed Jun 24"]].map((t, i) => (
                    <div className={`trow${done[i] ? " done" : ""}`} key={i}>
                      <span className={`tcheck${done[i] ? " done" : ""}`} onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}>{svg(CK_IC)}</span>
                      <div style={{ flex: 1 }}><div className="tx">{t[0]}</div><div className="tm">{t[1] && <span className={`prio ${t[1]}`}>{t[1] === "high" ? "High" : "Normal"}</span>}{t[2]}</div></div>
                    </div>
                  ))}
                  <div className="quickadd"><input placeholder={`Add a task for ${name.split(/\s+/)[0]}…`} /><span className="qb">{svg('<path d="M12 5v14M5 12h14"/>')}</span></div>
                </div>
              )}
              {act === "notes" && (
                <div>
                  <div className="trow"><span className="tcheck" style={{ border: "none", background: "var(--accent-soft)" }}><svg viewBox="0 0 24 24" style={{ opacity: 1, stroke: "var(--accent)" }} dangerouslySetInnerHTML={{ __html: '<path d="M5 5h14v11l-4 4H5z"/>' }} /></span><div style={{ flex: 1 }}><div className="tx">Pinned · Fresh hail damage; wants the roof done before fall.</div><div className="tm">Riley · Jun 25</div></div></div>
                  <div className="trow"><span className="tcheck" style={{ border: "none", background: "var(--inset)" }}><svg viewBox="0 0 24 24" style={{ opacity: 1, stroke: "var(--muted)" }} dangerouslySetInnerHTML={{ __html: '<path d="M5 5h14v11l-4 4H5z"/>' }} /></span><div style={{ flex: 1 }}><div className="tx">Filed claim with State Farm; adjuster visit scheduled.</div><div className="tm">Riley · Jun 23</div></div></div>
                  <div className="quickadd"><input placeholder="Write a note…" /><span className="qb">{svg('<path d="M12 5v14M5 12h14"/>')}</span></div>
                </div>
              )}
            </div>
          )}

          {tab === "intel" && (
            <div>
              <div className="sec">
                <h3 className="sh">Persona intelligence <span className="est">Arc estimate</span></h3>
                <div className="card"><div className="pdetail">
                  <div className="pline"><span className="pk">Primary persona</span><span className="pv"><b>Storm-damage homeowner</b> <span className="tinytag wired">wired</span> — fresh hail damage; insurance claim in progress.</span></div>
                  <div className="pline"><span className="pk">Confidence</span><span className="pv"><b>86%</b> <span className="tinytag est">Arc estimate</span><span className="conftrack"><i style={{ width: "86%" }} /></span></span></div>
                  <div className="pline"><span className="pk">Also matches</span><span className="pv">Insurance-ready, Past customer <span className="tinytag est">Arc estimate</span></span></div>
                  <div className="pline"><span className="pk">Journey stage</span><span className="pv"><b>Evaluation</b> <span className="tinytag est">Arc estimate</span></span></div>
                  <div className="pline"><span className="pk">Urgency</span><span className="pv"><b>High</b> — active claim window this week <span className="tinytag est">Arc estimate</span></span></div>
                </div></div>
              </div>
              <div className="sec">
                <h3 className="sh">Scores</h3>
                <div className="scards">
                  <div className="scard"><div className="sl">Lead score <span className="tinytag wired">wired</span></div><div className="srow"><span className="sv" style={{ color: "var(--ok)" }}>92</span><Spark points={[3, 4, 4, 5, 6, 6, 7]} tone="ok" /></div><div className="sd">+8 this month</div></div>
                  <div className="scard"><div className="sl">Relationship <span className="tinytag est">planned</span></div><div className="srow"><span className="sv">64</span><Spark points={[3, 3, 4, 4, 5, 6, 6]} tone="mut" /></div><div className="sd" style={{ color: "var(--muted)" }}>persona-RI field</div></div>
                  <div className="scard"><div className="sl">Revenue opp. <span className="tinytag est">planned</span></div><div className="srow"><span className="sv">$14.2k</span><Spark points={[4, 5, 5, 6, 6, 7, 8]} tone="mut" /></div><div className="sd" style={{ color: "var(--muted)" }}>persona-RI field</div></div>
                </div>
              </div>
              <div className="sec">
                <h3 className="sh">Engagement <span className="wired">wired · interactions</span></h3>
                <div className="egrid">{[["24", "Total interactions"], ["8", "Emails logged"], ["3", "Meetings"]].map((e) => <div className="ecell" key={e[1]}><div className="ev">{e[0]}</div><div className="el">{e[1]}</div></div>)}</div>
              </div>
              <div className="sec">
                <h3 className="sh">Relationship graph <span className="wired">wired</span></h3>
                <div className="relgraph"><svg viewBox="0 0 360 188" dangerouslySetInnerHTML={{ __html: relGraphHtml() }} /></div>
              </div>
              <div className="sec">
                <h3 className="sh">Data quality</h3>
                <div className="card">
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>Record completeness</span><span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--accent-contrast)" }}>82%</span></div>
                  <div className="qbar"><i style={{ width: "82%" }} /></div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Missing fields Arc could enrich:</div>
                  <div className="qmiss">{["Roof age", "Claim number", "Secondary contact"].map((q) => <span className="qm" key={q}>{q}</span>)}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "related" && (
            <div>
              <div className="sec">
                <h3 className="sh">Connected records <span className="wired">wired</span></h3>
                <div className="conngrp"><div className="cgl">Company <span className="cgc">1</span></div><ConnRow c={{ ic: HOUSE_IC, cn: "Maple Grove HOA", cd: "Property mgmt · Tier A · 240 units" }} /></div>
                <div className="conngrp"><div className="cgl">Leads <span className="cgc">2</span></div><ConnRow c={{ ic: STAR_IC, cn: "Free-inspection request", cd: "Qualified · score 92 · target routing", cv: "3h ago" }} /><ConnRow c={{ ic: STAR_IC, cn: "Storm-prep guide download", cd: "Converted · last quarter" }} /></div>
                <div className="conngrp"><div className="cgl">Jobs &amp; outcomes <span className="cgc">2</span></div><ConnRow c={{ ic: TASK_IC, cn: "JOB-2041 — Roof replacement", cd: "Scheduled · Jun 28", cv: "$48,000" }} /><ConnRow c={{ ic: CK_IC, cn: "Roof Replacement", cd: "Outcome · won · paid", cv: "$18,400" }} /></div>
              </div>
              <div className="sec">
                <h3 className="sh">Linked campaigns <span className="wired">wired · attribution</span></h3>
                <ConnRow c={{ ic: CAMP_IC, cn: "Storm Rapid Response", cd: "Email · last-touch attributed · 1 reply", cv: "Active", href: "/campaigns/new" }} />
                <ConnRow c={{ ic: CAMP_IC, cn: "Post-Storm Inspection Webinar", cd: "Landing · registered", cv: "Completed", href: "/campaigns/new" }} />
              </div>
              <div className="sec">
                <h3 className="sh">Channels <span className="wired">wired</span></h3>
                <div className="chan"><span className="chi">{svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')}</span><div style={{ minWidth: 0 }}><div className="cht">linda.powers@gmail.com</div><div className="chd">Primary email · verified</div></div></div>
                <div className="chan"><span className="chi">{svg('<path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>')}</span><div style={{ minWidth: 0 }}><div className="cht">+1 (630) 555-0142</div><div className="chd">Direct line</div></div></div>
                <div className="chan"><span className="chi">{svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>')}</span><div style={{ minWidth: 0 }}><div className="cht">12 Oak Ridge Ct</div><div className="chd">Property address</div></div></div>
              </div>
            </div>
          )}
        </div>

        <aside className="snap">
          <div className="snsec">
            <h3 className="snh">At a glance</h3>
            <div className="glance">
              {[["Persona", "Storm-damage homeowner"], ["Confidence", "86%", "est"], ["Stage", "Evaluation", "est"], ["Urgency", "High", "est"], ["Owner", "Riley"], ["Created", "May 2, 2026"], ["Org", "Restoration workspace"]].map((g) => (
                <div className="gl" key={g[0]}><span className="gk">{g[0]}</span><span className="gv" style={g[0] === "Urgency" ? { color: "var(--warn-text)" } : undefined}>{g[1]}{g[2] && <span className="est">{g[2]}</span>}</span></div>
              ))}
            </div>
          </div>
          <div className="snsec">
            <h3 className="snh">Channels</h3>
            <div className="chan"><span className="chi">{svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')}</span><div style={{ minWidth: 0 }}><div className="cht">linda.powers@gmail.com</div><div className="chd">Primary email</div></div></div>
            <div className="chan"><span className="chi">{svg('<path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>')}</span><div style={{ minWidth: 0 }}><div className="cht">+1 (630) 555-0142</div><div className="chd">Direct line</div></div></div>
          </div>
          <div className="snsec">
            <h3 className="snh">Arc activity</h3>
            {[["9:42 AM", "flagged fresh hail damage in the storm zone."], ["Jun 24", "enriched HOA + property details."], ["Jun 20", "classified persona as Storm-damage homeowner."]].map((a) => (
              <div className="arcrun" key={a[0]}><span className="at">{a[0]}</span><span className="ad"><b>Arc</b> {a[1]}</span></div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
