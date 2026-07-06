"use client";

import { useMemo, useState } from "react";

export type CrmRowVM = {
  id: string;
  name: string;
  detail: string;
  initials: string;
  isCompany: boolean;
  statusLabel: string;
  statusTone: string;
  persona: string;
  dot: string;
  score: number | null;
  scoreColor: string;
  owner: string;
  updatedRel: string;
  href: string;
};

export type CrmObjectVM = {
  key: string;
  label: string;
  noun: string;
  nameHeader: string;
  addLabel: string;
  filterPlaceholder: string;
  count: number;
};

// Record detail still opens the mockup until that screen is ported.
const RECORD_HREF = "/build-crm-record.html";

export function CrmBoard({
  objects,
  rowsByKey,
  defaultKey,
}: {
  objects: CrmObjectVM[];
  rowsByKey: Record<string, CrmRowVM[]>;
  defaultKey: string;
}) {
  const [activeKey, setActiveKey] = useState(defaultKey);
  const [q, setQ] = useState("");

  const active = objects.find((o) => o.key === activeKey) ?? objects[0];
  const totalRows = (rowsByKey[active.key] ?? []).length;

  const visible = useMemo(() => {
    const rows = rowsByKey[active.key] ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.name} ${r.detail} ${r.persona} ${r.owner}`.toLowerCase().includes(needle))
      : rows;
    return filtered.slice(0, 100);
  }, [rowsByKey, active.key, q]);

  return (
    <div className="arc-grid arc-crm">
      <div className="chrow">
        <div>
          <h1 className="ct">{active.label}</h1>
          <div className="csub">
            {active.count.toLocaleString()} {active.noun} · org-scoped · synced with Arc
          </div>
        </div>
        <div className="sp">
          <span className="gbtn">
            <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
            Import
          </span>
          <span className="gbtn">
            <svg viewBox="0 0 24 24"><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3M8 9l4 4 4-4M12 13V3" /></svg>
            Export
          </span>
          <span className="gbtn gold">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            {active.addLabel}
          </span>
        </div>
      </div>

      <div className="subtabs">
        {objects.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`subtab${o.key === activeKey ? " on" : ""}`}
            onClick={() => { setActiveKey(o.key); setQ(""); }}
          >
            {o.label} <span className="cnt">{o.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="gtoolbar">
        <span className="tsearch">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={active.filterPlaceholder}
            aria-label={`Filter ${active.noun}`}
          />
        </span>
        <span className="fbtn">
          <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /></svg>
          Persona <span className="cv">▾</span>
        </span>
        <span className="fbtn">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>
          Status <span className="cv">▾</span>
        </span>
        <span className="fbtn dashed">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Add filter
        </span>
        <span className="gspacer" />
        <span className="fbtn">
          <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          All {active.noun} <span className="cv">▾</span>
        </span>
      </div>

      <div className="tablewrap">
        <table className="dt">
          <thead>
            <tr>
              <th>{active.nameHeader}</th>
              <th>Status</th>
              <th>Persona</th>
              <th>Score</th>
              <th>Owner</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="emptyrow">
                <td colSpan={6}>{totalRows === 0 ? `No ${active.noun} yet.` : "No matches for this filter."}</td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} onClick={() => { window.location.href = RECORD_HREF; }}>
                  <td>
                    <div className="pcell">
                      <span className={`pav${r.isCompany ? " co" : ""}`}>{r.initials}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="pnm">{r.name}</div>
                        {r.detail && <div className="psub">{r.detail}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${r.statusTone}`}>
                      <span className="pd" />
                      {r.statusLabel}
                    </span>
                  </td>
                  <td>
                    {r.persona ? (
                      <span className="chip persona">
                        <span className="pgd" style={{ background: r.dot }} />
                        {r.persona}
                      </span>
                    ) : (
                      <span className="nx">—</span>
                    )}
                  </td>
                  <td>
                    {r.score === null ? (
                      <span className="nx">—</span>
                    ) : (
                      <span className="scorecell">
                        <b>{r.score}</b>
                        <span className="sbar"><i style={{ width: `${r.score}%`, background: r.scoreColor }} /></span>
                      </span>
                    )}
                  </td>
                  <td><span className="nx">{r.owner}</span></td>
                  <td>
                    <span className="last">
                      <b>{r.updatedRel}</b>
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
          Arc keeps {active.noun} enriched and lead scores current
        </span>
        <div className="pager">
          <span className="pgnum">
            {visible.length === 0 ? "0" : `1–${visible.length}`} of {active.count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
