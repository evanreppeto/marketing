"use client";

import Link from "next/link";
import { useState } from "react";

const HOUSE = '<svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4654"/><stop offset="1" stop-color="#27303a"/></linearGradient></defs><rect width="600" height="300" fill="url(#sky)"/><path d="M0 210 L150 120 L300 200 L450 110 L600 190 V300 H0 Z" fill="#2b343d"/><path d="M120 230 L300 130 L480 230 Z" fill="#4a5663"/><path d="M120 230 L300 130 L300 250 L120 250 Z" fill="#3d4854"/><rect x="180" y="230" width="240" height="70" fill="#323b45"/><rect x="210" y="248" width="34" height="34" fill="#566270"/><rect x="356" y="248" width="34" height="34" fill="#566270"/></svg>';
const SC: Record<string, string> = {
  roof: HOUSE,
  ai: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3052"/><stop offset="1" stop-color="#1c2230"/></linearGradient></defs><rect width="100" height="100" fill="url(#ga)"/><circle cx="50" cy="42" r="20" fill="#5a4d7a"/><path d="M18 92c0-16 14-24 32-24s32 8 32 24" fill="#473c66"/></svg>',
  ai2: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4452"/><stop offset="1" stop-color="#222a32"/></linearGradient></defs><rect width="100" height="100" fill="url(#gd)"/><path d="M0 62 L30 46 L55 58 L80 42 L100 52 V100 H0 Z" fill="#2c3640"/><circle cx="76" cy="24" r="11" fill="rgba(200,162,74,.34)"/></svg>',
  video: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="100" height="100" fill="#222a30"/><path d="M0 70 L40 50 L70 64 L100 44 V100 H0 Z" fill="#2e3a42"/><circle cx="50" cy="46" r="12" fill="rgba(255,255,255,.14)"/><path d="M46 40l9 6-9 6z" fill="#fff"/></svg>',
  comp: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c333b"/><stop offset="1" stop-color="#191e24"/></linearGradient></defs><rect width="100" height="100" fill="url(#gc)"/><rect x="20" y="40" width="60" height="20" rx="3" fill="rgba(200,162,74,.18)" stroke="rgba(200,162,74,.5)"/></svg>',
  beforeafter: '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="50" height="100" fill="#34302a"/><rect x="50" width="50" height="100" fill="#2a3b34"/><path d="M8 72 L25 56 L42 72 Z" fill="#4a443a"/><path d="M58 72 L75 56 L92 72 Z" fill="#3e5a4c"/><rect x="48" width="4" height="100" fill="rgba(200,162,74,.5)"/></svg>',
};
type Prov = "real" | "ai" | "comp" | "upload" | "stock";
type Item = { s: string; l: string; p: Prov };
const PVLABEL: Record<Prov, string> = { real: "Real media", ai: "AI-generated", comp: "Composite", upload: "Imported", stock: "Stock" };
const SRC: Record<string, { title: string; items: Item[] }> = {
  library: { title: "Approved media", items: [{ s: SC.roof, l: "Roof — exterior", p: "real" }, { s: SC.beforeafter, l: "Before / after", p: "real" }, { s: SC.roof, l: "Crew on site", p: "real" }, { s: SC.comp, l: "Logo lockup", p: "comp" }] },
  ai: { title: "Generated this session", items: [{ s: SC.ai, l: "AI hero", p: "ai" }, { s: SC.ai2, l: "AI · seasonal", p: "ai" }, { s: SC.video, l: "AI video still", p: "ai" }] },
  uploads: { title: "Imported", items: [{ s: SC.ai2, l: "midjourney_03.png", p: "upload" }, { s: SC.comp, l: "canva_export.png", p: "upload" }] },
  stock: { title: "Stock", items: [{ s: SC.roof, l: "Stock · house", p: "stock" }, { s: SC.beforeafter, l: "Stock · street", p: "stock" }] },
};
function provShort(p: Prov) { return p === "real" ? "Real" : p === "ai" ? "AI" : p === "upload" ? "Imported" : p === "comp" ? "Composite" : "Stock"; }

const Raw = ({ html }: { html: string }) => <span style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: html }} />;

const TOOLS = {
  compose: [
    { t: "overlay", target: "design", label: "Brand overlay", d: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 15l4-3 3 2 4-3 5 4"/>' },
    { t: "text", target: "design", label: "Text", d: '<path d="M5 7h14M5 7V5h14v2M12 7v12M9 19h6"/>' },
    { t: "recolor", target: "design", label: "Recolor", d: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="9" cy="15" r="1.3"/>' },
  ],
  generate: [
    { t: "genimg", target: "arc", label: "Image", ai: true, d: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z"/>' },
    { t: "genvid", target: "arc", label: "Video", ai: true, d: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2"/>' },
    { t: "vary", target: "arc", label: "Variations", ai: true, d: '<rect x="4" y="4" width="11" height="11" rx="2"/><path d="M9 20h9a2 2 0 002-2V9"/>' },
  ],
  edit: [
    { t: "reframe", target: "arc", label: "Reframe", ai: true, d: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M9 6v12"/>' },
    { t: "expand", target: "arc", label: "Expand", ai: true, d: '<path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/>' },
    { t: "cutout", target: "arc", label: "Cut-out", ai: true, d: '<path d="M5 5l14 14M9 5a4 4 0 014 4M5 9a4 4 0 004 4"/><rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/>' },
    { t: "upscale", target: "arc", label: "Upscale", ai: true, d: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' },
    { t: "animate", target: "arc", label: "Animate", ai: true, d: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>' },
  ],
  check: [
    { t: "virality", target: "design", label: "Virality", d: '<path d="M3 17l5-5 4 3 5-7 4 4"/><circle cx="8" cy="12" r="1"/>' },
    { t: "guardrails", target: "design", label: "Guardrails", d: '<path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z"/><path d="M9 12l2 2 4-4"/>' },
  ],
} as const;

const FORMATS = [
  { ar: "1 / 1", dim: "1080 × 1080", label: "Square", r: "1:1" },
  { ar: "4 / 5", dim: "1080 × 1350", label: "Portrait", r: "4:5" },
  { ar: "9 / 16", dim: "1080 × 1920", label: "Story", r: "9:16" },
  { ar: "16 / 9", dim: "1920 × 1080", label: "Landscape", r: "16:9" },
];
const SWATCHES = ["#c8a24a", "#7fb89a", "#5b8fd6", "#cc6666", "#f1ede2"];
const SESSION: { id: string; tag: string; item: Item }[] = [
  { id: "v0", tag: "Current", item: { s: SC.roof, l: "Roof — exterior", p: "real" } },
  { id: "v1", tag: "v2", item: { s: SC.ai, l: "Variation 2", p: "ai" } },
  { id: "v2", tag: "v3", item: { s: SC.ai2, l: "Variation 3", p: "ai" } },
  { id: "v3", tag: "9:16", item: { s: SC.beforeafter, l: "Before/After 9:16", p: "comp" } },
  { id: "v4", tag: "9:16", item: { s: SC.video, l: "Crew 9:16", p: "real" } },
];

export function StudioView({ brandName }: { brandName: string }) {
  const initial = "Storm season";
  const [srcTab, setSrcTab] = useState("library");
  const [bg, setBg] = useState<Item>(SRC.library.items[0]);
  const [selTile, setSelTile] = useState(-1);
  const [selSession, setSelSession] = useState("v0");
  const [fmt, setFmt] = useState(0);
  const [mode, setMode] = useState<"image" | "video">("image");
  const [accent, setAccent] = useState("#c8a24a");
  const [kicker, setKicker] = useState(initial);
  const [headline, setHeadline] = useState("Your roof, ready before the next storm.");
  const [sub, setSub] = useState("Free assessment · same-week scheduling");
  const [cta, setCta] = useState("Get my free quote");
  const [safe, setSafe] = useState(false);
  const [tab, setTab] = useState<"design" | "arc">("design");
  const [tool, setTool] = useState("overlay");
  const [traceOpen, setTraceOpen] = useState(false);
  const [tmpl, setTmpl] = useState(0);
  const [cmode, setCmode] = useState("Draft");

  const pickTool = (t: (typeof TOOLS)[keyof typeof TOOLS][number]) => {
    setTool(t.t);
    setTab(t.target === "arc" ? "arc" : "design");
  };
  const logoInitial = (brandName || "S").trim().charAt(0).toUpperCase();

  const Tile = ({ item, i }: { item: Item; i: number }) => (
    <div className={`mtile${selTile === i ? " on" : ""}`} onClick={() => { setSelTile(i); setBg(item); }}>
      <div className="mt"><Raw html={item.s} /><span className={`pv ${item.p}`}>{PVLABEL[item.p]}</span></div>
      <div className="ml">{item.l}</div>
    </div>
  );

  return (
    <div className="arc-studio">
      <div className="studiobar">
        <div className="cxt" title="Pick the campaign this asset belongs to">
          <span className="ci"><svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg></span>
          <div><div className="cl">Campaign</div><div className="cn">Storm-Season Reactivation</div><div className="cmeta">social_ad · attaches on approve</div></div>
          <span className="cv">▾</span>
        </div>
        <span className="proj"><span className="dot" />Untitled creative · autosaved</span>
        <div className="right">
          <button className="iconbtn" title="Undo"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></svg></button>
          <button className="iconbtn" title="Redo"><svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 000 10h3" /></svg></button>
          <span className="cdivr" />
          <a className="gbtn" href="/library"><svg viewBox="0 0 24 24"><path d="M4 7h6l2 2h8v10H4z" /></svg>Save to Library</a>
          <Link className="gbtn gold" href="/campaigns/new"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Add to campaign</Link>
        </div>
      </div>

      <div className="studio">
        {/* SOURCES */}
        <aside className="sources">
          <div className="seyl">Sources</div>
          <div className="stabs">
            {["library", "ai", "uploads", "stock"].map((s) => (
              <span key={s} className={`stab${srcTab === s ? " on" : ""}`} onClick={() => { setSrcTab(s); setSelTile(-1); }}>
                {s === "ai" ? "AI" : s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>
          <div className="drop"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></svg><div className="dt">Upload or import a URL</div><div className="dd">Bring in art from Canva, Midjourney, DALL·E — anything</div></div>
          <div className="srchead"><span className="st">{SRC[srcTab].title}</span><span className="sc">{SRC[srcTab].items.length} items</span></div>
          <div className="mgrid2">{SRC[srcTab].items.map((it, i) => <Tile key={i} item={it} i={i} />)}</div>
          {srcTab === "ai" && (
            <div className="enginenote"><b>AI generation runs on Higgsfield.</b> Image, video, reframe, upscale, cut-out &amp; motion all come from the connected engine.<span className="ed"><i />Connector off — enable in Settings → Connectors</span></div>
          )}
          <div className="legend">
            <span className="lg pv real">Real media</span><span className="lg pv comp">Composite</span><span className="lg pv ai">AI-generated</span><span className="lg pv upload">Imported</span><span className="lg pv stock">Stock</span>
          </div>
        </aside>

        {/* STAGE */}
        <section className="stage">
          <div className="toolbar">
            {(["compose", "generate", "edit", "check"] as const).map((grp, gi) => (
              <div key={grp} style={{ display: "contents" }}>
                {gi > 0 && <div className="tdiv" />}
                <div className="tgrp">
                  <span className="tglabel">{grp.charAt(0).toUpperCase() + grp.slice(1)}</span>
                  {TOOLS[grp].map((t) => (
                    <div key={t.t} className={`tool${"ai" in t && t.ai ? " ai" : ""}${tool === t.t ? " on" : ""}`} onClick={() => pickTool(t)}>
                      {"ai" in t && t.ai && <span className="tdot" />}
                      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: t.d }} /><span className="tlbl">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="formats">
            <div className="modeseg">
              <span className={mode === "image" ? "on" : ""} onClick={() => setMode("image")}><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-4 4 3 3-2 5 4" /></svg>Image</span>
              <span className={mode === "video" ? "on" : ""} onClick={() => setMode("video")}><svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>Video</span>
            </div>
            <span className="fmdiv" />
            <span className="fl">Format</span>
            {FORMATS.map((f, i) => (
              <span key={f.r} className={`fchip${fmt === i ? " on" : ""}`} onClick={() => setFmt(i)}>{f.label} <span className="fr">{f.r}</span></span>
            ))}
            <span className="fspacer" />
            <span className={`szbtn${safe ? " on" : ""}`} onClick={() => setSafe((s) => !s)}><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 8h16M4 16h16" /></svg>Safe zones</span>
            <span className="zoom">Fit · 100%</span>
          </div>

          <div className="stagewrap">
            <div className="artboard">
              <div className={`canvas${safe ? " szon" : ""}${mode === "video" ? " video" : ""}`} style={{ aspectRatio: FORMATS[fmt].ar }}>
                <div className="cbg"><Raw html={bg.s} /></div>
                <div className="cveil" />
                <div className="cplay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div>
                <div className="clogo"><span className="lm" style={{ background: accent }}>{logoInitial}</span> {brandName}</div>
                <div className="cprov">{PVLABEL[bg.p]}</div>
                <div className="ctext">
                  <div className="ckick" style={{ color: accent === "#f1ede2" ? "#f1ede2" : accent }}>{kicker}</div>
                  <div className="chead">{headline}</div>
                  <div className="csub">{sub}</div>
                  <div className="ccta" style={{ background: accent, color: accent === "#f1ede2" ? "#201808" : "#1a1505" }}>{cta}</div>
                </div>
                <div className="safez"><div className="szb szt"><span className="szl">caption / UI safe area</span></div><div className="szb szbo" /></div>
              </div>
              <div className="cspec">
                <span>Rendered by <b>Arc</b></span><span className="dotsep" />
                <span><b>{FORMATS[fmt].dim}</b> px</span><span className="dotsep" />
                <span>{brandName} brand kit</span><span className="dotsep" />
                <span className="draftpill">Draft · not approved</span>
              </div>
            </div>
          </div>

          {mode === "video" && (
            <div className="vidtl show">
              <span className="pp"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
              <span className="tk"><span className="pl" /><span className="ph" /></span>
              <span className="tm">0:05 / 0:15</span>
              <span className="sl" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>9:16 · MP4</span>
            </div>
          )}

          <div className="strip">
            <span className="sl">This session</span>
            {SESSION.slice(0, 3).map((v) => (
              <span key={v.id} className={`vthumb${selSession === v.id ? " on" : ""}`} onClick={() => { setSelSession(v.id); setBg(v.item); }}><Raw html={v.item.s} /><span className="vtag">{v.tag}</span></span>
            ))}
            <span className="vsdiv" />
            <span className="sl">Drafts · 3 awaiting</span>
            {SESSION.slice(3).map((v) => (
              <span key={v.id} className={`vthumb${selSession === v.id ? " on" : ""}`} onClick={() => { setSelSession(v.id); setBg(v.item); }}><Raw html={v.item.s} /><span className="vtag">{v.tag}</span></span>
            ))}
            <button className="vgen" onClick={() => setTab("arc")}><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" /></svg>Ask Arc for variations</button>
          </div>
        </section>

        {/* INSPECTOR */}
        <aside className="insp">
          <div className="itabs">
            <div className={`itab${tab === "design" ? " on" : ""}`} onClick={() => setTab("design")}><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11" /></svg>Design</div>
            <div className={`itab${tab === "arc" ? " on" : ""}`} onClick={() => setTab("arc")}><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z" /></svg>Arc<span className="ibadge">copilot</span></div>
          </div>

          {tab === "design" ? (
            <div className="ipane">
              <div className="dwrap">
                <div className="brief">
                  <div className="bh"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>Campaign context</div>
                  <div className="bn">Storm-Season Reactivation</div>
                  <div className="bmeta">social_ad → pending approval on add</div>
                  <div className="brow"><b>Angle:</b> Act before the next storm — protect the home you&rsquo;ve already invested in.</div>
                  <div className="bchips"><span className="bchip per">Homeowners · storm-exposed</span><span className="bchip">Proof: before/after</span><span className="bchip">Proof: 4.9★ reviews</span><span className="bchip">Same-week scheduling</span></div>
                </div>

                <div className="psec">
                  <h3 className="ph2">Layers</h3>
                  <div className="layer sel"><span className="li"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 15l4-3 3 2 4-3 5 4" /></svg></span><div style={{ minWidth: 0 }}><div className="lt">Background</div><div className="ld">{bg.l} · {provShort(bg.p)}</div></div><span className="eye">◉</span></div>
                  {[["Kicker", kicker], ["Headline", headline], ["CTA button", cta], ["Logo", brandName]].map(([lt, ld]) => (
                    <div className="layer" key={lt}><span className="li"><svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h9" /></svg></span><div style={{ minWidth: 0 }}><div className="lt">{lt}</div><div className="ld">{ld}</div></div><span className="eye">◉</span></div>
                  ))}
                </div>

                <div className="psec">
                  <h3 className="ph2">Edit copy</h3>
                  <div className="fieldl"><span>Kicker</span><span>eyebrow</span></div><input className="input" value={kicker} onChange={(e) => setKicker(e.target.value)} />
                  <div className="field"><div className="fieldl"><span>Headline</span></div><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
                  <div className="field"><div className="fieldl"><span>Subhead</span></div><input className="input" value={sub} onChange={(e) => setSub(e.target.value)} /></div>
                  <div className="field"><div className="fieldl"><span>CTA</span></div><input className="input" value={cta} onChange={(e) => setCta(e.target.value)} /></div>
                </div>

                <div className="psec">
                  <h3 className="ph2">Brand color</h3>
                  <div className="swatches">{SWATCHES.map((c) => <span key={c} className={`sw${accent === c ? " on" : ""}`} style={{ background: c }} onClick={() => setAccent(c)} />)}</div>
                  <div className="swnote">Pulled from your Brand kit palette · used by the renderer for accents + CTA.</div>
                </div>

                <div className="psec">
                  <h3 className="ph2">Template</h3>
                  <div className="tmpl">
                    {[{ n: "Bold", bg: "linear-gradient(135deg,#2a2118,#16161a)", c: "#ecd596", fs: 13, fst: "normal", ff: "var(--serif)" }, { n: "Editorial", bg: "linear-gradient(135deg,#22222a,#16161a)", c: "#f1ede2", fs: 13, fst: "italic", ff: "var(--serif)" }, { n: "Minimal", bg: "#1b1b20", c: "#b9b9c0", fs: 12, fst: "normal", ff: "inherit" }].map((tm, i) => (
                      <div key={tm.n} className={`tmplc${tmpl === i ? " on" : ""}`} onClick={() => setTmpl(i)}><div className="tmi" style={{ background: tm.bg }}><span style={{ fontFamily: tm.ff, color: tm.c, fontSize: tm.fs, fontStyle: tm.fst, fontWeight: 600 }}>Aa</span></div><div className="tmn">{tm.n}</div></div>
                    ))}
                  </div>
                </div>

                {mode === "video" && (
                  <div className="psec">
                    <h3 className="ph2">Audio <span className="tagv">Higgsfield · video</span></h3>
                    {[["Voiceover", "Generate or dub a narration track", "Add →"], ["Music bed", "On-brand background track", "Add →"], ["Captions", "Auto-burned subtitles", "On"]].map(([an, ad, ax]) => (
                      <div className="audrow" key={an}><span className="ai"><svg viewBox="0 0 24 24"><path d="M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4" /></svg></span><div><div className="an">{an}</div><div className="ad">{ad}</div></div><span className="ax">{ax}</span></div>
                    ))}
                  </div>
                )}

                <div className="psec">
                  <h3 className="ph2">Guardrails</h3>
                  <div className="grow"><span className="gic ok"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg></span><div><div className="gt">Brand logo present &amp; legible</div><div className="gd">{brandName} lockup detected, on-brand placement.</div></div></div>
                  <div className="grow"><span className="gic ok"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg></span><div><div className="gt">Real, approved media</div><div className="gd">Background is an approved Library photo — not stock or invented.</div></div></div>
                  <div className="grow"><span className="gic warn"><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" /></svg></span><div><div className="gt">Claim check: &ldquo;same-week scheduling&rdquo;</div><div className="gd">Needs a proof point on file before send. <span className="fix">Attach proof →</span></div></div></div>
                  <div className="grow"><span className="gic ok"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg></span><div><div className="gt">No faces requiring redaction</div><div className="gd">Privacy scan clear.</div></div></div>
                </div>

                <div className="psec">
                  <h3 className="ph2">Virality <span className="tagv">Higgsfield · video</span></h3>
                  <div className="score">
                    {[["Hook (0–3s)", 78], ["Sustain", 64], ["Viral pot.", 71]].map(([sn, v]) => (
                      <div className="srow" key={sn}><span className="sn">{sn}</span><span className="sbar"><span className="sfill" style={{ width: `${v}%` }} /></span><span className="sv">{v}</span></div>
                    ))}
                    <div className="scapt"><b>Video only.</b> Scores come from Higgsfield&rsquo;s virality predictor on the rendered clip. This still image uses a fit proxy instead:</div>
                    <div className="imgproxy"><span className="pxchip">Format matches channel ✓</span><span className="pxchip">Brand present ✓</span><span className="pxchip">{FORMATS[fmt].dim}</span></div>
                  </div>
                </div>

                <div className="psec">
                  <h3 className="ph2">Export</h3>
                  <div className="exrow"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.6" /></svg>Resize for all platforms <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>1:1 4:5 9:16 16:9</span></div>
                  <a className="exrow" href="/library"><svg viewBox="0 0 24 24"><path d="M4 7h6l2 2h8v10H4z" /></svg>Save to Library</a>
                  <Link className="exrow gold" href="/campaigns/new"><svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>Add to Storm-Season Reactivation</Link>
                  <div className="exrow"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>Download (PNG / MP4)</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ipane">
              <div className="arc">
                <div className="archead"><span className="am">A</span><div><div className="at">Arc · Creative copilot</div><div className="ad"><i />Working in Storm-Season Reactivation</div></div></div>
                <div className="arcscroll">
                  <div className="amsg op"><div className="bub">Make a 9:16 version for Reels — try the real before/after photo as the hero.</div></div>
                  <div className="amsg ar">
                    <div className="who"><b>Arc</b> · drafted 3 options</div>
                    <div className={`trace${traceOpen ? " open" : ""}`}>
                      <div className="tracehd" onClick={() => setTraceOpen((o) => !o)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a24a" strokeWidth={1.8}><path d="M12 3a5 5 0 00-5 5c0 1.5.6 2.7 1.5 3.6L9 14h6l.5-2.4A5 5 0 0012 3z" /><path d="M9 18h6M10 21h4" /></svg><span>Thought for 4s</span><span className="tk">brief · library · brand</span><span className="tcv">▾</span></div>
                      <div className="tracebd">
                        <div className="tl"><i>›</i>Read the <b>Storm-Season Reactivation</b> brief — angle &ldquo;act before the next storm&rdquo;, proof: before/after + reviews.</div>
                        <div className="tl"><i>›</i>Found <b>2 approved before/after photos</b> in Library (real media, available to Arc).</div>
                        <div className="tl"><i>›</i>Pulled {brandName}&rsquo;s <b>brand kit</b> — antique-gold accent, Fraunces headline.</div>
                        <div className="tl"><i>›</i>Reframed the hero to <b>9:16</b> and composited the kicker + CTA.</div>
                      </div>
                    </div>
                    <div className="arbody">Three directions, all on your <b>approved before/after photo</b> — no stock, no invented claims. I kept the &ldquo;same-week scheduling&rdquo; proof and reframed to 9:16.<span className="lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>Outbound stays locked until you approve.</span></div>
                    {[["Before / After · 9:16", "comp", "Composite", SC.beforeafter], ["Before / After · 9:16 (bold)", "comp", "Composite", SC.beforeafter], ["Crew on site · 9:16", "real", "Real media", SC.roof]].map(([an, pv, pl, svg], i) => (
                      <div className="acard" key={i}>
                        <div className="atop"><div className="ath"><Raw html={svg as string} /></div><div className="ainfo"><div className="an">{an}</div><span className={`apv pv ${pv}`}>{pl}</span><div className="ameta">draft · social_ad · 1080×1920<br />via Arc</div></div></div>
                        <div className="actl"><button className="abtn ap"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>Approve</button><button className="abtn">Revise</button><button className="abtn">Decline</button></div>
                      </div>
                    ))}
                    <div className="achips">
                      {[["Make 1:1 + 4:5 too", '<rect x="4" y="4" width="16" height="16" rx="2"/>'], ["Softer headline", '<path d="M4 7h16M4 12h10M4 17h7"/>'], ["Check virality", '<path d="M3 17l5-5 4 3 5-7 4 4"/>'], ["Swap proof point", '<path d="M12 4l2.5 5 5.5.8-4 4 1 5.5L12 17l-5 2.6 1-5.5-4-4 5.5-.8z"/>']].map(([label, d]) => (
                        <span className="achip" key={label}><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: d }} />{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="composer">
                  <div className="modes">{["Ask", "Act", "Draft"].map((m) => <span key={m} className={`mode${cmode === m ? " on" : ""}`} onClick={() => setCmode(m)}>{m}</span>)}</div>
                  <div className="cbox"><textarea rows={1} placeholder="Ask Arc to edit, generate, or repackage this creative…" /><button className="csend"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></div>
                  <div className="clock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>Drafts only — nothing sends until you approve.</div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
