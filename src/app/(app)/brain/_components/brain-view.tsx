"use client";

import { useMemo, useState, useTransition } from "react";

import { decideBrainNode, rebuildBrainMemoryAction } from "../actions";
import { KnowledgeGraph, type GraphEdge, type GraphNode } from "./knowledge-graph";

export type FactVM = {
  id: string;
  kind: string;
  kindLabel: string;
  kindColor: string;
  label: string;
  summary: string;
  trustTier: string;
  confidence: number | null;
  source: string;
  learnedAt: string;
};

export type BrainStat = { label: string; value: number; sub: string; color: string };

export type BrainData = {
  stats: BrainStat[];
  coverageNote: string;
  facts: FactVM[];
  review: FactVM[];
  learned: FactVM[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
};

const IconResync = <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-6.2-8.6" /><path d="M21 4v5h-5" /></svg>;

// Ordered to lead with what Arc knows + governance; the graph visualization is a
// trust/debug view, so it's demoted to last (see docs — the Brain's value to a
// human is reviewing what Arc learned, not the graph eye-candy).
const TABS = [
  { key: "facts", label: "What Arc knows", icon: <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg> },
  { key: "review", label: "Needs review", icon: <svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8M4 12v7a1 1 0 001 1h14" /></svg> },
  { key: "learned", label: "Recently learned", icon: <svg viewBox="0 0 24 24"><path d="M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { key: "web", label: "Knowledge Web", icon: <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="7" r="2.4" /><circle cx="12" cy="17" r="2.4" /><path d="M8 7l8 1M7.5 8l3.5 7M16.5 9l-3.5 6" /></svg> },
];

function tierClass(t: string): string {
  const s = t.toLowerCase();
  if (s === "trusted" || s === "core" || s === "proposed" || s === "observed") return s;
  return "observed";
}

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="src">—</span>;
  return (
    <span className="conf">
      <span className="cbar"><i style={{ width: `${value}%` }} /></span>
      <span className="cn">{value}%</span>
    </span>
  );
}

export function BrainView({ data }: { data: BrainData }) {
  const [tab, setTab] = useState("facts");
  const [rebuilding, startRebuild] = useTransition();
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  const rebuild = () =>
    startRebuild(async () => {
      setRebuildMsg(null);
      const r = await rebuildBrainMemoryAction();
      setRebuildMsg(r.message);
    });
  const [kind, setKind] = useState("all");
  // The review list is interactive (approve/reject the trust gate). Decided nodes
  // drop out immediately; a real write revalidates, offline it stays session-only.
  const [review, setReview] = useState(data.review);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const f of data.facts) if (!seen.has(f.kind)) seen.set(f.kind, { label: f.kindLabel, color: f.kindColor });
    return [...seen.entries()].map(([k, v]) => ({ key: k, ...v }));
  }, [data.facts]);

  const visibleFacts = kind === "all" ? data.facts : data.facts.filter((f) => f.kind === kind);
  const counts: Record<string, number> = { facts: data.facts.length, review: review.length, learned: data.learned.length };

  async function decide(nodeId: string, decision: "approve" | "reject") {
    setError(null);
    setPendingId(nodeId);
    const previous = review;
    setReview((prev) => prev.filter((f) => f.id !== nodeId));
    const res = await decideBrainNode(nodeId, decision);
    setPendingId(null);
    if (!res.ok) {
      setReview(previous);
      setError(res.error);
    }
  }

  // Keep the header "Awaiting review" stat + coverage banner consistent with the
  // live review list (they're derived server-side from the proposed count).
  const stats = data.stats.map((s) => (s.label === "Awaiting review" ? { ...s, value: review.length } : s));

  return (
    <div className="arc-brain">
      <div className="bhead">
        <div className="bh1row">
          <div>
            <h1 className="pt">Brain</h1>
            <div className="psub">Arc&rsquo;s memory — everything it knows about your business, and how it&rsquo;s connected.</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {rebuildMsg ? <span style={{ fontSize: 12, opacity: 0.75 }}>{rebuildMsg}</span> : null}
            <button type="button" className="gbtn" onClick={rebuild} disabled={rebuilding}>
              {IconResync}
              {rebuilding ? "Refreshing…" : "Refresh memory"}
            </button>
          </span>
        </div>
        <div className="bstats">
          {stats.map((s) => (
            <div className="bstat" key={s.label}>
              <div className="sl">{s.label}</div>
              <div className="sv" style={s.color ? { color: s.color } : undefined}>{s.value.toLocaleString()}</div>
              <div className="sd">{s.sub}</div>
            </div>
          ))}
        </div>
        {data.coverageNote && review.length > 0 && (
          <div className="covbanner">
            {IconResync}
            <span className="ct">{data.coverageNote}</span>
          </div>
        )}
      </div>

      <div className="btabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`btab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.icon}
            {t.label}
            {t.key !== "facts" && counts[t.key] > 0 && <span className="cnt">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="bbody">
        {tab === "web" ? (
          data.graphNodes.length === 0 ? (
            <div className="scroll"><div className="inner"><div className="empty">No knowledge graph yet. Arc maps what it learns — facts and their connections — here.</div></div></div>
          ) : (
            <KnowledgeGraph nodes={data.graphNodes} edges={data.graphEdges} />
          )
        ) : (
          <div className="scroll">
          <div className="inner">
            {tab === "facts" && (
              <>
                <h3 className="sh">All facts <span className="tg">wired · listNodes</span></h3>
                {kinds.length > 1 && (
                  <div className="factbar">
                    <button type="button" className={`fchip${kind === "all" ? " on" : ""}`} onClick={() => setKind("all")}>All</button>
                    {kinds.map((k) => (
                      <button key={k.key} type="button" className={`fchip${kind === k.key ? " on" : ""}`} onClick={() => setKind(k.key)}>{k.label}</button>
                    ))}
                  </div>
                )}
                {visibleFacts.length === 0 ? (
                  <div className="empty">No facts yet. Arc records what it learns about your business here.</div>
                ) : (
                  <div className="ftwrap">
                    <table className="ft">
                      <thead>
                        <tr><th>Kind</th><th>Fact</th><th>Trust</th><th>Confidence</th><th>Source</th></tr>
                      </thead>
                      <tbody>
                        {visibleFacts.map((f) => (
                          <tr key={f.id}>
                            <td><span className="kindchip"><span className="d" style={{ background: f.kindColor }} />{f.kindLabel}</span></td>
                            <td>
                              <div className="fact-label">{f.label}</div>
                              {f.summary && <div className="fact-sum">{f.summary}</div>}
                            </td>
                            <td><span className={`tier ${tierClass(f.trustTier)}`}><span className="td" />{f.trustTier}</span></td>
                            <td><Confidence value={f.confidence} /></td>
                            <td><span className="src">{f.source || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "review" && (
              <>
                <h3 className="sh">Awaiting your approval <span className="tg">wired · trust gate</span></h3>
                <p className="lead">Arc proposes brand facts, messaging angles, CTAs, proof points, and audience segments — but they stay <b>proposed</b> and out of all outbound copy until you approve them.</p>
                {error && (
                  <div className="crm-error" role="alert">
                    <span>{error}</span>
                    <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
                      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                )}
                {review.length === 0 ? (
                  <div className="empty">Nothing waiting for review. Proposed facts appear here before they can be used.</div>
                ) : (
                  review.map((f) => (
                    <div className="qcard" key={f.id}>
                      <div className="qtop">
                        <span className="kindchip"><span className="d" style={{ background: f.kindColor }} />{f.kindLabel}</span>
                        <span className={`tier ${tierClass(f.trustTier)}`}><span className="td" />{f.trustTier}</span>
                        <Confidence value={f.confidence} />
                      </div>
                      <div className="qlabel">{f.label}</div>
                      {f.summary && <div className="qbody">{f.summary}</div>}
                      <div className="qmeta">
                        {f.source && <span>Source: {f.source}</span>}
                        <span>Approving moves it to trusted — usable in outbound copy.</span>
                      </div>
                      <div className="qactions">
                        <button type="button" className="qbtn approve" disabled={pendingId === f.id} onClick={() => decide(f.id, "approve")}>
                          <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6" /></svg>
                          {pendingId === f.id ? "Saving…" : "Approve"}
                        </button>
                        <button type="button" className="qbtn reject" disabled={pendingId === f.id} onClick={() => decide(f.id, "reject")}>
                          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {tab === "learned" && (
              <>
                <h3 className="sh">Recently learned <span className="tg">wired · node created_at</span></h3>
                {data.learned.length === 0 ? (
                  <div className="empty">Nothing learned yet. New facts show up here as Arc discovers them.</div>
                ) : (
                  <div className="tline">
                    {data.learned.map((f) => (
                      <div className="tlrow" key={f.id}>
                        <span className="tld" style={{ background: f.kindColor }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="tll">{f.label}</div>
                          <div className="tlk">
                            <span className="kindchip"><span className="d" style={{ background: f.kindColor }} />{f.kindLabel}</span>
                            <span className={`tier ${tierClass(f.trustTier)}`}><span className="td" />{f.trustTier}</span>
                          </div>
                        </div>
                        <span className="tlt">{f.learnedAt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
