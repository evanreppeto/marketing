"use client";

import { useState } from "react";

const PAL = [
  { role: "Primary", nm: "Restoration Blue", hex: "#3b6ef5" },
  { role: "Secondary", nm: "Trust Teal", hex: "#18b4a6" },
  { role: "Accent", nm: "Amber", hex: "#f2a93b" },
  { role: "Ink", nm: "Ink", hex: "#14181f" },
  { role: "Paper", nm: "Paper", hex: "#f5f7fa" },
];

const PREVIEW_IMG = "https://d8j0ntlcm91z4.cloudfront.net/user_3FaOq1cCR2Izxa2haYxVnIrhIBK/hf_20260625_205928_16464999-955a-4ad8-9f7e-44da9947830a_min.webp";
const STUDIO = "/studio";
const BRAIN = "/brain";

const PROOF = ["<b>GAF-certified</b> installer", "<b>Licensed &amp; insured</b> local crews", "Maple Grove HOA reroofed in <b>5 days</b>", "<b>Google</b> · 4.8/5 (1,200+)"];
const OFFERING = ["Roof replacement", "Storm-damage repair", "Insurance-claim assistance", "Gutter &amp; siding"];
const GUARDRAILS = ["Make unverified savings / % claims", "Name competitors in paid ads", "Guarantee claim approval before inspection", "Use customer photos without rights", "Outbound-send without human approval"];
const SOURCES = [
  { ext: "PDF", extColor: undefined as string | undefined, nm: "Brand guidelines.pdf", facts: "18 facts", when: "analyzed 30d ago", stale: true },
  { ext: "DOCX", extColor: "#2b78c4", nm: "Tone of voice.docx", facts: "9 facts", when: "analyzed 30d ago", stale: true },
  { ext: "MD", extColor: "#5a5f6b", nm: "messaging-v3.md", facts: "12 facts", when: "analyzed 6d ago", stale: false },
  { ext: "PDF", extColor: undefined, nm: "product-onepager.pdf", facts: "7 facts", when: "analyzed 6d ago", stale: false },
];

const CHECK = <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg>;
const BAN = <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></svg>;
const RESYNC = <svg viewBox="0 0 24 24"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3" /></svg>;
const DOC = <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>;

const ASPECTS = ["1 / 1", "4 / 5", "16 / 9", "9 / 16"];
const ASPECT_LABELS = ["1:1", "4:5", "16:9", "9:16"];

export function BrandView({ brandName }: { brandName: string }) {
  const [active, setActive] = useState(0);
  const [aspect, setAspect] = useState(0);
  const accent = PAL[active].hex;

  return (
    <div className="arc-brand" style={{ ["--bactive" as string]: accent }}>
      {/* HERO */}
      <div className="brandhero">
        <div className="mk2"><svg viewBox="0 0 24 24"><path d="M5 8l5 4-5 4M11 16h8" /></svg></div>
        <div className="bid">
          <div className="bname"><span>{brandName}</span> <span className="bstatus">Published</span></div>
          <div className="btag">Storm-damage roofing &amp; exteriors, done right.</div>
          <div className="bmeta">
            <span>Roofing &amp; exteriors</span><span className="dot">·</span><span>Storm restoration</span><span className="dot">·</span>
            <a>bigshouldersrestoration.com ↗</a><span className="dot">·</span><span>Legal: Big Shoulders Restoration, LLC</span>
          </div>
        </div>
        <div className="bacts">
          <span className="gbtn sm"><svg viewBox="0 0 24 24"><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3M8 9l4-4 4 4M12 5v10" /></svg>Replace logo</span>
          <span className="gbtn sm"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M13 5l4 4" /></svg>Edit identity</span>
          <span className="gbtn gold sm"><svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg>Save</span>
        </div>
      </div>

      {/* INTAKE */}
      <div className="intake">
        <div className="intakehead">
          <div>
            <div className="ih-title"><span className="sp"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" /></svg></span>Teach Arc your brand</div>
            <div className="ih-sub">Add your website, documents, and logo — Arc parses, reads, and analyzes them with Gemini, then proposes brand details for you to approve. Extracted facts land in your <b>Brain</b> and your Brand profile, gated by review — <b>nothing is auto-applied</b>.</div>
          </div>
          <div className="ih-prog">4 sources · 46 facts · <b style={{ color: "var(--accent-contrast)" }}>5 pending</b></div>
        </div>
        <div className="bcomplete">
          <span className="bc-l"><svg viewBox="0 0 24 24"><path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z" /><path d="M9 12l2 2 4-4" /></svg>Brand profile</span>
          <div className="bc-bar"><i style={{ width: "84%" }} /></div>
          <span className="bc-pct">84%</span>
          <span className="bc-miss">Still needed: <a>richer proof</a> · <a>secondary logo</a> · <a>per-persona voice</a></span>
        </div>
        <div className="sources">
          <div className="isrc">
            <span className="tg ok">wired</span>
            <div className="si"><span className="ic bl"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg></span><div><div className="nm">Website</div><div className="ds">Crawls up to 6 pages → logo, colors, fonts, voice, proof</div></div></div>
            <div className="urow"><input defaultValue="https://bigshouldersrestoration.com" spellCheck={false} /><span className="ibtn">Analyze</span></div>
          </div>
          <div className="isrc">
            <span className="tg ok">wired</span>
            <div className="si"><span className="ic gd">{DOC}</span><div><div className="nm">Documents</div><div className="ds">.docx · .pdf · .md · .csv · txt — up to 50&nbsp;MB</div></div></div>
            <div className="ucta drop"><svg className="upi" viewBox="0 0 24 24"><path d="M12 16V6M8 10l4-4 4 4" /><path d="M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" /></svg><span><b>Drop files</b> or browse</span></div>
          </div>
          <div className="isrc">
            <span className="tg est">vision · partial</span>
            <div className="si"><span className="ic vi"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M3 17l5-4 4 3 3-2 6 4" /></svg></span><div><div className="nm">Logo &amp; images</div><div className="ds">Arc reads them with Gemini vision</div></div></div>
            <div className="ucta drop"><svg className="upi" viewBox="0 0 24 24"><path d="M12 16V6M8 10l4-4 4 4" /><path d="M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" /></svg><span><b>Drop logo / photos</b></span></div>
          </div>
          <div className="isrc">
            <span className="tg ok">wired</span>
            <div className="si"><span className="ic mu"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M13 5l4 4" /></svg></span><div><div className="nm">Manual</div><div className="ds">Type a note, or edit any field below</div></div></div>
            <div className="ucta">Add a brand note</div>
          </div>
        </div>
      </div>

      <div className="bbody">
        {/* LEFT */}
        <div className="bcol">
          {/* PALETTE */}
          <div className="bsec">
            <div className="bsh"><h3>Brand palette</h3><span className="tg ok">wired</span><div className="sx"><span className="editlink"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Add color</span></div></div>
            <div className="bsb">
              <div className="swrow">
                {PAL.map((p, i) => {
                  const dark = p.hex.toLowerCase() === "#14181f";
                  const paper = p.hex === "#f5f7fa";
                  return (
                    <div key={p.role} className={`sw${i === active ? " on" : ""}`} onClick={() => setActive(i)}>
                      <div className="chip" style={{ background: p.hex, ...(dark ? { borderBottom: "1px solid var(--line-2)" } : {}) }}>
                        <span className="role" style={paper ? { color: "#3a3f4a", textShadow: "none" } : undefined}>{p.role}</span>
                      </div>
                      <div className="meta"><div className="nm">{p.nm}</div><div className="hx">{p.hex}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bsnote">Click a color to preview it as the active accent on the generated ad → Arc uses these tokens across every generated ad, landing page, and email render.</div>
          </div>

          {/* TYPOGRAPHY */}
          <div className="bsec">
            <div className="bsh"><h3>Typography</h3><span className="tg ok">wired</span><div className="sx"><span className="editlink"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /></svg>Change</span></div></div>
            <div className="bsb"><div className="typ">
              <div className="tspec serif"><div className="glyph">Aa</div><div className="ti"><div className="role">Display</div><div className="fam">Fraunces</div><div className="sample">Storm-damage roofing &amp; exteriors, done right.</div></div></div>
              <div className="tspec"><div className="glyph">Aa</div><div className="ti"><div className="role">UI / Body</div><div className="fam">Geist</div><div className="sample">Licensed &amp; insured local crews. GAF-certified. Workmanship warranty.</div></div></div>
              <div className="tspec mono"><div className="glyph">Aa</div><div className="ti"><div className="role">Mono / Code</div><div className="fam">Geist Mono</div><div className="sample">Maple Grove HOA · reroofed in 5 days</div></div></div>
            </div></div>
          </div>

          {/* VOICE */}
          <div className="bsec">
            <div className="bsh"><h3>Voice &amp; tone</h3><span className="tg ok">wired · tone · voice_guidance</span><div className="sx"><span className="editlink"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /></svg>Edit</span></div></div>
            <div className="bsb">
              <div className="tone"><span className="tchip">Warm</span><span className="tchip">Trustworthy</span><span className="tchip">Local</span><span className="tchip">No-pressure</span></div>
              <p className="guide">Speak neighbor-to-neighbor. Lead with help and proof, never pressure. Short sentences, active voice. Reassure a homeowner dealing with storm damage who hates being sold to.</p>
              <div className="phr">
                <div><div className="pl">{CHECK}Preferred</div><div className="words"><span className="word">inspection</span><span className="word">warranty</span><span className="word">local</span><span className="word">licensed</span><span className="word">claim-ready</span></div></div>
                <div><div className="pl ban">{BAN}Banned</div><div className="words"><span className="word ban">discount</span><span className="word ban">limited-time</span><span className="word ban">act now</span><span className="word ban">cheapest</span><span className="word ban">gimmick</span></div></div>
              </div>
              <div className="vpreview">
                <div className="vp-head"><span className="vp-spark"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" /></svg></span>How Arc will write <span className="tg est">preview</span><span className="vp-regen">{RESYNC}Regenerate</span></div>
                <div className="vp-body">“Hail hit Naperville hard on June 24. We’ll inspect your roof for free, coordinate the whole insurance claim, and back the work with our workmanship warranty — licensed, insured, local crews.”</div>
                <div className="vp-meta"><i />Email opener · in your voice · 2 proof points · 0 banned phrases</div>
              </div>
            </div>
            <div className="bsnote">Arc enforces banned phrases as a <b>guardrail</b> — drafts using them are flagged before they reach approval.</div>
          </div>

          {/* PROOF / GUARDRAILS / SERVICES */}
          <div className="bsec">
            <div className="bsh"><h3>Proof, guardrails &amp; offering</h3><span className="tg ok">wired · proof_points · guardrails · services</span></div>
            <div className="bsb">
              <div className="twocol">
                <div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px" }}>Proof points</div>
                  <div className="flist">{PROOF.map((t, i) => <div key={i} className="fitem"><span className="fi ok">{CHECK}</span><span dangerouslySetInnerHTML={{ __html: t }} /></div>)}</div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 6px" }}>Offering</div>
                  <div className="flist">{OFFERING.map((t, i) => <div key={i} className="fitem"><span className="fi sv"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /></svg></span><span dangerouslySetInnerHTML={{ __html: t }} /></div>)}</div>
                </div>
                <div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--red-text)", margin: "0 0 6px" }}>Guardrails — Arc will not</div>
                  <div className="flist">{GUARDRAILS.map((t, i) => <div key={i} className="fitem"><span className="fi gd">{BAN}</span><span>{t}</span></div>)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="brail">
          {/* LIVE PREVIEW */}
          <div className="preview">
            <div className="pvhead"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.9}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg><h3>Live brand preview</h3><span className="tg ok" style={{ marginLeft: "auto" }}>wired</span></div>
            <div className="pvframe" style={{ aspectRatio: ASPECTS[aspect] }}>
              <img src={PREVIEW_IMG} alt="" />
              <div className="pvgrad" />
              <div className="pvcontent">
                <div className="pvlogo"><i><svg viewBox="0 0 24 24"><path d="M5 8l5 4-5 4M11 16h8" /></svg></i>{brandName}</div>
                <div className="pvh">Storm-damage roofing &amp; exteriors, done right.</div>
                <div className="pvs">GAF-certified · licensed &amp; insured · workmanship warranty</div>
                <div className="pvcta">Book a free inspection →</div>
              </div>
            </div>
            <div className="pvbar">
              {ASPECT_LABELS.map((label, i) => <span key={label} className={`arat${i === aspect ? " on" : ""}`} onClick={() => setAspect(i)}>{label}</span>)}
              <a className="gbtn sm" style={{ marginLeft: "auto" }} href={STUDIO}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 5h16v14H4z" /><path d="M4 14l5-4 4 3 3-2 4 3" /></svg>Open in Studio</a>
            </div>
            <div className="pvcap">This composite is generated from your palette, fonts &amp; an approved Library photo — nothing is sent until you approve it.</div>
          </div>

          {/* BRAND SOURCES */}
          <div className="bsec">
            <div className="bsh"><h3>Brand sources</h3><span className="tg ok">wired · media_assets</span><div className="sx"><span className="resyncall">{RESYNC}Re-sync all</span><span className="gbtn gold sm"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>Upload</span></div></div>
            <div className="bsb" style={{ paddingTop: 6 }}>
              {SOURCES.map((s) => (
                <a key={s.nm} className="src" href={BRAIN}>
                  <span className="di">{DOC}<span className="ext" style={s.extColor ? { background: s.extColor } : undefined}>{s.ext}</span></span>
                  <div className="si"><div className="sn">{s.nm}</div><div className="sm"><b>{s.facts}</b> · {s.when}{s.stale && <span className="stale">stale</span>}</div></div>
                  <span className="resync" title="Re-sync">{RESYNC}</span><span className="sgo">→</span>
                </a>
              ))}
            </div>
            <div className="bsnote">Upload a deck, brief, or guidelines — Arc parses it (docx/pdf/md/csv) and writes what it learns into the <b>Brain</b>. <b>Re-sync</b> re-learns a source when your site or docs change. Click a source to see its facts.</div>
          </div>

          {/* ARC USES THIS */}
          <div className="arcnote">
            <span className="am">A</span>
            <div className="an"><b>How Arc uses your brand.</b> Every draft — ad, email, SMS, landing page — pulls these colors, fonts, voice and proof points, and is checked against your guardrails before it ever reaches the approval queue.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
