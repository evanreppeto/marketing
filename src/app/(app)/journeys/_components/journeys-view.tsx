"use client";

import { useMemo, useState } from "react";

import { JOURNEY_STAGES, classifyTouchStage, stageOrder, type JourneyStageKey, type JourneyTouch } from "@/domain";
import type { JourneyWithMeta, JourneysReadModel } from "@/lib/journey/read-model";

// Stage → tone token (see the .journeys CSS block). Two anonymous stages read
// blue; the known-side stages escalate gold → amber → green, with retention its
// own violet so repeat/expansion is visually distinct from a first conversion.
const STAGE_TONE: Record<JourneyStageKey, string> = {
  reached: "blue",
  engaged: "blue",
  identified: "gold",
  nurtured: "amber",
  converted: "green",
  retained: "vio",
};

// Nicer labels for the touch kinds the read-model emits; anything else is titleized.
const KIND_LABEL: Record<string, string> = {
  ad_impression: "Saw an ad",
  email_sent: "Email sent",
  sms_sent: "SMS sent",
  ad_click: "Clicked ad",
  email_open: "Opened email",
  email_click: "Clicked email",
  site_visit: "Visited site",
  reply_received: "Replied",
  inbound_call: "Inbound call",
  form_submit: "Submitted form",
  lead_created: "Became a lead",
  signup: "Signed up",
  lead_routed: "Routed",
  lead_contacted: "Contacted",
  quote_sent: "Quote sent",
  booking: "Booked",
  job_opened: "Job opened",
  job_completed: "Job completed",
  purchase: "Purchase",
  payment: "Paid",
  subscribe: "Subscribed",
  download: "Downloaded",
  outcome_won: "Won / paid",
  referral: "Referral",
};

const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function money(cents: number): string {
  const d = Math.round(cents / 100);
  if (Math.abs(d) >= 10000) return `$${Math.round(d / 1000)}k`;
  return USD0.format(d);
}
function dateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}
function titleize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? titleize(kind);
}
function dirGlyph(direction: JourneyTouch["direction"]): string {
  return direction === "outbound" ? "↑" : direction === "inbound" ? "↓" : "•";
}
function stageLabel(key: JourneyStageKey): string {
  return JOURNEY_STAGES.find((s) => s.key === key)?.label ?? key;
}

/** Six-dot progress track, filled up to the journey's current stage. */
function StageTrack({ current }: { current: JourneyStageKey }) {
  const top = stageOrder(current);
  return (
    <span className="jr-track" aria-label={`Stage: ${stageLabel(current)}`}>
      {JOURNEY_STAGES.map((s) => {
        const on = stageOrder(s.key) <= top;
        return <i key={s.key} className={`jr-dot${on ? ` on t-${STAGE_TONE[s.key]}` : ""}`} title={s.label} />;
      })}
    </span>
  );
}

function Timeline({ touches }: { touches: JourneyTouch[] }) {
  if (touches.length === 0) return <div className="jr-sub">No touches recorded.</div>;
  return (
    <ol className="jr-tl">
      {touches.map((t) => {
        const stage = classifyTouchStage(t);
        return (
          <li key={t.id} className="jr-tlrow">
            <span className={`jr-tldot t-${STAGE_TONE[stage]}`} />
            <span className="jr-tlmain">
              <span className="jr-tlkind">
                <b>{kindLabel(t.kind)}</b>
                <span className="jr-dir" aria-hidden>
                  {dirGlyph(t.direction)}
                </span>
                {t.channel && <span className="jr-chip">{titleize(t.channel)}</span>}
                {t.isConversion && t.valueCents ? <span className="jr-chip win">{money(t.valueCents)}</span> : null}
              </span>
              {t.summary && <span className="jr-tlsum">{t.summary}</span>}
            </span>
            <span className="jr-tltime">{dateShort(t.occurredAt)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function JourneyRow({ journey }: { journey: JourneyWithMeta }) {
  const [open, setOpen] = useState(false);
  const tone = STAGE_TONE[journey.currentStage];
  const spanLabel =
    journey.firstTouchAt && journey.lastTouchAt
      ? `${dateShort(journey.firstTouchAt)} → ${dateShort(journey.lastTouchAt)}`
      : dateShort(journey.lastTouchAt);
  return (
    <div className={`jr-row${open ? " open" : ""}`}>
      <button type="button" className="jr-rowhead" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="jr-who">
          <b>{journey.identity.label}</b>
          {journey.persona && <span className="jr-persona">{titleize(journey.persona)}</span>}
          {journey.identity.resolution !== "known" && <span className={`jr-res ${journey.identity.resolution}`}>{journey.identity.resolution}</span>}
        </span>
        <StageTrack current={journey.currentStage} />
        <span className={`jr-pill t-${tone}`}>{stageLabel(journey.currentStage)}</span>
        <span className="jr-span">{spanLabel}</span>
        <span className="jr-val">
          {journey.converted ? money(journey.conversionValueCents) : <span className="jr-muted">in flight</span>}
        </span>
        <span className={`jr-caret${open ? " up" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <div className="jr-detail">
          <div className="jr-detailmeta">
            {journey.firstTouch?.channel && (
              <span>
                First touch <b>{titleize(journey.firstTouch.channel)}</b>
              </span>
            )}
            {journey.lastTouch?.channel && (
              <span>
                Last touch <b>{titleize(journey.lastTouch.channel)}</b>
              </span>
            )}
            {journey.daysToConvert !== null && (
              <span>
                Converted in <b>{journey.daysToConvert}d</b>
              </span>
            )}
            <span>
              <b>{journey.touchCount}</b> touches
            </span>
          </div>
          <Timeline touches={journey.timeline} />
        </div>
      )}
    </div>
  );
}

export function JourneysView({ model }: { model: JourneysReadModel }) {
  const [stageFilter, setStageFilter] = useState<JourneyStageKey | "all">("all");

  const filtered = useMemo(() => {
    const list = model.status === "live" ? model.journeys : [];
    return stageFilter === "all" ? list : list.filter((j) => j.currentStage === stageFilter);
  }, [model, stageFilter]);

  if (model.status !== "live") {
    return (
      <div className="journeys">
        <header className="jr-head">
          <div>
            <h1>Customer Journeys</h1>
            <p className="jr-lede">Every contact&rsquo;s path from first touch to conversion — one stitched timeline.</p>
          </div>
        </header>
        <div className="jr-empty">
          <div className="jr-emptymk">◔</div>
          <b>No journey data yet</b>
          <p>
            Journeys assemble automatically from sends, leads, and outcomes as Arc works — no setup needed. This workspace has none
            recorded yet.
          </p>
        </div>
      </div>
    );
  }

  const { funnel, kpis, channelCredit, isDemo } = model;
  const topCount = funnel[0]?.count ?? 0;
  const creditTotal = channelCredit.reduce((s, c) => s + c.valueCents, 0);

  return (
    <div className="journeys">
      <header className="jr-head">
        <div>
          <h1>
            Customer Journeys
            {isDemo ? <span className="jr-tag demo">demo data</span> : <span className="jr-tag wired">wired · live</span>}
          </h1>
          <p className="jr-lede">Every contact&rsquo;s path from first touch to conversion — one stitched timeline.</p>
        </div>
        <div className="jr-model" title="Attribution lens applied to channel credit">
          <span className="jr-modellab">Credit</span>
          <span className="jr-modelval">Last touch</span>
        </div>
      </header>

      <div className="jr-kpis">
        <Kpi label="Journeys" value={String(kpis.total)} hint="contacts with a path" />
        <Kpi label="In flight" value={String(kpis.inFlight)} hint="identified, not yet converted" tone="amber" />
        <Kpi label="Converted" value={String(kpis.converted)} hint={`${Math.round(kpis.conversionRate * 100)}% of identified`} tone="green" />
        <Kpi label="Realized" value={money(kpis.realizedCents)} hint="from converted journeys" tone="green" />
        <Kpi label="Avg. time to convert" value={kpis.avgDaysToConvert !== null ? `${kpis.avgDaysToConvert}d` : "—"} hint="first touch → paid" />
      </div>

      <section className="jr-panel jr-funnelpanel">
        <h2>
          The journey funnel
          <span className="jr-sub2">how many contacts reach each stage</span>
        </h2>
        <div className="jr-funnel">
          {funnel.map((f, i) => {
            const meta = JOURNEY_STAGES[i];
            const width = topCount > 0 ? Math.max(2, Math.round((f.count / topCount) * 100)) : 0;
            const active = stageFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                className={`jr-fstage${active ? " active" : ""}`}
                onClick={() => setStageFilter((cur) => (cur === f.key ? "all" : f.key))}
                title={meta?.meaning}
              >
                <span className="jr-flabel">
                  {f.label}
                  {meta?.anonymous && <span className="jr-anon" title="Anonymous / pre-identification stage — full capture arrives in P1">pre-lead</span>}
                </span>
                <span className="jr-fbar">
                  <i className={`t-${STAGE_TONE[f.key]}`} style={{ width: `${width}%` }} />
                </span>
                <span className="jr-fcount">{f.count}</span>
                <span className="jr-frate">{i === 0 ? "" : `${Math.round(f.rateFromPrev * 100)}%`}</span>
              </button>
            );
          })}
        </div>
        {stageFilter !== "all" && (
          <div className="jr-filternote">
            Showing <b>{stageLabel(stageFilter)}</b> journeys ·{" "}
            <button type="button" className="jr-clear" onClick={() => setStageFilter("all")}>
              clear
            </button>
          </div>
        )}
      </section>

      <div className="jr-grid">
        <section className="jr-panel jr-listpanel">
          <h2>
            Journeys
            <span className="jr-sub2">{filtered.length} shown · newest first · click to open the timeline</span>
          </h2>
          <div className="jr-list">
            {filtered.length === 0 ? (
              <div className="jr-sub">No journeys in this stage.</div>
            ) : (
              filtered.map((j) => <JourneyRow key={j.identity.id} journey={j} />)
            )}
          </div>
        </section>

        <aside className="jr-side">
          <section className="jr-panel">
            <h2>
              Revenue by channel
              <span className="jr-sub2">last-touch credit across converted journeys</span>
            </h2>
            {channelCredit.length === 0 ? (
              <div className="jr-sub">No converted journeys yet.</div>
            ) : (
              <div className="jr-bd">
                {channelCredit.map((c) => (
                  <div className="jr-bdrow" key={c.channel}>
                    <span className="jr-bn">{titleize(c.channel)}</span>
                    <span className="jr-bb">
                      <i style={{ width: `${creditTotal > 0 ? Math.max(3, Math.round((c.valueCents / creditTotal) * 100)) : 0}%` }} />
                    </span>
                    <span className="jr-bv">{money(c.valueCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="jr-panel jr-note">
            <h2>How this works</h2>
            <p>
              Each journey is stitched from touches Arc already records — sends, clicks, the identifying lead, and the won outcome —
              then placed on a six-stage ladder that fits any business.
            </p>
            <p className="jr-notenext">
              <b>Anonymous capture (P1):</b> a first-party collector records pre-lead <em>Reached</em> and <em>Engaged</em> touches
              against an anonymous id, then stitches that history onto the contact at identification — shown as an{" "}
              <em>anonymous</em> or <em>stitched</em> tag.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className={`jr-kpi${tone ? ` t-${tone}` : ""}`}>
      <span className="jr-klab">{label}</span>
      <span className="jr-kval">{value}</span>
      <span className="jr-khint">{hint}</span>
    </div>
  );
}
