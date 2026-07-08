"use client";

import Link from "next/link";
import { useState } from "react";

const HOUSE = '<svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4654"/><stop offset="1" stop-color="#27303a"/></linearGradient></defs><rect width="600" height="300" fill="url(#sky)"/><path d="M0 210 L150 120 L300 200 L450 110 L600 190 V300 H0 Z" fill="#2b343d"/><path d="M120 230 L300 130 L480 230 Z" fill="#4a5663"/><path d="M120 230 L300 130 L300 250 L120 250 Z" fill="#3d4854"/><rect x="180" y="230" width="240" height="70" fill="#323b45"/><rect x="210" y="248" width="34" height="34" fill="#566270"/><rect x="356" y="248" width="34" height="34" fill="#566270"/><rect x="288" y="248" width="24" height="52" fill="#475360"/></svg>';
const SC: Record<string, string> = {
  roof: HOUSE,
  ai: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3052"/><stop offset="1" stop-color="#1c2230"/></linearGradient></defs><rect width="100" height="100" fill="url(#bga)"/><circle cx="50" cy="40" r="17" fill="#5a4d7a" opacity=".92"/><path d="M22 92c0-15 12-22 28-22s28 7 28 22" fill="#473c66"/></svg>',
  video: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="100" height="100" fill="#222a30"/><path d="M0 70 L40 50 L70 64 L100 44 V100 H0 Z" fill="#2e3a42"/><path d="M30 68 L72 44 L72 82 L30 82 Z" fill="#3e4c56"/></svg>',
  comp: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bgc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c333b"/><stop offset="1" stop-color="#191e24"/></linearGradient></defs><rect width="100" height="100" fill="url(#bgc)"/><rect x="18" y="38" width="64" height="24" rx="3" fill="rgba(200,162,74,.16)" stroke="rgba(200,162,74,.45)"/><rect x="26" y="45" width="32" height="3.5" rx="1.7" fill="#c8a24a"/><rect x="26" y="52" width="46" height="2.5" rx="1.25" fill="#8d8d8d"/></svg>',
  beforeafter: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="50" height="100" fill="#34302a"/><rect x="50" width="50" height="100" fill="#2a3b34"/><path d="M8 72 L25 56 L42 72 Z" fill="#4a443a"/><path d="M58 72 L75 56 L92 72 Z" fill="#3e5a4c"/><rect x="49" width="2" height="100" fill="rgba(255,255,255,.22)"/></svg>',
  ai2: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bgd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4452"/><stop offset="1" stop-color="#222a32"/></linearGradient></defs><rect width="100" height="100" fill="url(#bgd)"/><path d="M0 64 L30 48 L55 60 L80 44 L100 54 V100 H0 Z" fill="#2c3640"/><circle cx="78" cy="24" r="10" fill="rgba(200,162,74,.3)"/></svg>',
};
const IMGIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l5-5 4 3 3-3 3 3"/></svg>';
const VIDIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>';
const CK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12l5 5 11-11"/></svg>';

const fact = (l: string, v: string) => `<div class="fact"><div class="fl">${l}</div><div class="fv">${v}</div></div>`;
function strip(state: string, name: string, meta?: string) {
  if (state === "ok") return `<div class="papprove ok"><span class="picon">${CK}</span><div class="pinfo"><div class="pt">${name} — approved</div><div class="pm">Approved by Riley · 2h ago · ready to launch</div></div><div class="pa-acts"><span class="undo" data-soon="Undo is coming soon">Undo</span></div></div>`;
  return `<div class="papprove pend"><span class="picon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></span><div class="pinfo"><div class="pt">${name} — needs your review</div><div class="pm">${meta}</div></div><div class="pa-acts"><span class="sbtn" data-soon="Requesting a revision is coming soon">Request revision</span><span class="sbtn go" data-soon="Approving this piece is coming soon">Approve this piece</span></div></div>`;
}
const ASSET: [string, string, string, string, string, string, string, string][] = [
  ["image", SC.roof, "real", "Real media", "16:9", "From Library", "app", "Approved"],
  ["image", SC.ai, "ai", "AI-generated", "4:5", "Higgsfield", "draft", "Draft"],
  ["video", SC.video, "ai", "AI video", "9:16 · MP4", "Higgsfield", "rev", "Needs revision"],
  ["image", SC.comp, "comp", "Composite", "1:1", "Logo + offer", "app", "Approved"],
  ["image", SC.beforeafter, "real", "Real media", "1:1", "Before / after", "app", "Approved"],
  ["image", SC.ai2, "ai", "AI-generated", "16:9", "Higgsfield", "draft", "Draft"],
];
function acard(a: (typeof ASSET)[number]) {
  const play = a[0] === "video" ? '<div class="pbtn"><span><svg viewBox="0 0 24 24"><polygon points="8 6 18 12 8 18"/></svg></span></div>' : "";
  const ic = a[0] === "video" ? VIDIC : IMGIC, sc = a[6] === "app" ? "appr" : a[6] === "rev" ? "rev" : "draft";
  return `<div class="acard"><div class="thmb">${a[1]}<span class="ttl">${ic}${a[0] === "video" ? "Video" : "Image"}</span><span class="fmt">${a[4]}</span>${play}<span class="prov ${a[2]}">${a[3]}</span><div class="ahover"><span class="hb go" data-soon="Approving this asset is coming soon">Approve</span><span class="hb" data-soon="Replacing this asset is coming soon">Replace</span></div></div><div class="ameta"><span class="asrc">${a[5]}</span><span class="astat ${sc}">${a[7]}</span></div></div>`;
}
const PFICON: Record<string, string> = {
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/></svg>',
  fb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M14.6 8.4H13.2c-.7 0-1.1.4-1.1 1.1V11h2.4l-.35 2.2H12.1V19"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg>',
  li: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 11v6M8 7.7v.3M12 17v-3.4a2 2 0 0 1 4 0V17"/></svg>',
  tt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 5v9.2a3.4 3.4 0 1 1-2.6-3.3"/><path d="M13 5.2a4.2 4.2 0 0 0 4 4"/></svg>',
};
type Plat = { ic: string; nm: string; pl: string; st: string; stl: string; thumb: string; tw: number; ar: string; ph: string; cap: string; chars: string; fmt: string[]; vid?: boolean };
const PLAT: Plat[] = [
  { ic: "ig", nm: "Instagram", pl: "Feed + Story / Reel", st: "rdy", stl: "Ready", thumb: SC.ai, tw: 96, ar: "4:5", ph: "Caption", cap: "Spring's here ☀️ Is your roof ready? Book a FREE assessment this week — winter damage, honest quote, same-week scheduling. Link in bio. #RoofRestoration #Naperville", chars: "178 / 2,200", fmt: ["4:5 Feed", "9:16 Story"] },
  { ic: "fb", nm: "Facebook", pl: "Feed + Reels", st: "rdy", stl: "Ready", thumb: SC.comp, tw: 120, ar: "1:1", ph: "Primary text", cap: "Winter's tough on roofs. Get a free, no-obligation spring inspection from the team trusted by 1,200+ local homeowners — same-week scheduling + insurance-claim support.", chars: "166 / 2,200", fmt: ["1:1 Feed", "9:16 Reel"] },
  { ic: "x", nm: "X", pl: "Post", st: "drf", stl: "Draft", thumb: SC.roof, tw: 178, ar: "16:9", ph: "Post", cap: "Spring roof-check season is here 🌤️ Free, no-obligation assessment for Naperville homeowners — winter damage, honest quote, same-week scheduling → [link]", chars: "151 / 280", fmt: ["16:9"] },
  { ic: "li", nm: "LinkedIn", pl: "Feed", st: "drf", stl: "Draft", thumb: SC.beforeafter, tw: 144, ar: "1.2:1", ph: "Post", cap: "After a hard winter, a proactive roof assessment protects one of your biggest assets. We're offering complimentary spring inspections for Naperville-area homeowners.", chars: "212 / 3,000", fmt: ["1.2:1"] },
  { ic: "tt", nm: "TikTok", pl: "Video", st: "need", stl: "Needs media", thumb: SC.video, tw: 68, ar: "9:16", ph: "Caption", cap: "POV: your roof made it through winter 👀 Get a free spring check before the rush. #fyp #homeowner #roofing", chars: "104 / 2,200", fmt: ["9:16 · MP4"], vid: true },
];
function pfcard(p: Plat) {
  const play = p.vid ? '<div style="position:absolute;inset:0;display:grid;place-items:center"><span style="width:30px;height:30px;border-radius:50%;background:rgba(16,16,19,.62);border:1px solid var(--line-3);display:grid;place-items:center"><svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:var(--text)"><polygon points="8 6 18 12 8 18"/></svg></span></div>' : "";
  return `<div class="pfcard"><div class="pfhead"><span class="pfic">${PFICON[p.ic]}</span><div><div class="pfnm">${p.nm}</div><div class="pfpl">${p.pl}</div></div><span class="pfst ${p.st}">${p.stl}</span></div><div class="pfbody"><div class="pfthumb" style="width:${p.tw}px">${p.thumb}${play}<span class="ar">${p.ar}</span></div><div class="pfcap"><div class="ph">${p.ph}</div>${p.cap}<div class="pfchars">${p.chars}</div></div></div><div class="pffoot">${p.fmt.map((f) => `<span class="pffmt">${f}</span>`).join("")}<div class="pfact"><span class="pfb" data-soon="Regenerating is coming soon">Regenerate</span><span class="pfb go" data-soon="Approving this variant is coming soon">Approve</span></div></div></div>`;
}

function tabHtml(t: string, brand: string): string {
  switch (t) {
    case "brief":
      return `<div class="briefwrap"><div class="srccall"><span class="si">✦</span><span class="st">Generated by Arc from the <b>Naperville hailstorm</b> opportunity · 94% confidence</span><span class="sa" data-soon="Opening the source opportunity is coming soon">View opportunity →</span></div><div class="brieftri">${fact("Objective", "Re-engage past roofing customers heading into spring with a free-assessment offer.")}${fact("Why now", "Spring is peak roof-inspection season; Q4 leads show high intent in your service area.")}${fact("Offer", "Free, no-obligation spring roof assessment + quote, with same-week scheduling.")}${fact("Audience", "~1,200 past customers · homeowners 35–55 · suburban.")}${fact("Channels", "Email + SMS, with an optional paid-social retarget.")}${fact("Success metric", "Booked assessments + reply rate vs. the Aug storm benchmark.")}</div><div class="briefcols"><div class="rationale" style="margin-top:0"><div class="rl"><span style="color:var(--accent)">✦</span> Arc's rationale</div><p>Past customers convert far better than cold prospects after a weather event, and a value-led “free assessment” frame beats a discount for this persona — your August storm-response campaign booked 31 jobs on the same approach. I scoped the audience to your service ZIPs, suppressed active jobs and opt-outs, and pulled the proof imagery from your approved Library.</p></div><div class="evbox"><div class="ebl"><span style="color:var(--accent)">✦</span> Why Arc proposed this</div><div class="ev2"><span class="n">1</span><div><div class="es">NOAA Report (Oct 27)</div><div class="ed">Confirmed 1.5″ hail across 4 service ZIP codes</div></div></div><div class="ev2"><span class="n">2</span><div><div class="es">Local News Coverage</div><div class="ed">WGN reported roof damage in Naperville overnight</div></div></div><div class="ev2"><span class="n">3</span><div><div class="es">Insurance Claims Data</div><div class="ed">Roof-claim filings up 3× week-over-week</div></div></div><div class="evconf"><span class="ecl">Opportunity confidence</span><span class="ect"><span class="ecf" style="width:94%"></span></span><span class="ecv">94%</span></div></div></div><div style="margin-top:20px"><div class="seclab">Timeline</div><div class="stages"><span class="stg done"><span class="sd"></span><span class="sl">Detected</span><span class="sdate">Oct 27</span></span><span class="arr">→</span><span class="stg done"><span class="sd"></span><span class="sl">Drafted by Arc</span><span class="sdate">Oct 28</span></span><span class="arr">→</span><span class="stg now"><span class="sd"></span><span class="sl">In review</span><span class="sdate">now</span></span><span class="arr">→</span><span class="stg todo"><span class="sd"></span><span class="sl">Scheduled</span></span><span class="arr">→</span><span class="stg todo"><span class="sd"></span><span class="sl">Live</span></span></div></div></div>`;
    case "audience":
      return `<div class="briefwrap"><div class="brieftri">${fact("Segment", "Homeowners, 35–55, suburban — prior customers within 24 months.")}${fact("Primary persona", "Storm-damage homeowner · from your persona library.")}${fact("Channels", "Email + SMS, with an optional paid-social retarget.")}${fact("Estimated size", '~1,200 contacts after suppression. <span style="color:var(--muted)">(Arc estimate)</span>')}${fact("Lookalike", "Modeled on Q4 booked-job leads — your highest-LTV cohort.")}${fact("Excluded", "Active jobs · do-not-contact · opted-out.")}</div><div class="seclab">Estimated reach by channel <span style="color:var(--muted);font-weight:400;letter-spacing:0">· Arc estimate</span></div><div class="reachrow"><div class="reachcell"><div class="rcl">Email</div><div class="rcv">1,200</div></div><div class="reachcell"><div class="rcl">SMS · opted-in</div><div class="rcv">980</div></div><div class="reachcell"><div class="rcl">Paid retarget</div><div class="rcv">1,200</div></div></div><div class="briefcols"><div class="rationale" style="margin-top:0"><div class="rl"><span style="color:var(--accent)">✦</span> How Arc built this audience</div><p>Started from past customers in your service ZIPs, modeled a lookalike on your Q4 booked jobs, then suppressed anyone with an active job or an opt-out. The reachable audience is roughly 1,200, with about 980 reachable by SMS.</p></div><div class="evbox"><div class="ebl">Suppression applied</div><div class="ev2"><span class="n">−</span><div><div class="es">Active jobs</div><div class="ed">Already engaged — not re-contacted</div></div></div><div class="ev2"><span class="n">−</span><div><div class="es">Do-not-contact</div><div class="ed">Honored from your CRM flags</div></div></div><div class="ev2"><span class="n">−</span><div><div class="es">Opted-out</div><div class="ed">Unsubscribes &amp; STOP replies excluded</div></div></div></div></div></div>`;
    case "email":
      return strip("ok", "Email") + `<div class="reader"><div class="subjrow"><span class="sl">SUBJECT</span><span class="sv">Is your roof ready for spring? Get a free restoration quote.</span></div><div class="ebody"><p>Hi <b>[First name]</b>,</p><p>Spring is the perfect time to make sure your roof came through winter in good shape. Right now we're offering a <b>free, no-obligation spring assessment</b> for past customers like you.</p><div class="media">${HOUSE}<span class="mbadge"><i></i>Real media · from your Library</span></div><p style="margin-top:14px">We'll inspect for winter damage, share clear photos, and give you an honest quote — with same-week scheduling and insurance-claim support.</p></div></div>`;
    case "sms":
      return strip("ok", "SMS") + `<div class="reader"><div class="adcard"><div class="ap">Hi <b>[First name]</b> — it's roof-check season! Book your <b>FREE</b> spring assessment with ${brand} this week 👉 [link]. Reply STOP to opt out.</div><div style="font-size:11px;color:var(--muted);margin-top:12px">160 characters · 1 SMS segment · opt-out included</div></div></div>`;
    case "ad":
      return strip("pend", "Ad copy", "Drafted by Arc · paid-social · ~38 words") + `<div class="reader"><div class="adcard"><div class="ah">Spring roof restoration — book a free assessment</div><div class="ap">Winter's tough on roofs. Get a free, no-obligation spring inspection from the team trusted by 1,200+ local homeowners — with same-week scheduling.</div><div class="ac">Get my free quote</div></div></div>`;
    case "landing":
      return strip("ok", "Landing page") + `<div class="reader"><div class="adcard"><div class="ah">Your roof deserves a fresh start this spring.</div><div class="ap">Free assessment · same-week scheduling · insurance-claim support. We've restored 1,200+ local roofs.</div><div class="factgrid" style="margin-top:16px"><div class="fact"><div class="fv">✓ Full winter-damage inspection with photos</div></div><div class="fact"><div class="fv">✓ Honest, itemized quote — no pressure</div></div><div class="fact"><div class="fv">✓ Direct insurance-claim assistance</div></div><div class="fact"><div class="fv">✓ Workmanship warranty on every job</div></div></div></div></div>`;
    case "platforms":
      return `<div class="pfnote"><span class="lk">✦</span><div>Arc packages this campaign for each platform's exact format and copy length. Publishing needs a connected account (Meta, X, …) and stays <b>locked until you approve</b> — nothing posts on its own.</div></div><div class="pfgrid">${PLAT.map(pfcard).join("")}</div>`;
    case "media":
      return `<div class="mtoolbar"><span class="mc">6 assets · 1 needs review</span><span class="fchip on">All</span><span class="fchip">Images</span><span class="fchip">Video</span><span class="fchip">Real</span><span class="fchip">AI</span><div class="acts"><span class="mbtn gold" data-soon="Generating media with Arc is coming soon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>Generate with Arc</span><span class="mbtn" data-soon="Adding from Library is coming soon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h6l2 2h8v10H4z"/></svg>Add from Library</span></div></div><div class="mgrid">${ASSET.map(acard).join("")}</div>`;
    default:
      return "";
  }
}

const TABLIST: [string, string, string?, string?][] = [["brief", "Brief"], ["audience", "Audience"], ["email", "Email", "ok"], ["sms", "SMS", "ok"], ["ad", "Ad copy", "pend"], ["landing", "Landing page", "ok"], ["platforms", "Platforms", "pend"], ["media", "Media", "pend", "6"]];
const PIECE_TAB: Record<string, string> = { email: "email", sms: "sms", "ad copy": "ad", "landing page": "landing", media: "media" };

export function BuilderView({ brandName }: { brandName: string }) {
  const [tab, setTab] = useState("email");

  return (
    <div className="arc-builder">
      <section className="center">
        <div className="chead">
          <div className="backrow"><Link className="back" href="/campaigns"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></Link><h1 className="ctitle">Roof Restoration — Spring Reactivation</h1><span className="spill">In review</span></div>
          <div className="csub">Drafted by Arc from the Naperville hailstorm opportunity · review each piece, then deploy</div>
          <div className="tabs">
            {TABLIST.map((t) => (
              <span key={t[0]} className={`tab${tab === t[0] ? " on" : ""}`} onClick={() => setTab(t[0])}>
                {t[2] && <span className={`dot ${t[2] === "ok" ? "ok" : "pend"}`} />}{t[1]}{t[3] && <span className="b">{t[3]}</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="tabbody"><div key={tab} className="fade" dangerouslySetInnerHTML={{ __html: tabHtml(tab, brandName) }} /></div>
        <div className="deploybar">
          <div className="prog"><span className="pl"><b>3</b> of 5 pieces approved · 2 still need you</span><span className="pbar"><i style={{ width: "60%" }} /></span></div>
          <div className="dacts">
            <span className="lockd"><svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>Outbound stays locked until you launch</span>
            <button className="btn ghost" data-soon="Scheduling is coming soon">Schedule…</button>
            <button className="btn locked"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Deploy — 2 pieces left</button>
          </div>
        </div>
      </section>

      <aside className="pkgrail">
        <div className="rcard">
          <h3 className="rhh">Approval progress</h3>
          <div className="apline"><span className="big">3/5</span><span className="sm">pieces approved</span></div>
          {[["ok", "Email", "Approved", ""], ["ok", "SMS", "Approved", ""], ["pend", "Ad copy", "Needs you", "pendp"], ["ok", "Landing page", "Approved", ""], ["pend", "Media", "4 / 6 approved", "pendp"]].map((p) => (
            <div key={p[1]} className={`piece ${p[3]}`} onClick={() => { const t = PIECE_TAB[p[1].toLowerCase()]; if (t) setTab(t); }}>
              <span className={`pd ${p[0]}`} /><span className="pn">{p[1]}</span><span className="pr">{p[2]}</span>
            </div>
          ))}
        </div>
        <div className="rcard">
          <h3 className="rhh">Launch readiness</h3>
          <div className="ready done"><span className="ck" dangerouslySetInnerHTML={{ __html: CK }} /><span className="rt">Guardrails passed</span><span className="rr">3/3</span></div>
          <div className="ready done"><span className="ck" dangerouslySetInnerHTML={{ __html: CK }} /><span className="rt">Audience set</span><span className="rr">1,200</span></div>
          <div className="ready done"><span className="ck" dangerouslySetInnerHTML={{ __html: CK }} /><span className="rt">Brand voice checked</span></div>
          <div className="ready todo"><span className="ck" /><span className="rt">All pieces approved</span><span className="rr">3/5</span></div>
          <div className="schedrow"><span className="schip on">Send now</span><span className="schip">Schedule…</span></div>
          <button className="deploybtn"><svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: "currentColor", fill: "none", strokeWidth: 1.9 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>Deploy — 2 pieces left</button>
        </div>
        <div className="rcard">
          <h3 className="rhh">Target audience</h3>
          <div className="achips"><span className="ach">Homeowners</span><span className="ach">35–55</span><span className="ach">Suburban</span><span className="ach">Past customers</span></div>
          <div className="lookal"><span style={{ color: "var(--accent)" }}>◎</span> Lookalike · Q4 leads · ~1,200</div>
        </div>
        <div className="rcard">
          <h3 className="rhh">Guardrail check <span className="ok">Passed</span></h3>
          {["Claim risk — none", "Logo usage — within rules", "Privacy — opt-out present"].map((g) => (
            <div className="grow" key={g}><span className="gck" dangerouslySetInnerHTML={{ __html: CK }} /><span className="gt">{g}</span></div>
          ))}
        </div>
      </aside>
    </div>
  );
}
