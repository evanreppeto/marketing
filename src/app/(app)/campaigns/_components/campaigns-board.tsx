"use client";

import { useMemo, useState } from "react";

export type CampaignTone = "live" | "review" | "revise" | "approved" | "draft" | "archived";

export type CampaignRow = {
  id: string;
  name: string;
  brief: string;
  tone: CampaignTone;
  statusLabel: string;
  next: string;
  nextTone: "" | "go" | "warn";
  audience: string;
  dot: string;
  channels: string;
  updatedRel: string;
  updatedAbs: string;
  href: string;
};

const CampIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <path d="M4 5h16v6H4z" />
    <path d="M4 15h10v4H4z" />
  </svg>
);

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs approval" },
  { key: "live", label: "Live" },
  { key: "approved", label: "Approved" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

function inTab(tone: CampaignTone, tab: string): boolean {
  if (tab === "all") return true;
  if (tab === "needs") return tone === "review" || tone === "revise";
  return tone === tab;
}

export function CampaignsBoard({
  rows,
  newCampaignHref,
  arcNote,
}: {
  rows: CampaignRow[];
  newCampaignHref: string;
  arcNote: string;
}) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const by = (fn: (t: CampaignTone) => boolean) => rows.filter((r) => fn(r.tone)).length;
    return {
      all: rows.length,
      needs: by((t) => t === "review" || t === "revise"),
      live: by((t) => t === "live"),
      approved: by((t) => t === "approved"),
      draft: by((t) => t === "draft"),
      archived: by((t) => t === "archived"),
    } as Record<string, number>;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inTab(r.tone, tab)) return false;
      if (needle && !`${r.name} ${r.brief} ${r.audience}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, tab, q]);

  return (
    <div className="arc-campaigns">
      <div className="chrow">
        <div>
          <h1 className="ct">Campaigns</h1>
          <div className="csub">
            {rows.length} {rows.length === 1 ? "package" : "packages"} · approval-gated · drafted by Arc
          </div>
        </div>
        <div className="sp">
          <span className="gbtn">
            <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="M4 9h16M9 5v14" /></svg>
            Templates
          </span>
          <a className="gbtn gold" href={newCampaignHref}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            New campaign
          </a>
        </div>
      </div>

      <div className="subtabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`subtab${tab === t.key ? " on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="cnt">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="gtoolbar">
        <span className="tsearch">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter campaigns…"
            aria-label="Filter campaigns"
          />
        </span>
        <span className="gspacer" />
        <span className="fbtn">
          <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          Recently updated <span className="cv">▾</span>
        </span>
      </div>

      <div className="tablewrap">
        <table className="dt">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Next action</th>
              <th>Audience</th>
              <th>Channels</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="emptyrow">
                <td colSpan={6}>No campaigns match this view.</td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} onClick={() => { window.location.href = r.href; }}>
                  <td>
                    <div className="pcell">
                      <span className="pav">{CampIcon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="pnm">{r.name}</div>
                        <div className="psub">{r.brief}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${r.tone}`}>
                      <span className="pd" />
                      {r.statusLabel}
                    </span>
                  </td>
                  <td>
                    <span className={`nx${r.nextTone ? ` ${r.nextTone}` : ""}`}>{r.next}</span>
                  </td>
                  <td>
                    {r.audience ? (
                      <span className="chip persona">
                        <span className="pgd" style={{ background: r.dot }} />
                        {r.audience}
                      </span>
                    ) : (
                      <span className="nx">—</span>
                    )}
                  </td>
                  <td>{r.channels ? <span className="chan">{r.channels}</span> : <span className="nx">—</span>}</td>
                  <td>
                    <span className="last">
                      <b>{r.updatedRel}</b>
                      {r.updatedAbs && <span>{r.updatedAbs}</span>}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="gfoot">
        <span className="arcnote">
          <i />
          {arcNote}
        </span>
        <div className="pager">
          <span className="pgnum">
            {visible.length === 0 ? "0 of 0" : `1–${visible.length} of ${visible.length}`}
          </span>
        </div>
      </div>
    </div>
  );
}
