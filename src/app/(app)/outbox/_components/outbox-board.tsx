"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type OutboxChannel = "email" | "sms" | "social" | "other";

export type OutboxCardVM = {
  id: string;
  channel: OutboxChannel;
  title: string;
  campaign: string;
  note: string | null;
  noteTone: "" | "warn" | "red";
  href: string;
  meta: string | null;
  action: string | null;
};

export type BoardCardVM = {
  id: string;
  ownerKind: "agent" | "human" | "system";
  ownerLabel: string;
  title: string;
  relation: string;
  href: string | null;
};

export type LaneVM<T> = { key: string; label: string; color: string; cards: T[] };
export type KpiVM = { value: string; label: string; sub: string; alert: boolean };

const CH_ICON: Record<OutboxChannel, React.ReactNode> = {
  email: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M4 7l8 6 8-6" /></svg>,
  sms: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 3z" /></svg>,
  social: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>,
  other: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M4 7l8 6 8-6" /></svg>,
};

const OWNER_ICON: Record<BoardCardVM["ownerKind"], React.ReactNode> = {
  agent: <svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" /></svg>,
  human: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" /></svg>,
  system: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2" /></svg>,
};

const CHANNELS: { key: string; label: string }[] = [
  { key: "all", label: "All channels" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "social", label: "Social" },
];

export function OutboxBoard({
  outboxLanes,
  boardLanes,
  kpis,
  channelCounts,
}: {
  outboxLanes: LaneVM<OutboxCardVM>[];
  boardLanes: LaneVM<BoardCardVM>[];
  kpis: KpiVM[];
  channelCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [view, setView] = useState<"outbox" | "board">("outbox");
  const [channel, setChannel] = useState("all");

  const outboxCount = outboxLanes.reduce((n, l) => n + l.cards.length, 0);
  const boardCount = boardLanes.reduce((n, l) => n + l.cards.length, 0);

  const visibleOutbox = useMemo(() => {
    if (channel === "all") return outboxLanes;
    return outboxLanes.map((l) => ({ ...l, cards: l.cards.filter((c) => c.channel === channel) }));
  }, [outboxLanes, channel]);

  return (
    <div className="arc-outbox">
      <div className="ohead">
        <div className="otitle">
          <div>
            <h1 className="pt">Outbox</h1>
            <div className="psub">Approved deliverables in flight. The app records state and hands off — it never sends on its own.</div>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" className="gbtn" onClick={() => router.refresh()}>
              <svg viewBox="0 0 24 24"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3" /></svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="lockpanel">
        <div className="lp-top">
          <span className="lk-ic"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span>
          <div className="lt"><b>Outbound is locked.</b> Arc never sends, posts, or spends on its own — every send is your call.</div>
          <span className="tg ok">approval-gated</span>
        </div>
        <div className="lp-flow">
          <span className="gf"><b>Arc</b> drafts</span><span className="ar">→</span>
          <span className="gf">you <b>approve</b> in Campaigns</span><span className="ar">→</span>
          <span className="gf lit">queues here <b>(Outbox)</b></span><span className="ar">→</span>
          <span className="gf">you <b>confirm</b> the send</span>
        </div>
      </div>

      <div className="okpis">
        {kpis.map((k, i) => (
          <div className={`kpi${k.alert ? " alert" : ""}`} key={i}>
            <div className="kv">{k.value}</div>
            <div className="kl">{k.label}</div>
            <div className="ks">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="tabbar">
        <div className="vtabs">
          <button type="button" className={`vtab${view === "outbox" ? " on" : ""}`} onClick={() => setView("outbox")}>
            <svg viewBox="0 0 24 24"><path d="M3 12l18-8-8 18-2-7z" /></svg>
            Outbox <span className="ct">{outboxCount}</span>
          </button>
          <button type="button" className={`vtab${view === "board" ? " on" : ""}`} onClick={() => setView("board")}>
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" /></svg>
            Board <span className="ct">{boardCount}</span>
          </button>
        </div>
        {view === "outbox" && (
          <div className="ofilters">
            {CHANNELS.map((c) => (
              <button key={c.key} type="button" className={`fchip${channel === c.key ? " on" : ""}`} onClick={() => setChannel(c.key)}>
                {c.label}
                {c.key !== "all" && <span className="fct">{channelCounts[c.key] ?? 0}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "outbox" ? (
        <div className="lanes">
          {visibleOutbox.map((lane) => (
            <div className={`lane${lane.cards.length === 0 ? " empty" : ""}`} key={lane.key}>
              <div className="laneh">
                <span className="dot" style={{ background: lane.color }} />
                <span className="ln">{lane.label}</span>
                <span className="lc">{lane.cards.length}</span>
              </div>
              <div className="lanecards">
                {lane.cards.length === 0 ? (
                  <span className="en">Nothing here</span>
                ) : (
                  lane.cards.map((c) => (
                    <a className="card link" key={c.id} href={c.href}>
                      <div className="crow">
                        <span className={`chip-ch ch-${c.channel}`}>{CH_ICON[c.channel]}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cdel">{c.title}</div>
                          <div className="ccamp">{c.campaign}</div>
                        </div>
                      </div>
                      {c.meta && <div className="cmeta">{c.meta}</div>}
                      {c.note && <div className={`cnote${c.noteTone ? ` ${c.noteTone}` : ""}`}>{c.note}</div>}
                      {c.action && <span className="caction">{c.action}</span>}
                    </a>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="lanes">
          {boardLanes.map((lane) => (
            <div className={`lane${lane.cards.length === 0 ? " empty" : ""}`} key={lane.key}>
              <div className="laneh">
                <span className="dot" style={{ background: lane.color }} />
                <span className="ln">{lane.label}</span>
                <span className="lc">{lane.cards.length}</span>
              </div>
              <div className="lanecards">
                {lane.cards.length === 0 ? (
                  <span className="en">Nothing here</span>
                ) : (
                  lane.cards.map((c) => {
                    const inner = (
                      <>
                        <div className="crow">
                          <span className={`chip-ch own-${c.ownerKind}`}>{OWNER_ICON[c.ownerKind]}</span>
                          <div className="cdel" style={{ flex: 1, minWidth: 0 }}>{c.title}</div>
                          <span className={`ownb ${c.ownerKind}`}>{c.ownerLabel}</span>
                        </div>
                        {c.relation && <div className="ccamp" style={{ marginTop: 8 }}>{c.relation}</div>}
                      </>
                    );
                    return c.href ? (
                      <a className="card link" key={c.id} href={c.href}>{inner}</a>
                    ) : (
                      <div className="card" key={c.id}>{inner}</div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
