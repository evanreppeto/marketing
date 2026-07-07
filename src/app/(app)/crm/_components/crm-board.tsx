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
  updatedTime: string;
  href: string;
  company: string;
  value: string;
  tier: string;
  routing: string;
  tasks: string;
};

// Per-object columns, verbatim from build-crm.html's COLS config.
type Col = { k: string; t?: string };
const COLS: Record<string, Col[]> = {
  contacts: [{ k: "sel" }, { k: "primary", t: "Contact" }, { k: "company", t: "Company" }, { k: "persona", t: "Persona" }, { k: "status", t: "Status" }, { k: "last", t: "Last activity" }, { k: "tasks", t: "Tasks" }, { k: "act" }],
  companies: [{ k: "sel" }, { k: "primary", t: "Company" }, { k: "persona", t: "Persona" }, { k: "status", t: "Status" }, { k: "tier", t: "Tier" }, { k: "last", t: "Last activity" }, { k: "act" }],
  properties: [{ k: "sel" }, { k: "primary", t: "Property" }, { k: "persona", t: "Persona" }, { k: "score", t: "Score" }, { k: "status", t: "Status" }, { k: "last", t: "Last activity" }, { k: "act" }],
  leads: [{ k: "sel" }, { k: "primary", t: "Lead" }, { k: "persona", t: "Persona" }, { k: "score", t: "Lead score" }, { k: "status", t: "Status" }, { k: "routing", t: "Routing" }, { k: "last", t: "Received" }, { k: "act" }],
  jobs: [{ k: "sel" }, { k: "primary", t: "Job" }, { k: "status", t: "Status" }, { k: "value", t: "Est. value" }, { k: "last", t: "Scheduled" }, { k: "act" }],
  outcomes: [{ k: "sel" }, { k: "primary", t: "Outcome" }, { k: "status", t: "Status" }, { k: "value", t: "Revenue" }, { k: "last", t: "Closed" }, { k: "act" }],
};

function nx(v: string) {
  return v ? v : "—";
}

function cellClass(k: string) {
  return k === "sel" ? "cselect" : k === "act" ? "cact" : k === "score" ? "cnum" : k === "company" ? "ccompany" : "";
}

const CHECK = (
  <svg viewBox="0 0 24 24">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

function cellContent(k: string, r: CrmRowVM) {
  switch (k) {
    case "primary":
      return (
        <div className="pcell">
          <span className={`pav${r.isCompany ? " co" : ""}`}>{r.initials}</span>
          <div style={{ minWidth: 0 }}>
            <div className="pnm">{r.name}</div>
            {r.detail && <div className="psub">{r.detail}</div>}
          </div>
        </div>
      );
    case "company":
      return <span className="nx">{nx(r.company)}</span>;
    case "persona":
      return r.persona ? (
        <span className="chip persona" style={{ color: r.dot, background: `${r.dot}1e`, borderColor: `${r.dot}59` }}>
          <span className="pgd" style={{ background: r.dot }} />
          {r.persona}
        </span>
      ) : (
        <span className="nx">—</span>
      );
    case "status":
      return (
        <span className={`pill ${r.statusTone}`}>
          <span className="pd" />
          {r.statusLabel}
        </span>
      );
    case "score":
      return r.score === null ? (
        <span className="nx">—</span>
      ) : (
        <span className="scorecell">
          <b>{r.score}</b>
          <span className="sbar"><i style={{ width: `${r.score}%`, background: r.scoreColor }} /></span>
        </span>
      );
    case "last":
      return (
        <span className="last">
          <b>{r.updatedRel}</b>
          {r.updatedTime && <span>{r.updatedTime}</span>}
        </span>
      );
    case "tasks":
      return r.tasks ? <span className="chip">{r.tasks}</span> : <span className="nx">—</span>;
    case "tier":
      return <span className="nx">{nx(r.tier)}</span>;
    case "routing":
      return <span className="nx">{nx(r.routing)}</span>;
    case "value":
      return <span className="nx">{nx(r.value)}</span>;
    case "act":
      return <span className="rowact" aria-hidden>›</span>;
    default:
      return null;
  }
}

export type CrmObjectVM = {
  key: string;
  label: string;
  noun: string;
  nameHeader: string;
  addLabel: string;
  filterPlaceholder: string;
  count: number;
};

// The read-model already builds the real record route (/crm/{objectKey}/{id});
// use it so a row opens the live record graph rather than the old name-only mock.
const recordHref = (r: CrmRowVM) => r.href;

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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const active = objects.find((o) => o.key === activeKey) ?? objects[0];
  const totalRows = (rowsByKey[active.key] ?? []).length;
  const cols = COLS[active.key] ?? COLS.contacts;

  const visible = useMemo(() => {
    const rows = rowsByKey[active.key] ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.name} ${r.detail} ${r.persona} ${r.owner}`.toLowerCase().includes(needle))
      : rows;
    return filtered.slice(0, 100);
  }, [rowsByKey, active.key, q]);

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      if (visible.every((r) => prev.has(r.id))) return new Set();
      return new Set(visible.map((r) => r.id));
    });
  const switchObject = (key: string) => {
    setActiveKey(key);
    setQ("");
    setSelected(new Set());
  };

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
            onClick={() => switchObject(o.key)}
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
        <span className="fbtn">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>
          Owner <span className="cv">▾</span>
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
        <span className="iconf" title="Sort">
          <svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" /></svg>
        </span>
        <span className="iconf" title="Columns">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
        </span>
        <span className="iconf" title="Density">
          <svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
        </span>
      </div>

      <div className={`selbar${selected.size ? " show" : ""}`}>
        <span className="sc">{selected.size} selected</span>
        <span className="sa"><svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>Add to campaign</span>
        <span className="sa"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /></svg>Assign persona</span>
        <span className="sa"><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8M4 12v7a1 1 0 001 1h14" /></svg>Add task</span>
        <span className="sa"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-6.2-8.6" /><path d="M21 4v5h-5" /></svg>Ask Arc to enrich</span>
        <span className="clr" onClick={() => setSelected(new Set())}>Clear</span>
      </div>

      <div className="tablewrap">
        <table className="dt">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.k} className={cellClass(c.k)}>
                  {c.k === "sel" ? (
                    <span
                      className={`ck${allVisibleSelected ? " on" : ""}`}
                      role="checkbox"
                      aria-checked={allVisibleSelected}
                      aria-label="Select all"
                      onClick={toggleAll}
                    >
                      {CHECK}
                    </span>
                  ) : (
                    c.t ?? ""
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="emptyrow">
                <td colSpan={cols.length}>{totalRows === 0 ? `No ${active.noun} yet.` : "No matches for this filter."}</td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} onClick={() => { window.location.href = recordHref(r); }}>
                  {cols.map((c) => (
                    <td key={c.k} className={cellClass(c.k)}>
                      {c.k === "sel" ? (
                        <span
                          className={`ck${selected.has(r.id) ? " on" : ""}`}
                          role="checkbox"
                          aria-checked={selected.has(r.id)}
                          aria-label={`Select ${r.name}`}
                          onClick={(e) => { e.stopPropagation(); toggleRow(r.id); }}
                        >
                          {CHECK}
                        </span>
                      ) : (
                        cellContent(c.k, r)
                      )}
                    </td>
                  ))}
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
          <span className="rpp">
            Rows{" "}
            <select defaultValue="25">
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
          </span>
          <span className="pgnum">
            {visible.length === 0 ? "0" : `1–${visible.length}`} of {active.count.toLocaleString()}
          </span>
          <button className="pgbtn" type="button" aria-label="Previous page">
            <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="pgbtn" type="button" aria-label="Next page">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
