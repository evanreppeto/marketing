"use client";

import { useState } from "react";

import type { BrandProfileView } from "@/lib/brand-kit/profile-view";

const PREVIEW_IMG = "https://d8j0ntlcm91z4.cloudfront.net/user_3FaOq1cCR2Izxa2haYxVnIrhIBK/hf_20260625_205928_16464999-955a-4ad8-9f7e-44da9947830a_min.webp";
const STUDIO = "/studio";
const BRAIN = "/brain";

const CHECK = <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg>;
const BAN = <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></svg>;
const RESYNC = <svg viewBox="0 0 24 24"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3" /></svg>;
const DOC = <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>;

const ASPECTS = ["1 / 1", "4 / 5", "16 / 9", "9 / 16"];
const ASPECT_LABELS = ["1:1", "4:5", "16:9", "9:16"];

/** Relative luminance test so swatch text stays legible on any palette color. */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function BrandView({ view }: { view: BrandProfileView }) {
  const { identity, palette, tone, voiceGuidance, preferredPhrases, bannedPhrases, proofPoints, services, guardrails, sources } = view;
  const [active, setActive] = useState(0);
  const [aspect, setAspect] = useState(0);
  const accent = palette[active]?.hex ?? palette[0]?.hex ?? "var(--accent)";
  const tagline = identity.tagline ?? "";
  const headingFont = view.headingFont ?? "Fraunces";
  const bodyFont = view.bodyFont ?? "Geist";

  return (
    <div className="arc-brand" style={{ ["--bactive" as string]: accent }}>
      {/* HERO */}
      <div className="brandhero">
        <div className="mk2"><svg viewBox="0 0 24 24"><path d="M5 8l5 4-5 4M11 16h8" /></svg></div>
        <div className="bid">
          <div className="bname"><span>{identity.name}</span> <span className="bstatus">{identity.published ? "Published" : "Draft"}</span></div>
          {tagline && <div className="btag">{tagline}</div>}
          <div className="bmeta">
            {identity.segments.map((s, i) => (
              <span key={s}>{i > 0 && <span className="dot">·</span>}{s}</span>
            ))}
            {identity.website && (
              <>
                <span className="dot">·</span>
                <a href={identity.website} target="_blank" rel="noreferrer">{identity.website.replace(/^https?:\/\//, "")} ↗</a>
              </>
            )}
            {identity.legalName && <><span className="dot">·</span><span>Legal: {identity.legalName}</span></>}
          </div>
        </div>
        <div className="bacts">
          <span className="gbtn sm" data-soon="Replacing your logo is coming soon"><svg viewBox="0 0 24 24"><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3M8 9l4-4 4 4M12 5v10" /></svg>Replace logo</span>
          <span className="gbtn sm" data-soon="Editing brand identity is coming soon"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M13 5l4 4" /></svg>Edit identity</span>
          <span className="gbtn gold sm" data-soon="Saving brand changes is coming soon"><svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg>Save</span>
        </div>
      </div>

      {/* INTAKE */}
      <div className="intake">
        <div className="intakehead">
          <div>
            <div className="ih-title"><span className="sp"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" /></svg></span>Teach Arc your brand</div>
            <div className="ih-sub">Add your website, documents, and logo — Arc parses, reads, and analyzes them with Gemini, then proposes brand details for you to approve. Extracted facts land in your <b>Brain</b> and your Brand profile, gated by review — <b>nothing is auto-applied</b>.</div>
          </div>
          <div className="ih-prog">{sources.length} {sources.length === 1 ? "source" : "sources"} connected</div>
        </div>
        <div className="sources">
          <div className="isrc">
            <span className="tg est">preview</span>
            <div className="si"><span className="ic bl"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg></span><div><div className="nm">Website</div><div className="ds">Crawls up to 6 pages → logo, colors, fonts, voice, proof</div></div></div>
            <div className="urow"><input defaultValue={identity.website ?? ""} placeholder="https://yourbrand.com" spellCheck={false} /><span className="ibtn" data-soon="Website analysis is coming soon">Analyze</span></div>
          </div>
          <div className="isrc">
            <span className="tg est">preview</span>
            <div className="si"><span className="ic gd">{DOC}</span><div><div className="nm">Documents</div><div className="ds">.docx · .pdf · .md · .csv · txt — up to 50&nbsp;MB</div></div></div>
            <div className="ucta drop" data-soon="Document upload is coming soon"><svg className="upi" viewBox="0 0 24 24"><path d="M12 16V6M8 10l4-4 4 4" /><path d="M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" /></svg><span><b>Drop files</b> or browse</span></div>
          </div>
          <div className="isrc">
            <span className="tg est">vision · partial</span>
            <div className="si"><span className="ic vi"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M3 17l5-4 4 3 3-2 6 4" /></svg></span><div><div className="nm">Logo &amp; images</div><div className="ds">Arc reads them with Gemini vision</div></div></div>
            <div className="ucta drop" data-soon="Logo & image upload is coming soon"><svg className="upi" viewBox="0 0 24 24"><path d="M12 16V6M8 10l4-4 4 4" /><path d="M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" /></svg><span><b>Drop logo / photos</b></span></div>
          </div>
          <div className="isrc">
            <span className="tg est">preview</span>
            <div className="si"><span className="ic mu"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M13 5l4 4" /></svg></span><div><div className="nm">Manual</div><div className="ds">Type a note, or edit any field below</div></div></div>
            <div className="ucta" data-soon="Brand notes are coming soon">Add a brand note</div>
          </div>
        </div>
      </div>

      <div className="bbody">
        {/* LEFT */}
        <div className="bcol">
          {/* PALETTE */}
          <div className="bsec">
            <div className="bsh"><h3>Brand palette</h3><span className="tg ok">wired</span><div className="sx"><span className="editlink" data-soon="Editing the palette is coming soon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Add color</span></div></div>
            <div className="bsb">
              {palette.length === 0 ? (
                <div className="bsnote" style={{ margin: 0 }}>No palette yet — add colors, or let Arc extract them from your website and logo.</div>
              ) : (
                <div className="swrow">
                  {palette.map((p, i) => {
                    const light = isLight(p.hex);
                    return (
                      <div key={p.role} className={`sw${i === active ? " on" : ""}`} onClick={() => setActive(i)}>
                        <div className="chip" style={{ background: p.hex, ...(light ? {} : { borderBottom: "1px solid var(--line-2)" }) }}>
                          <span className="role" style={light ? { color: "#3a3f4a", textShadow: "none" } : undefined}>{p.role}</span>
                        </div>
                        <div className="meta"><div className="nm">{p.name}</div><div className="hx">{p.hex}</div></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {palette.length > 0 && (
              <div className="bsnote">Click a color to preview it as the active accent on the generated ad → Arc uses these tokens across every generated ad, landing page, and email render.</div>
            )}
          </div>

          {/* TYPOGRAPHY */}
          <div className="bsec">
            <div className="bsh"><h3>Typography</h3><span className="tg ok">wired</span><div className="sx"><span className="editlink" data-soon="Editing typography is coming soon"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /></svg>Change</span></div></div>
            <div className="bsb"><div className="typ">
              <div className="tspec serif"><div className="glyph">Aa</div><div className="ti"><div className="role">Display</div><div className="fam">{headingFont}</div><div className="sample">{tagline || "Your headline, set in the display face."}</div></div></div>
              <div className="tspec"><div className="glyph">Aa</div><div className="ti"><div className="role">UI / Body</div><div className="fam">{bodyFont}</div><div className="sample">{proofPoints.slice(0, 2).join(". ") || "Body copy for everyday UI and paragraphs."}</div></div></div>
              <div className="tspec mono"><div className="glyph">Aa</div><div className="ti"><div className="role">Mono / Code</div><div className="fam">{bodyFont} Mono</div><div className="sample">{services[0] ?? "Structured data & labels"}</div></div></div>
            </div></div>
          </div>

          {/* VOICE */}
          {(tone.length > 0 || voiceGuidance || preferredPhrases.length > 0 || bannedPhrases.length > 0) && (
            <div className="bsec">
              <div className="bsh"><h3>Voice &amp; tone</h3><span className="tg ok">wired</span><div className="sx"><span className="editlink" data-soon="Editing voice & tone is coming soon"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16z" /></svg>Edit</span></div></div>
              <div className="bsb">
                {tone.length > 0 && <div className="tone">{tone.map((t) => <span className="tchip" key={t}>{t}</span>)}</div>}
                {voiceGuidance && <p className="guide">{voiceGuidance}</p>}
                {(preferredPhrases.length > 0 || bannedPhrases.length > 0) && (
                  <div className="phr">
                    <div><div className="pl">{CHECK}Preferred</div><div className="words">{preferredPhrases.map((w) => <span className="word" key={w}>{w}</span>)}</div></div>
                    <div><div className="pl ban">{BAN}Banned</div><div className="words">{bannedPhrases.map((w) => <span className="word ban" key={w}>{w}</span>)}</div></div>
                  </div>
                )}
                <div className="vpreview">
                  <div className="vp-head"><span className="vp-spark"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" /></svg></span>How Arc will write <span className="tg est">preview</span><span className="vp-regen" data-soon="Regenerating the preview is coming soon">{RESYNC}Regenerate</span></div>
                  <div className="vp-body">“Hail hit Naperville hard on June 24. We’ll inspect your roof for free, coordinate the whole insurance claim, and back the work with our workmanship warranty — licensed, insured, local crews.”</div>
                  <div className="vp-meta"><i />Email opener · in your voice · {proofPoints.length} proof points · 0 banned phrases</div>
                </div>
              </div>
              {bannedPhrases.length > 0 && (
                <div className="bsnote">Arc enforces banned phrases as a <b>guardrail</b> — drafts using them are flagged before they reach approval.</div>
              )}
            </div>
          )}

          {/* PROOF / GUARDRAILS / SERVICES */}
          <div className="bsec">
            <div className="bsh"><h3>Proof, guardrails &amp; offering</h3><span className="tg ok">wired</span></div>
            <div className="bsb">
              <div className="twocol">
                <div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px" }}>Proof points</div>
                  <div className="flist">{proofPoints.map((t, i) => <div key={i} className="fitem"><span className="fi ok">{CHECK}</span><span>{t}</span></div>)}</div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 6px" }}>Offering</div>
                  <div className="flist">{services.map((t, i) => <div key={i} className="fitem"><span className="fi sv"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /></svg></span><span>{t}</span></div>)}</div>
                </div>
                <div>
                  <div className="pl" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--red-text)", margin: "0 0 6px" }}>Guardrails — Arc will not</div>
                  <div className="flist">{guardrails.map((t, i) => <div key={i} className="fitem"><span className="fi gd">{BAN}</span><span>{t}</span></div>)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="brail">
          {/* LIVE PREVIEW */}
          <div className="preview">
            <div className="pvhead"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.9}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg><h3>Live brand preview</h3><span className="tg est" style={{ marginLeft: "auto" }}>preview</span></div>
            <div className="pvframe" style={{ aspectRatio: ASPECTS[aspect] }}>
              <img src={PREVIEW_IMG} alt="" />
              <div className="pvgrad" />
              <div className="pvcontent">
                <div className="pvlogo"><i><svg viewBox="0 0 24 24"><path d="M5 8l5 4-5 4M11 16h8" /></svg></i>{identity.name}</div>
                {tagline && <div className="pvh">{tagline}</div>}
                {proofPoints.length > 0 && <div className="pvs">{proofPoints.slice(0, 3).join(" · ")}</div>}
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
            <div className="bsh"><h3>Brand sources</h3><span className="tg ok">wired</span><div className="sx"><span className="resyncall" data-soon="Re-syncing all sources is coming soon">{RESYNC}Re-sync all</span><span className="gbtn gold sm" data-soon="Uploading sources is coming soon"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>Upload</span></div></div>
            <div className="bsb" style={{ paddingTop: 6 }}>
              {sources.length === 0 ? (
                <div className="bsnote" style={{ margin: 0 }}>No brand sources yet — upload a deck, brief, or guidelines and Arc will read them into your Brain.</div>
              ) : (
                sources.map((s) => (
                  <a key={s.name} className="src" href={BRAIN}>
                    <span className="di">{DOC}<span className="ext" style={s.extColor ? { background: s.extColor } : undefined}>{s.ext}</span></span>
                    <div className="si"><div className="sn">{s.name}</div><div className="sm"><b>{s.facts}</b>{s.when && ` · ${s.when}`}{s.stale && <span className="stale">stale</span>}</div></div>
                    <span className="resync" title="Re-sync" data-soon="Re-syncing this source is coming soon">{RESYNC}</span><span className="sgo">→</span>
                  </a>
                ))
              )}
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
