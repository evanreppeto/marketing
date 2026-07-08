"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createCampaign, type NewCampaignInput } from "../actions";
import { NewCampaignModal } from "./new-campaign-modal";

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

// --- Optimistic row for a just-created campaign (mirrors page.tsx derivations) ---
function personaLabelOf(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
function personaDotOf(persona: string): string {
  const p = (persona || "").toLowerCase();
  if (/storm|hail|weather|damage/.test(p)) return "#7fb89a";
  if (/property|manager|realtor|hoa|commercial/.test(p)) return "#c8a24a";
  if (/insurance|adjuster/.test(p)) return "#88b6d8";
  if (/past|repeat|existing|customer|reactivation/.test(p)) return "#9678c8";
  return "#c8a24a";
}
function buildOptimisticCampaign(id: string, v: NewCampaignInput): CampaignRow {
  const audience = personaLabelOf(v.persona);
  return {
    id,
    name: v.name,
    brief: v.restorationFocus || "Campaign package",
    tone: "draft",
    statusLabel: "Draft",
    next: "Draft in progress",
    nextTone: "",
    audience,
    dot: personaDotOf(v.persona || audience),
    channels: "",
    updatedRel: "now",
    updatedAbs: "",
    href: `/campaigns/${id}`,
  };
}

export function CampaignsBoard({
  rows,
  arcNote,
}: {
  rows: CampaignRow[];
  arcNote: string;
}) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  // Draft rows created this session, shown until a real write revalidates.
  const [localRows, setLocalRows] = useState<CampaignRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const allRows = useMemo(() => [...localRows, ...rows], [localRows, rows]);

  const counts = useMemo(() => {
    const by = (fn: (t: CampaignTone) => boolean) => allRows.filter((r) => fn(r.tone)).length;
    return {
      all: allRows.length,
      needs: by((t) => t === "review" || t === "revise"),
      live: by((t) => t === "live"),
      approved: by((t) => t === "approved"),
      draft: by((t) => t === "draft"),
      archived: by((t) => t === "archived"),
    } as Record<string, number>;
  }, [allRows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!inTab(r.tone, tab)) return false;
      if (needle && !`${r.name} ${r.brief} ${r.audience}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [allRows, tab, q]);

  // Create a campaign: when it persists, jump into the new draft's detail page;
  // offline it drops in an optimistic draft row and stays on the board. Failures
  // surface an error and keep the modal open.
  const handleCreate = async (value: NewCampaignInput): Promise<{ ok: boolean; error?: string }> => {
    setError(null);
    const res = await createCampaign(value);
    if (!res.ok) {
      setError(res.error);
      return { ok: false, error: res.error };
    }
    if (res.persisted && res.href) {
      router.push(res.href);
      return { ok: true };
    }
    const tempId = `local-${crypto.randomUUID()}`;
    setLocalRows((prev) => [buildOptimisticCampaign(tempId, value), ...prev]);
    return { ok: true };
  };

  return (
    <div className="arc-grid arc-campaigns">
      <div className="chrow">
        <div>
          <h1 className="ct">Campaigns</h1>
          <div className="csub">
            {allRows.length} {allRows.length === 1 ? "package" : "packages"} · approval-gated · drafted by Arc
          </div>
        </div>
        <div className="sp">
          <span className="gbtn" data-soon="Campaign templates are coming soon">
            <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="M4 9h16M9 5v14" /></svg>
            Templates
          </span>
          <button type="button" className="gbtn gold" onClick={() => setNewOpen(true)}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            New campaign
          </button>
        </div>
      </div>

      {error && (
        <div className="crm-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

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
        <span className="fbtn" data-soon="Sorting is coming soon">
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
                <tr
                  key={r.id}
                  className={r.id.startsWith("local-") ? "freshrow" : undefined}
                  onClick={() => {
                    // Optimistic (unsaved) drafts have no live detail page yet.
                    if (!r.id.startsWith("local-")) window.location.href = r.href;
                  }}
                >
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

      <NewCampaignModal
        key={newOpen ? "open" : "closed"}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
