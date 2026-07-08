"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SharePermission, ShareVisibility } from "@/domain";
import { contextUsage } from "@/lib/arc-chat/context-usage";
import type { ArcMessage } from "@/lib/arc-chat/persistence";
import type { ArcThreadGroupVM } from "@/lib/arc-chat/read-model";

import { sendArcMessageAction } from "../actions";
import {
  getChatSharingStateAction,
  setChatSharingAction,
  shareChatWithMemberAction,
  unshareChatMemberAction,
  type ChatSharingState,
} from "../sharing-actions";

/**
 * Context meter — how full this chat's working window is (Claude-style). As it
 * approaches the window, Arc keeps recent turns verbatim and compacts older ones
 * into a rolling summary; the meter turns amber near the top, red once compaction
 * engages. Estimate is client-side over message bodies (see context-usage.ts).
 */
function ContextMeter({ messages }: { messages: ArcMessage[] }) {
  if (messages.length === 0) return null;
  const { pct, level } = contextUsage(messages.map((m) => m.body ?? ""));
  const color = level === "full" ? "var(--danger, #c0453b)" : level === "warn" ? "var(--warn)" : "var(--ok)";
  const title =
    level === "full"
      ? "Context full — Arc summarizes earlier turns to keep the thread going"
      : level === "warn"
        ? `Context ${pct}% — Arc will soon summarize earlier turns`
        : `Context ${pct}% of this chat's working window`;
  return (
    <span className="ctxmeter" title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
      <span
        aria-hidden
        style={{ width: 44, height: 4, borderRadius: 2, background: "var(--line, rgba(255,255,255,.14))", overflow: "hidden", display: "inline-block" }}
      >
        <span style={{ display: "block", height: "100%", width: `${Math.max(3, pct)}%`, background: color, transition: "width .3s ease" }} />
      </span>
      <span style={{ opacity: 0.75 }}>Context {pct}%</span>
    </span>
  );
}

/**
 * Share dialog — chats are per-person (private by default). The owner can open a
 * chat to the whole workspace (view or collaborate) or share it with specific
 * members. Wraps the sharing server actions; loads current state on open. In
 * offline/open mode it renders with defaults and the actions no-op (enforcement
 * lives in supabase auth mode).
 */
function ShareDialog({ conversationId, onClose }: { conversationId: string | null; onClose: () => void }) {
  const [state, setState] = useState<ChatSharingState | null>(null);
  const [visibility, setVisibility] = useState<ShareVisibility>("private");
  const [permission, setPermission] = useState<SharePermission>("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const reload = () => {
    if (!conversationId) {
      setState({ visibility: "private", workspacePermission: "view", shared: [], addable: [] });
      return;
    }
    getChatSharingStateAction(conversationId).then((s) => {
      setState(s);
      setVisibility(s.visibility);
      setPermission(s.workspacePermission);
    });
  };
  useEffect(reload, [conversationId]);

  const saveVisibility = () =>
    conversationId &&
    start(async () => {
      const r = await setChatSharingAction({ conversationId, visibility, workspacePermission: permission });
      setNotice(r.ok ? "Sharing updated" : r.error);
    });
  const add = (userId: string, perm: SharePermission) =>
    conversationId &&
    start(async () => {
      await shareChatWithMemberAction({ conversationId, userId, permission: perm });
      reload();
    });
  const remove = (userId: string) =>
    conversationId &&
    start(async () => {
      await unshareChatMemberAction({ conversationId, userId });
      reload();
    });

  const overlay: CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 100,
  };
  const card: CSSProperties = {
    width: "min(460px, 92vw)", maxHeight: "82vh", overflow: "auto", background: "var(--panel, #1a1c22)",
    border: "1px solid var(--line, rgba(255,255,255,.12))", borderRadius: 14, padding: 18,
    boxShadow: "0 20px 60px rgba(0,0,0,.5)",
  };
  const seg = (active: boolean): CSSProperties => ({
    padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: `1px solid ${active ? "var(--gold, #c8a24a)" : "var(--line, rgba(255,255,255,.14))"}`,
    background: active ? "var(--gold, #c8a24a)22" : "transparent",
    color: active ? "var(--gold, #c8a24a)" : "inherit",
  });

  return (
    <div style={overlay} onClick={onClose} role="dialog" aria-label="Share chat" aria-modal="true">
      <div className="sharecard" style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Share chat</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close">Done</button>
        </div>

        {!conversationId ? (
          <p style={{ opacity: 0.7, fontSize: 13 }}>Open or start a conversation to share it.</p>
        ) : null}

        <div style={{ marginBottom: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6 }}>Who can access</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button style={seg(visibility === "private")} onClick={() => setVisibility("private")}>Private (just you)</button>
          <button style={seg(visibility === "workspace")} onClick={() => setVisibility("workspace")}>Everyone in workspace</button>
        </div>
        {visibility === "workspace" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>They can</span>
            <button style={seg(permission === "view")} onClick={() => setPermission("view")}>View</button>
            <button style={seg(permission === "collaborate")} onClick={() => setPermission("collaborate")}>Collaborate</button>
          </div>
        ) : null}
        <button className="btn gold" onClick={saveVisibility} disabled={busy || !conversationId} style={{ marginBottom: 16 }}>
          {busy ? "Saving…" : "Save access"}
        </button>

        <div style={{ marginBottom: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6 }}>Shared with specific people</div>
        {state && state.shared.length > 0 ? (
          state.shared.map((m) => (
            <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
              <span>{m.email ?? m.userId}</span>
              <span style={{ opacity: 0.6 }}>· {m.permission}</span>
              <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => remove(m.userId)} disabled={busy}>Remove</button>
            </div>
          ))
        ) : (
          <p style={{ opacity: 0.55, fontSize: 13, margin: "2px 0 8px" }}>Not shared with anyone specific yet.</p>
        )}

        {state && state.addable.length > 0 ? (
          <>
            <div style={{ marginTop: 10, marginBottom: 6, fontSize: 12, opacity: 0.6 }}>Add a member</div>
            {state.addable.map((m) => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
                <span>{m.email ?? m.userId}</span>
                <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => add(m.userId, "view")} disabled={busy}>+ View</button>
                <button className="btn sm" onClick={() => add(m.userId, "collaborate")} disabled={busy}>+ Collaborate</button>
              </div>
            ))}
          </>
        ) : null}

        {notice ? <p style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>{notice}</p> : null}
      </div>
    </div>
  );
}

/* ── icon set (ported verbatim from build-arc-v2.html) ── */
const Ico = {
  plus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  search: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>,
  pin: <svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z" /></svg>,
  pencil: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  brain: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a4 4 0 00-4 4 3 3 0 00-1 6 3 3 0 003 3 3 3 0 006 0 3 3 0 003-3 3 3 0 00-1-6 4 4 0 00-4-4z" /></svg>,
  arrow: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  chevR: <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>,
  chevD: <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>,
  canvas: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></svg>,
  down: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>,
  copy: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  regen: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>,
  save: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>,
  star: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 21l-5-2.7 1-5.5-4-4 5.5-.8z" /></svg>,
  folder: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h6l2 2h8v10H4z" /></svg>,
  share: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>,
  mic: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  send: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  x: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>,
  splitPane: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z" /><path d="M4 9h16M9 5v14" /></svg>,
  lock: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>,
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>,
  people: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3 19c0-3 2-4.5 5-4.5M21 19c0-3-2-4.5-5-4.5M9 19c0-2 1.5-3 3-3s3 1 3 3" /></svg>,
  stop: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
};

const DotRing = ({ sm }: { sm?: boolean }) => (
  <span className={sm ? "dotring sm" : "dotring"} aria-hidden="true">
    {Array.from({ length: 8 }, (_, i) => <span key={i} />)}
  </span>
);

const THREADS: { group: string; items: { title: string; cur?: boolean; two?: boolean; meta?: string; pin?: boolean; done?: boolean }[] }[] = [
  { group: "Pinned", items: [
    { title: "Storm Response brief", pin: true },
    { title: "Storm-damage homeowners", cur: true, two: true, meta: "Active now · 3 drafts pending", pin: true },
  ] },
  { group: "Today", items: [
    { title: "Past-customer outreach", done: true },
    { title: "Property-manager list", done: true },
  ] },
  { group: "Yesterday", items: [{ title: "NOAA hail report read" }] },
  { group: "Previous 7 days", items: [{ title: "Inspection page rewrite" }, { title: "Adjuster follow-ups" }] },
];

type Asset = { id: string; name: string; tab: string; dot: string; status: [string, string]; };
const ASSETS: Asset[] = [
  { id: "email", name: "Email draft", tab: "Email", dot: "ready", status: ["appr", "Ready"] },
  { id: "sms", name: "SMS draft", tab: "SMS", dot: "ready", status: ["appr", "Ready"] },
  { id: "ad", name: "Paid Social ad", tab: "Paid Social", dot: "gen", status: ["gen", "Generating"] },
  { id: "lp", name: "Landing page", tab: "Landing Page", dot: "blocked", status: ["err", "Blocked"] },
];

export function ArcView({
  brandName,
  live = false,
  threadGroups = [],
  messages = [],
  activeConversationId = null,
}: {
  brandName: string;
  live?: boolean;
  threadGroups?: ArcThreadGroupVM[];
  messages?: ArcMessage[];
  activeConversationId?: string | null;
}) {
  const router = useRouter();
  const [sending, startSend] = useTransition();
  const [draft, setDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [threadSel, setThreadSel] = useState("Storm-damage homeowners");
  const [view, setView] = useState<"assets" | "audience">("assets");
  const [asset, setAsset] = useState("ad");
  const active = ASSETS.find((a) => a.id === asset) ?? ASSETS[2];

  const submitDraft = () => {
    const body = draft.trim();
    if (!body || sending) return;
    startSend(async () => {
      const result = await sendArcMessageAction({ conversationId: activeConversationId, body });
      if (result.ok) {
        setDraft("");
        router.push(`/arc?c=${result.conversationId}`);
        router.refresh();
      }
    });
  };

  return (
    <div className="arc-chat">
      {/* ── thread rail ── */}
      <aside className="threads" aria-label="Conversations">
        {live ? (
          <Link href="/arc?new=1" className="newchat"><span>{Ico.plus}</span>New chat</Link>
        ) : (
          <button className="newchat" data-soon="Starting a new Arc chat is coming soon"><span>{Ico.plus}</span>New chat</button>
        )}
        <button className="tsearch" data-soon="Search & commands is coming soon">{Ico.search}Search &amp; commands<span className="k">⌘K</span></button>
        <div className="tscroll">
          {live ? (
            threadGroups.length === 0 ? (
              <div className="tgrp" style={{ opacity: 0.65 }}>No chats yet — start one below.</div>
            ) : (
              threadGroups.map((g) => (
                <div key={g.group}>
                  <div className="tgrp">{g.group}</div>
                  {g.items.map((t) => (
                    <Link
                      key={t.id}
                      href={`/arc?c=${t.id}`}
                      className={`thread${t.active ? " cur" : ""}`}
                      aria-current={t.active ? "true" : undefined}
                    >
                      <span className="tt">{t.title}</span>
                      {t.pinned && <span className="pin" aria-hidden="true">{Ico.pin}</span>}
                    </Link>
                  ))}
                </div>
              ))
            )
          ) : (
            THREADS.map((g) => (
              <div key={g.group}>
                <div className="tgrp">{g.group}</div>
                {g.items.map((t) => {
                  const on = threadSel === t.title;
                  return (
                    <button
                      key={t.title}
                      className={`thread${t.two ? " two" : ""}${on ? " cur" : ""}`}
                      aria-current={on ? "true" : undefined}
                      onClick={() => setThreadSel(t.title)}
                    >
                      {t.two ? (
                        <>
                          <span className="trow"><span className="tt">{t.title}</span>{t.pin && <span className="pin" aria-hidden="true">{Ico.pin}</span>}</span>
                          {t.meta && <span className="tmeta"><b>{t.meta.split(" · ")[0]}</b>{t.meta.includes(" · ") ? ` · ${t.meta.split(" · ").slice(1).join(" · ")}` : ""}</span>}
                        </>
                      ) : (
                        <>
                          <span className="tt">{t.title}</span>
                          {t.pin && <span className="pin" aria-hidden="true">{Ico.pin}</span>}
                          {t.done && <span className="donep" aria-hidden="true" />}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── conversation ── */}
      <section className="convo" aria-label="Conversation">
        <div className="msgs" id="arcMsgs">
          <div className="inner">
            {live ? (
              <LiveMessages messages={messages} brandName={brandName} />
            ) : (
              <>
            <div className="daydiv">Today</div>

            <div className="op">
              <button className="editbtn" aria-label="Edit message" data-soon="Editing a message is coming soon">{Ico.pencil}</button>
              <div className="bub">Which homeowners should we reach first after the Naperville hailstorm?</div>
            </div>

            <div className="arc">
              <div className="a"><img src="/brand/arc-mark.png" alt="Arc" /></div>
              <div className="col">
                <div className="who"><span className="t">9:38 AM</span><span className="mb"><i aria-hidden="true" />Opus 4.8</span></div>
                <div className="body"><span className="hero">142 homes took the heaviest hail and still haven&apos;t booked an inspection.</span>That&apos;s 23% of the storm zone and about $1.4M in estimated restoration work. The clearest urgency signals across them:</div>
                <ul className="md">
                  <li>Sit in the <b>worst-hit hail swath</b>, with no inspection on file — <b>3.1× more likely</b> to have hidden damage</li>
                  <li>No <span className="ic">inspection</span> booked in the 6 days since the storm</li>
                  <li>Older roof — most likely to need a full insurance claim</li>
                </ul>
                <div className="recall">
                  <span className="lbl">{Ico.brain}Recalled from memory</span>
                  <button className="mchip" data-soon="Memory recall is coming soon">Storm-response playbook <span className="conf">94%</span></button>
                  <button className="mchip" data-soon="Memory recall is coming soon">Inspection-first beat discounts last spring <span className="conf">88%</span></button>
                </div>
                <button className="reslink" data-soon="Opening this segment in CRM is coming soon">
                  <div className="meta"><div className="h">142 storm-zone homes</div><div className="s">Saved segment · CRM · refreshed 9:38 AM</div></div>
                  <div className="stat"><div><div className="v">142</div><div className="k">homes</div></div><div><div className="v gold">$1.4M</div><div className="k">est. project value</div></div></div>
                  <div className="go">Open in CRM {Ico.arrow}</div>
                </button>
                <div className="msgactions">
                  <button className="ma" aria-label="Copy" data-soon="Copying is coming soon">{Ico.copy}</button>
                  <button className="ma" aria-label="Regenerate" data-soon="Regenerating is coming soon">{Ico.regen}</button>
                  <button className="ma" aria-label="Save to Brain" data-soon="Saving to Brain is coming soon">{Ico.save}</button>
                </div>
              </div>
            </div>

            <div className="op">
              <button className="editbtn" aria-label="Edit message" data-soon="Editing a message is coming soon">{Ico.pencil}</button>
              <div className="bub">Draft a full storm-response package — email, SMS, a paid-social ad, and a landing page.</div>
            </div>

            <div className="arc">
              <div className="a"><img src="/brand/arc-mark.png" alt="Arc" /></div>
              <div className="col">
                <div className="who"><span className="t">9:41 AM</span><span className="mb"><i aria-hidden="true" />Opus 4.8</span></div>
                <div className="body">On it. I&apos;m assembling a <b>storm-response package</b> across four channels — a free-inspection angle tied to each home&apos;s storm exposure, no discount gimmick. You can watch it build on the right; outbound stays locked until you approve.</div>
                <details className="trace">
                  <summary><span className="lead"><span className="cx" aria-hidden="true">{Ico.chevR}</span> Thought for 4s</span><span className="tk">4 steps · 3 sources</span></summary>
                  <div className="steps">
                    <div className="step">Pulled the 142 hardest-hit homes and grouped them by insurance-claim readiness.</div>
                    <div className="step">Compared discount vs. inspection-first response from last spring — inspection-first booked 2.4× more jobs.<span className="src">[1]</span></div>
                    <div className="step">Chose a free-inspection angle and outlined four channel variants.</div>
                    <div className="step">Checked claims against the NOAA hail report before drafting.<span className="src">[2]</span></div>
                  </div>
                </details>
                <button className="canvaslink" onClick={() => setView("assets")}>
                  <span className="cli">{Ico.canvas}</span>
                  <span className="clt">
                    <span className="clh">Storm-response package</span>
                    <span className="cls"><span className="live"><DotRing sm /> Building 4 assets</span> · $1.4M reach</span>
                  </span>
                  <span className="go">Open canvas {Ico.arrow}</span>
                </button>
              </div>
            </div>

            <div className="op"><div className="bub">Looks good — make the SMS a little warmer.</div></div>

            <div className="arc">
              <div className="a"><img src="/brand/arc-mark.png" alt="Arc" /></div>
              <div className="col">
                <div className="who"><span className="t">9:43 AM</span></div>
                <div className="pending">
                  <DotRing />
                  <div className="pmeta" role="status" aria-live="polite">
                    <span className="pverb">Generating the paid-social ad…</span>
                    <span className="ptimer">0:06</span>
                    <button className="stopb" aria-label="Stop generating" data-soon="Stopping generation is coming soon">{Ico.stop}Stop</button>
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        </div>

        {/* ── composer ── */}
        <div className="dock">
          <div className="wrap">
            <div className="qpanel">
              <div className="qa"><img src="/brand/arc-mark.png" alt="Arc" /></div>
              <div className="qc">
                <div className="qq">Before I draft the landing page — which CTA should it push?</div>
                <div className="qopts">
                  <button className="qopt" data-soon="Replying to Arc is coming soon">Book a strategy call</button>
                  <button className="qopt" data-soon="Replying to Arc is coming soon">Book a free inspection</button>
                  <button className="qopt" data-soon="Replying to Arc is coming soon">See the storm-zone map</button>
                  <button className="qopt txt" data-soon="Replying to Arc is coming soon">Type your own…</button>
                </div>
              </div>
              <button className="qx" aria-label="Dismiss question" data-soon="Dismissing is coming soon">{Ico.x}</button>
            </div>

            <div className="box">
              <div className="ctxrow">
                <span className="ctxchip"><span className="at">@Storm-damage homeowners</span><button className="x" aria-label="Remove" data-soon="Editing chat context is coming soon">{Ico.x}</button></span>
                <span className="ctxchip"><span className="thumb">IMG</span>brand-board.png<button className="x" aria-label="Remove" data-soon="Editing chat context is coming soon">{Ico.x}</button></span>
              </div>
              {live ? (
                <textarea
                  className="ta"
                  aria-label="Message Arc"
                  placeholder="Ask anything, or describe what to draft…"
                  value={draft}
                  rows={1}
                  disabled={sending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitDraft();
                    }
                  }}
                  style={{ resize: "none", background: "transparent", border: "none", outline: "none", width: "100%", font: "inherit", color: "inherit" }}
                />
              ) : (
                <div className="ta" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message Arc" data-ph="Ask anything, or describe what to draft…" />
              )}
              <div className="footer">
                <div className="fleft">
                  <button className="cbtn" aria-label="Attach, commands and tools" data-soon="Attachments, commands & tools are coming soon">{Ico.plus}</button>
                  <span className="cdiv" aria-hidden="true" />
                  <button className="pill" data-soon="Switching Arc's model is coming soon"><span className="pic">{Ico.star}</span><span className="mlab">Auto ·</span> <span className="pval">Opus 4.8</span> <span className="cv" aria-hidden="true">{Ico.chevD}</span></button>
                  <button className="pill mode" data-soon="Switching Arc's mode is coming soon"><span className="pic">{Ico.pencil}</span><span className="pval">Draft</span> <span className="cv" aria-hidden="true">{Ico.chevD}</span></button>
                  <button className="pill" data-soon="Choosing a project is coming soon"><span className="pic">{Ico.folder}</span><span className="pval">Storm-damage homeowners</span> <span className="cv" aria-hidden="true">{Ico.chevD}</span></button>
                  <button className="pill" onClick={() => setShareOpen(true)} aria-label="Share this chat"><span className="pic">{Ico.share}</span><span className="pval">Share</span></button>
                </div>
                <div className="fright">
                  <button className="cbtn" aria-label="Voice input" data-soon="Voice input is coming soon">{Ico.mic}</button>
                  {live ? (
                    <button className="sendb" aria-label="Send message" onClick={submitDraft} disabled={sending || !draft.trim()}>{Ico.send}</button>
                  ) : (
                    <button className="sendb" aria-label="Send message" data-soon="Sending messages to Arc is coming soon">{Ico.send}</button>
                  )}
                </div>
              </div>
            </div>
            <div className="khint" style={{ display: "flex", alignItems: "center" }}><span><b>↵</b> send</span><span><b>⇧↵</b> new line</span><span><b>@</b> mention · <b>/</b> commands</span><ContextMeter messages={messages} /></div>
          </div>
        </div>
      </section>

      {/* ── cinematic canvas ── */}
      <section className="canvas" aria-label="Campaign canvas">
        <div className="cvhdr">
          <span className="ci">{Ico.splitPane}</span>
          <div className="ctt">
            <div className="ct">Storm Rapid Response</div>
            <div className="cs">Storm-damage homeowners · 4 assets · <span className="lock">{Ico.lock}outbound locked</span></div>
          </div>
          <div className="cvviews" role="tablist" aria-label="Canvas view">
            <button className={`cvview${view === "assets" ? " active" : ""}`} onClick={() => setView("assets")} role="tab" aria-selected={view === "assets"}>Assets</button>
            <button className={`cvview${view === "audience" ? " active" : ""}`} onClick={() => setView("audience")} role="tab" aria-selected={view === "audience"}>Audience</button>
          </div>
        </div>

        {view === "assets" ? (
          <div className="cvassets">
            <div className="orchestra">
              <div className="orchhdr">
                <div className="ol"><b>Arc is orchestrating</b> · 4 channel variants</div>
                <div className="opct" role="status" aria-live="polite">2 of 4 ready</div>
              </div>
              <div className="obar"><i style={{ width: "50%" }} /></div>
            </div>

            <div className="cvtabs" role="tablist" aria-label="Campaign assets">
              {ASSETS.map((a) => (
                <button key={a.id} className={`cvtab${asset === a.id ? " active" : ""}`} onClick={() => setAsset(a.id)} role="tab" aria-selected={asset === a.id}>
                  <span className={`dot ${a.dot}`} />{a.tab}
                </button>
              ))}
            </div>

            <div className="stage" key={active.id}>
              <div className="stagehd">
                <span className="sn">{active.name}</span>
                <div className="sright">
                  {active.id === "ad" ? (
                    <>
                      <span className="jstat pend">83%</span>
                      <button className="verchip" data-soon="Version history is coming soon">v3 {Ico.chevD}</button>
                    </>
                  ) : (
                    <span className={`jstat ${active.status[0]}`}>
                      {active.status[0] === "appr" ? Ico.check : active.status[0] === "err" ? Ico.lock : null}
                      {active.status[1]}
                    </span>
                  )}
                </div>
              </div>
              {renderStage(active.id)}
            </div>

            <div className="activity">
              <div className="acthdr"><DotRing sm /><b>Live activity</b></div>
              <div className="actlog" role="log" aria-live="polite">
                <div className="logline done"><span className="lt">9:41:02</span><span className="lx"><span className="lc">Email draft passed 4/4 guardrails.</span></span></div>
                <div className="logline done"><span className="lt">9:41:48</span><span className="lx"><span className="lc">SMS rewritten in a warmer register · 152 chars.</span></span></div>
                <div className="logline"><span className="lt">9:42:10</span><span className="lx">Selected approved BSR field photo as the ad base.<span className="src">[3]</span></span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="audpanel">
            <div className="audstat">
              <div className="as"><div className="v">142</div><div className="k">target homes</div></div>
              <div className="as"><div className="v gold">$1.4M</div><div className="k">est. project value</div></div>
              <div className="as"><div className="v">23%</div><div className="k">of storm zone</div></div>
            </div>
            <div className="audsec">
              <div className="ah">Persona mix</div>
              <div className="audrow">
                <div className="arh"><span className="nm">Insured · fresh damage</span><span className="ct">64 · 45%</span></div>
                <div className="audbar"><i style={{ width: "45%" }} /></div>
                <div className="ang"><b>Angle:</b> free inspection now, we coordinate the whole insurance claim</div>
              </div>
              <div className="audrow">
                <div className="arh"><span className="nm">Aging roof · out-of-pocket</span><span className="ct">41 · 29%</span></div>
                <div className="audbar"><i style={{ width: "29%" }} /></div>
                <div className="ang"><b>Angle:</b> workmanship warranty + a clear, no-pressure estimate</div>
              </div>
              <div className="audrow">
                <div className="arh"><span className="nm">Property manager · multi-unit</span><span className="ct">37 · 26%</span></div>
                <div className="audbar"><i style={{ width: "26%" }} /></div>
                <div className="ang"><b>Angle:</b> fast local crews to inspect every building before the next storm</div>
              </div>
            </div>
            <div className="audsec">
              <div className="ah">Why they haven&apos;t booked yet</div>
              <div className="audrow"><div className="arh"><span className="nm">No inspection booked since the storm</span><span className="ct">142</span></div><div className="audbar"><i className="soft" style={{ width: "100%" }} /></div></div>
              <div className="audrow"><div className="arh"><span className="nm">Unsure if the damage is claim-worthy</span><span className="ct">89</span></div><div className="audbar"><i className="soft" style={{ width: "63%" }} /></div></div>
              <div className="audrow"><div className="arh"><span className="nm">Worried about out-of-pocket cost</span><span className="ct">71</span></div><div className="audbar"><i className="soft" style={{ width: "50%" }} /></div></div>
              <div className="audrow"><div className="arh"><span className="nm">Waiting on their insurance adjuster</span><span className="ct">34</span></div><div className="audbar"><i className="soft" style={{ width: "24%" }} /></div></div>
            </div>
            <button className="canvaslink" style={{ marginTop: 4 }} data-soon="Reviewing lookalike homes is coming soon">
              <span className="cli">{Ico.people}</span>
              <span className="clt">
                <span className="clh">58 lookalike homes found</span>
                <span className="cls">Same storm swath + roof profile as your best past jobs — not yet in the segment</span>
              </span>
              <span className="go">Review {Ico.arrow}</span>
            </button>
            <div className="recall" style={{ marginTop: 18 }}>
              <span className="lbl">{Ico.brain}Recalled from memory</span>
              <button className="mchip" data-soon="Memory recall is coming soon">Storm-zone persona angles <span className="conf">91%</span></button>
            </div>
          </div>
        )}

        <div className="cvfoot">
          <button className="btn app" data-soon="Approving assets is coming soon">{Ico.check}Approve all ready</button>
          <button className="btn ghost sm" data-soon="Requesting a revision is coming soon">{Ico.pencil}Revise</button>
          <span className="lock">{Ico.lock}2 ready · 1 generating · 1 blocked</span>
        </div>
      </section>

      {shareOpen ? <ShareDialog conversationId={activeConversationId} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}

function renderStage(id: string) {
  if (id === "email") {
    return (
      <>
        <div className="emailframe">
          <div className="emhead">
            <div className="emrow"><span className="eml">From</span><b>Big Shoulders Restoration</b></div>
            <div className="emrow"><span className="eml">Subj</span><b>We inspected 142 roofs after the Naperville storm — yours may be next</b></div>
          </div>
          <div className="embody">Hi {"{first_name}"}, the June 14 hailstorm hit your block harder than most. We&apos;re offering storm-zone homeowners a free, no-pressure roof inspection this week — and if there&apos;s claimable damage, we coordinate the whole insurance process for you. Two spots left near you Thursday.</div>
        </div>
        <div className="insp">
          <div className="ih">Provenance</div>
          <div className="provgrid">
            <div className="pr"><span className="pk">Source</span><span className="pv">Storm-response playbook</span></div>
            <div className="pr"><span className="pk">Model</span><span className="pv">Opus 4.8 · Draft</span></div>
            <div className="pr"><span className="pk">Persona</span><span className="pv">Insured · fresh damage</span></div>
            <div className="pr"><span className="pk">Format</span><span className="pv">Email · HTML</span></div>
          </div>
        </div>
        <Guards ok={4} />
      </>
    );
  }
  if (id === "sms") {
    return (
      <>
        <div className="smsframe">
          <div className="smsbubble">Hi {"{first_name}"} — it&apos;s the BSR crew. After last week&apos;s Naperville hail we&apos;re checking roofs on your street, no charge and no pressure. Want us to swing by and take a look? Reply YES and we&apos;ll find a time.</div>
          <div className="smsmeta">152 characters · 1 segment · warmer register</div>
        </div>
        <div className="insp">
          <div className="ih">Provenance</div>
          <div className="provgrid">
            <div className="pr"><span className="pk">Source</span><span className="pv">Storm-response playbook</span></div>
            <div className="pr"><span className="pk">Model</span><span className="pv">Opus 4.8 · Draft</span></div>
            <div className="pr"><span className="pk">Persona</span><span className="pv">Aging roof · out-of-pocket</span></div>
            <div className="pr"><span className="pk">Format</span><span className="pv">SMS · 152 chars</span></div>
          </div>
        </div>
        <Guards ok={4} />
      </>
    );
  }
  if (id === "lp") {
    return (
      <>
        <div className="lpblock">Landing page is blocked — waiting on the CTA decision above before Arc drafts the hero.</div>
        <div className="lpframe">
          <div className="lphero">
            <span className="lpkick">Naperville storm zone</span>
            <span className="lph">Free roof inspection for storm-hit homes</span>
            <span className="lpsub">We&apos;ve already inspected 142 roofs on your side of town. See if yours has claimable damage before the next storm.</span>
            <span className="lpcta">Book a free inspection</span>
          </div>
          <div className="lprows"><span /><span className="short" /><span /></div>
        </div>
        <Guards ok={2} pend={2} />
      </>
    );
  }
  // paid-social ad (generating)
  return (
    <>
      <div className="stagemedia gen">
        <div className="adcreative">
          <div className="scene" />
          <div className="horizon" />
          <div className="scrim" />
          <div className="adlogo"><b />BSR</div>
          <div className="adhl">Naperville got hit. Your roof deserves a look.</div>
          <div className="adcta">Book a free inspection</div>
        </div>
        <span className="prov"><i />Approved BSR field photo · composite</span>
      </div>
      <div className="stagebar"><i style={{ width: "68%" }} /></div>
      <div className="stagesubj"><span className="lab">Primary text</span>142 homes near you took the worst of the hail. We&apos;ll inspect yours free — and handle the claim if there&apos;s damage.</div>
      <div className="insp">
        <div className="ih">Provenance</div>
        <div className="provgrid">
          <div className="pr"><span className="pk">Source</span><span className="pv">Composite · BSR proof + AI</span></div>
          <div className="pr"><span className="pk">Base photo</span><span className="pv">approved BSR field photo [3]</span></div>
          <div className="pr"><span className="pk">Model</span><span className="pv">Higgsfield</span></div>
          <div className="pr"><span className="pk">Aspect</span><span className="pv">1080×1350 · 4:5</span></div>
        </div>
      </div>
      <div className="insp">
        <div className="ih">Guardrails</div>
        <div className="guards">
          <div className="guard ok"><span className="gi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span>Embedded text legible</div>
          <div className="guard ok"><span className="gi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span>Logo placement</div>
          <div className="guard ok"><span className="gi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span>Claim risk checked</div>
        </div>
      </div>
    </>
  );
}

function Guards({ ok, pend = 0 }: { ok: number; pend?: number }) {
  const labels = ["No embedded text or logo issues", "Scene reads as realistic", "No privacy / redaction risk", "No unsupported claims"];
  return (
    <div className="guards">
      {labels.map((l, i) => {
        const isOk = i < ok;
        return (
          <div key={l} className={`guard${isOk ? " ok" : " pend"}`}>
            <span className="gi">{isOk ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v6l4 2" /></svg>}</span>
            {l}{!isOk && pend > 0 ? " — checking…" : ""}
          </div>
        );
      })}
    </div>
  );
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Renders a real Arc conversation from persisted `arc_messages`. Reuses the exact
 * markup/classes the mock uses (`.op`, `.arc`, `.trace`, `.mchip`, `.pending`) so
 * a live thread looks identical to the design. An empty thread shows a welcome.
 */
function LiveMessages({ messages, brandName }: { messages: ArcMessage[]; brandName: string }) {
  if (messages.length === 0) {
    return (
      <div className="arc">
        <div className="a"><img src="/brand/arc-mark.png" alt="Arc" /></div>
        <div className="col">
          <div className="body">
            <span className="hero">How can I help, {brandName}?</span>
            Ask me to find leads, draft a campaign, or check a signal — I&rsquo;ll show my work, and nothing goes
            out until you approve it.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {messages.map((m) =>
        m.role === "operator" ? (
          <div className="op" key={m.id}>
            <div className="bub" style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
          </div>
        ) : (
          <div className="arc" key={m.id}>
            <div className="a"><img src="/brand/arc-mark.png" alt="Arc" /></div>
            <div className="col">
              <div className="who"><span className="t">{formatMsgTime(m.createdAt)}</span></div>
              {m.status === "pending" || (m.role === "arc" && !m.body.trim()) ? (
                <div className="pending">
                  <DotRing />
                  <div className="pmeta" role="status" aria-live="polite">
                    <span className="pverb">Arc is working…</span>
                  </div>
                </div>
              ) : (
                <>
                  {(m.reasoning || m.steps.length > 0) && (
                    <details className="trace">
                      <summary>
                        <span className="lead">
                          <span className="cx" aria-hidden="true">{Ico.chevR}</span> Thought
                        </span>
                        {m.steps.length > 0 && <span className="tk">{m.steps.length} steps</span>}
                      </summary>
                      <div className="steps">
                        {m.reasoning && <div className="step">{m.reasoning}</div>}
                        {m.steps.map((s, i) => (
                          <div className="step" key={i}>{s.label}</div>
                        ))}
                      </div>
                    </details>
                  )}
                  <div className="body md-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
                  </div>
                  {m.recall && m.recall.length > 0 && (
                    <div className="recall">
                      <span className="lbl">{Ico.brain}Recalled from memory</span>
                      {m.recall.map((r, i) => (
                        <span className="mchip" key={i}>
                          {r.label}
                          {r.confidence != null && <span className="conf">{Math.round(r.confidence)}%</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.suggestions.length > 0 && (
                    <div className="msgactions">
                      {m.suggestions.map((s, i) => (
                        <button className="ma" key={i} data-soon="Follow-up suggestions are coming soon">{s}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ),
      )}
    </>
  );
}
