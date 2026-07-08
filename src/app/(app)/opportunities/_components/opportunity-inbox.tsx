"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { scanForOpportunitiesAction } from "../actions";

export type OppSignal = { label: string; value: string };
export type OppRouting = { step: string; note: string; done: boolean };

export type OpportunityVM = {
  id: string;
  name: string;
  title: string;
  confidence: number;
  urgencyTone: "red" | "amber" | "info";
  urgencyLabel: string;
  typeLabel: string;
  icon: "weather" | "comp" | "clock" | "user";
  sourceLabel: string;
  summary: string;
  recommendedAction: string;
  persona: string;
  personaHref: string | null;
  recordHref: string | null;
  recordLabel: string | null;
  audienceNote: string;
  campaignTypes: string[];
  evidence: OppSignal[];
  impact: OppSignal[];
  routing: OppRouting[];
};

// Create / draft flows open the real ported screens. "Create campaign" lands on
// the campaigns board where the "New campaign" button opens the real create
// modal — not the static /campaigns/new builder mockup.
const CREATE_HREF = "/campaigns";
const DRAFT_HREF = "/arc";

const ICONS: Record<OpportunityVM["icon"], React.ReactNode> = {
  weather: (
    <svg viewBox="0 0 24 24"><path d="M6 14a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0118 14z" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>
  ),
  comp: <svg viewBox="0 0 24 24"><path d="M3 11l14-6v14L3 13z" /><path d="M7 13v4a2 2 0 004 0" /></svg>,
  clock: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>,
  user: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></svg>,
};

function ConfidenceFill({ pct }: { pct: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="ctrack">
      <div className="cfill" style={{ width: `${w}%` }} />
    </div>
  );
}

const scanBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  height: "30px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid var(--accent-border)",
  background: "var(--accent-soft)",
  color: "var(--accent-contrast)",
  fontSize: "11.5px",
  fontWeight: 600,
  cursor: "pointer",
};

// Runs cold-lead detection over the workspace CRM and refreshes the inbox with
// any new source-backed opportunities. Read-only — surfaces signals, drafts nothing.
function ScanButton({ subtle }: { subtle?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ ...scanBtnStyle, opacity: pending ? 0.6 : 1, ...(subtle ? { height: "34px" } : {}) }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      {pending ? "Scanning CRM…" : "Scan for opportunities"}
    </button>
  );
}

export function OpportunityInbox({ opps }: { opps: OpportunityVM[] }) {
  const [cur, setCur] = useState(0);

  if (opps.length === 0) {
    return (
      <div className="arc-opps" style={{ display: "block" }}>
        <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <span>No open opportunities yet. Arc scans your CRM for source-backed signals — quiet leads worth re-engaging, and more.</span>
          <form action={scanForOpportunitiesAction}>
            <ScanButton subtle />
          </form>
        </div>
      </div>
    );
  }

  const o = opps[Math.min(cur, opps.length - 1)];

  return (
    <div className="arc-opps">
      <aside className="olist">
        <div className="olisthd">
          <span className="h">OPEN OPPORTUNITIES</span>
          <span className="c">{opps.length} open</span>
        </div>
        <form action={scanForOpportunitiesAction} style={{ padding: "2px 4px 12px" }}>
          <ScanButton />
        </form>
        <div>
          {opps.map((it, i) => (
            <button key={it.id} type="button" className={`orow${i === cur ? " on" : ""}`} onClick={() => setCur(i)}>
              <span className="ic">{ICONS[it.icon]}</span>
              <div style={{ minWidth: 0 }}>
                <div className="ot">
                  <span className="nm">{it.name}</span>
                  <span className="pct">{it.confidence}%</span>
                </div>
                <div className="om">
                  Confidence <span className="src">{it.sourceLabel}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="odetail">
        <div className="inner fade" key={o.id}>
          <div className="metarow">
            <span className="tchip"><i />{o.typeLabel}</span>
            <span className={`upill ${o.urgencyTone}`}>{o.urgencyLabel} urgency</span>
            <span className="det">Surfaced by Arc</span>
          </div>
          <h1 className="dttl">{o.title}</h1>

          <div className="dgrid">
            <div className="mainc">
              <div className="lab">Why Arc surfaced this</div>
              <p className="summary">{o.summary}</p>

              {o.evidence.length > 0 && (
                <div className="blk">
                  <div className="lab">Signals</div>
                  {o.evidence.map((e, i) => (
                    <div className="evrow" key={i}>
                      <span className="n">{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="es">{e.label}</div>
                        <div className="ed">{e.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="blk recpanel">
                <div className="rl">Recommended action</div>
                <div className="rtxt">{o.recommendedAction}</div>
                {o.campaignTypes.length > 0 && (
                  <>
                    <div className="sub">Suggested campaign type</div>
                    <div className="types">
                      {o.campaignTypes.map((t) => (
                        <span className="ty" key={t}>{t}</span>
                      ))}
                    </div>
                  </>
                )}
                <div className="racts">
                  <a className="btn gold" href={CREATE_HREF}>Create campaign</a>
                  <a className="btn ghost" href={DRAFT_HREF}>Ask Arc to draft</a>
                  {o.recordHref && (
                    <a className="btn ghost" href={o.recordHref}>{o.recordLabel} →</a>
                  )}
                </div>
              </div>
            </div>

            <div className="side">
              <div className="card">
                <div className="cl">Confidence</div>
                <div className="bignum">{o.confidence}%</div>
                <ConfidenceFill pct={o.confidence} />
                <div className="cnote">Arc&rsquo;s confidence in this signal</div>
              </div>

              {(o.persona || o.audienceNote) && (
                <div className="card">
                  <div className="cl">Who it targets</div>
                  {o.persona && (
                    <div className="audrow">
                      {o.personaHref ? (
                        <a className="ac" href={o.personaHref} title="View persona intelligence">{o.persona} ↗</a>
                      ) : (
                        <span className="ac">{o.persona}</span>
                      )}
                    </div>
                  )}
                  {o.audienceNote && <div className="audnote">{o.audienceNote}</div>}
                </div>
              )}

              {o.impact.length > 0 && (
                <div className="card">
                  <div className="cl">Signal strength</div>
                  <div className="impact">
                    {o.impact.map((m, i) => (
                      <div className="icell" key={i}>
                        <div className="il">{m.label}</div>
                        <div className="iv">{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="cl">Approval routing</div>
                <div className="tl">
                  {o.routing.map((s, i) => (
                    <div className={`tlstep${s.done ? " done" : ""}`} key={i}>
                      <div className="ts">{s.step}</div>
                      <div className="tr">{s.note}</div>
                    </div>
                  ))}
                </div>
                <div className="locknote"><i />Nothing sends until you approve</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
