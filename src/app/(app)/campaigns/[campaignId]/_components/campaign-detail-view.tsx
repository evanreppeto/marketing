"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  type CampaignMediaAsset,
  type CampaignWorkspaceAsset,
  type CampaignWorkspaceAssetCategory,
  type LiveCampaignWorkspace,
} from "@/lib/campaigns/read-model";
import { LOCKED_CLAIMS, MEASUREMENT_PLAN } from "@/lib/performance/measurement-copy";
import { type CampaignPerformancePanel, type PerformanceTrendPoint } from "@/lib/performance/campaign-panel";

import { ShareDialog } from "../../../_components/share-dialog";
import { decideCampaignAsset, launchCampaignAction, requestCampaignRevision } from "../actions";
import {
  getCampaignSharingStateAction,
  setCampaignSharingAction,
  shareCampaignWithMemberAction,
  unshareCampaignMemberAction,
} from "../../sharing-actions";

const svg = (d: string, cls?: string) => <svg viewBox="0 0 24 24" className={cls} dangerouslySetInnerHTML={{ __html: d }} />;

const CATEGORY_LABEL: Record<CampaignWorkspaceAssetCategory, string> = {
  physical: "Direct & physical",
  virtual: "Email & messaging",
  ads: "Paid & social",
  media: "Creative & media",
  other: "Other deliverables",
};
const CATEGORY_ORDER: CampaignWorkspaceAssetCategory[] = ["virtual", "ads", "physical", "media", "other"];

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Tone = "ok" | "amber" | "red" | "gray" | "blue";

function statusMeta(status: string): { tone: Tone; label: string } {
  const s = (status || "").toLowerCase();
  if (/approved/.test(s)) return { tone: "ok", label: "Approved" };
  if (/declined|rejected/.test(s)) return { tone: "red", label: "Declined" };
  if (/archived/.test(s)) return { tone: "gray", label: "Archived" };
  if (/revision/.test(s)) return { tone: "amber", label: "Revision requested" };
  if (/live|sent|deployed/.test(s)) return { tone: "blue", label: "Live" };
  if (/pending|review|compliance/.test(s)) return { tone: "amber", label: "Needs review" };
  return { tone: "gray", label: status ? status.replace(/[_-]+/g, " ") : "Draft" };
}

// A deliverable still accepts a decision until it's approved, archived, or live.
function isActionable(status: string): boolean {
  return !/approved|archived|live|sent|deployed/i.test(status || "");
}

function lifecycleTone(lifecycle: string): Tone {
  if (lifecycle === "Live") return "blue";
  if (lifecycle === "Ready") return "ok";
  if (lifecycle === "In review") return "amber";
  return "gray";
}

function MediaTile({ media }: { media: CampaignMediaAsset }) {
  const bg = media.thumbnailUrl || (media.type === "image" ? media.url : null);
  return (
    <div className="mediatile" style={bg ? { backgroundImage: `url(${bg})` } : undefined}>
      <div className="mtscrim" />
      <span className={`mtbadge ${media.origin === "generated" ? "ai" : "real"}`}>
        {media.origin === "generated" ? "AI" : media.type}
      </span>
      <span className="mttitle">{media.title}</span>
    </div>
  );
}

const NUM = new Intl.NumberFormat("en-US");
const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Compact revenue-over-time area chart. Static (no animation) per the restrained
// motion posture; scales to its container via a non-uniform viewBox.
function TrendChart({ points }: { points: PerformanceTrendPoint[] }) {
  const W = 680;
  const H = 132;
  const PAD = 8;
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const x = (i: number) => PAD + i * stepX;
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.revenue).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${(H - PAD).toFixed(1)} L${x(0).toFixed(1)} ${(H - PAD).toFixed(1)} Z`;

  return (
    <div className="ptrend">
      <div className="ptcap">
        <span>Marketing-attributed revenue</span>
        <b>{USD0.format(total)}</b>
      </div>
      <svg className="ptsvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ptfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ptfill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="ptaxis">
        <span>{points[0]?.week}</span>
        <span>{points[points.length - 1]?.week}</span>
      </div>
    </div>
  );
}

function PerformancePanel({ panel, lifecycle }: { panel: CampaignPerformancePanel; lifecycle: string }) {
  if (panel.status === "measuring") {
    return (
      <div>
        <div className="csec">
          <h3 className="csh">
            Performance <span className="est">Measurement plan</span>
          </h3>
          <p className="empty-note" style={{ marginBottom: 4 }}>{panel.message}</p>
          <div className="mplan">
            {MEASUREMENT_PLAN.map((m) => (
              <div className="mprow" key={m.area}>
                <div className="mpk">
                  <span className="mparea">{m.area}</span>
                  <span className="pill amber"><span className="pd" />{m.currentSignal}</span>
                </div>
                <div className="mpq">{m.question}</div>
                <div className="mpn">{m.nextStep}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="csec">
          <h3 className="csh">What stays locked until data is attached</h3>
          <div className="lockgrid">
            {LOCKED_CLAIMS.map((c) => (
              <div className="lockcard" key={c.title}>
                <div className="lockt">
                  {svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>')}
                  {c.title}
                </div>
                <div className="lockd">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const funnelMax = Math.max(1, ...panel.funnel.map((f) => f.count));

  return (
    <div>
      <div className="csec">
        <h3 className="csh">
          Performance
          <span className={`est ${panel.source === "demo" ? "" : "live"}`}>
            {panel.source === "demo" ? "Illustrative" : "Attributed"} · {panel.windowLabel}
          </span>
        </h3>
        <div className="perfkpis">
          {panel.kpis.map((k) => (
            <div className="pkpi" key={k.key}>
              <div className="pkl">{k.label}</div>
              <div className="pkv">{k.value}</div>
              <div className="pkh">
                {k.delta && <span className={`pkd ${k.deltaTone ?? "neutral"}`}>{k.delta}</span>}
                {k.hint}
              </div>
            </div>
          ))}
        </div>
        <p className="perfnote">{panel.note}</p>
      </div>

      {panel.trend.length > 1 && (
        <div className="csec">
          <h3 className="csh">Revenue over time <span className="cgc">{panel.windowLabel}</span></h3>
          <TrendChart points={panel.trend} />
        </div>
      )}

      {panel.funnel.length > 0 && (
        <div className="csec">
          <h3 className="csh">Funnel</h3>
          <div className="pfunnel">
            {panel.funnel.map((f) => (
              <div className="pfrow" key={f.label}>
                <span className="pfl">{f.label}</span>
                <div className="pfbar"><i style={{ width: `${Math.round((f.count / funnelMax) * 100)}%` }} /></div>
                <span className="pfc">{NUM.format(f.count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel.channels.length > 0 && (
        <div className="csec">
          <h3 className="csh">By channel</h3>
          <div className="pchan">
            <div className="pchead">
              <span>Channel</span><span>Leads</span><span>Booked</span><span>Revenue</span><span>Spend</span>
            </div>
            {panel.channels.map((c) => (
              <div className="pcrow" key={c.channel}>
                <span className="pcname">{c.channel}<i className="pcshare" style={{ width: `${c.share}%` }} /></span>
                <span>{NUM.format(c.leads)}</span>
                <span>{NUM.format(c.booked)}</span>
                <span>{c.revenue}</span>
                <span className="pcspend">{c.spend}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel.assets.length > 0 && (
        <div className="csec">
          <h3 className="csh">Asset performance <span className="est">Provenance-tagged</span></h3>
          <div className="passets">
            <div className="pahead">
              <span>Asset</span><span>Source</span><span>Status</span><span>Impr.</span><span>Clicks</span><span>Leads</span><span>CTR</span>
            </div>
            {panel.assets.map((a) => {
              const meta = statusMeta(a.status);
              return (
                <div className="parow" key={a.id}>
                  <span className="paname">
                    <b>{a.title}</b>
                    <i>{a.channel} · {a.format}</i>
                  </span>
                  <span><span className={`prov ${provTone(a.source)}`}>{a.source}</span></span>
                  <span><span className={`pill ${meta.tone}`}><span className="pd" />{meta.label}</span></span>
                  <span className="panum">{NUM.format(a.impressions)}</span>
                  <span className="panum">{NUM.format(a.clicks)}</span>
                  <span className="panum">{NUM.format(a.leads)}</span>
                  <span className="panum">{a.ctr}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lifecycle !== "Live" && (
        <p className="empty-note">
          This campaign isn&apos;t live yet — figures reflect attribution to date. No sending, spending, or publishing runs without explicit approval.
        </p>
      )}
    </div>
  );
}

// Provenance badge tone — mirrors the asset-review posture (real BSR media vs AI vs composite).
function provTone(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("real")) return "real";
  if (s.includes("ai")) return "ai";
  if (s.includes("composite")) return "composite";
  return "stock";
}

export function CampaignDetailView({ detail, performance }: { detail: LiveCampaignWorkspace; performance: CampaignPerformancePanel }) {
  const { campaign, launchState, executiveOverview, reasoning, sources, approvalHistory, media } = detail;
  const [assets, setAssets] = useState<CampaignWorkspaceAsset[]>(detail.assets);
  const [tab, setTab] = useState("deliverables");
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [reviseText, setReviseText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [launchErr, setLaunchErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const persona = humanizePersona(campaign.persona);
  const renderableMediaList = media.filter((m) => m.origin !== "referenced");

  // Re-group the (locally owned) assets so optimistic status changes reflect live.
  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: assets.filter((a) => a.category === cat) })).filter((g) => g.items.length > 0);

  function setAssetStatus(assetId: string, status: string) {
    setAssets((as) => as.map((a) => (a.id === assetId ? { ...a, status, approval: a.approval ? { ...a.approval, status } : a.approval } : a)));
  }

  function decide(asset: CampaignWorkspaceAsset, decision: "approved" | "declined" | "archived") {
    if (pending) return;
    setErr(null);
    const prev = asset.status;
    setAssetStatus(asset.id, decision);
    startTransition(async () => {
      const res = await decideCampaignAsset(campaign.id, asset.id, decision);
      if (!res.ok) {
        setAssetStatus(asset.id, prev);
        setErr(res.error);
      }
    });
  }

  function submitRevision(asset: CampaignWorkspaceAsset) {
    const instruction = reviseText.trim();
    if (!instruction || pending) return;
    setErr(null);
    const prev = asset.status;
    setAssetStatus(asset.id, "revision_requested");
    setReviseFor(null);
    setReviseText("");
    startTransition(async () => {
      const res = await requestCampaignRevision(campaign.id, asset.id, instruction);
      if (!res.ok) {
        setAssetStatus(asset.id, prev);
        setErr(res.error);
      }
    });
  }

  function doLaunch() {
    if (pending) return;
    setErr(null);
    setLaunchErr(null);
    startTransition(async () => {
      const res = await launchCampaignAction(campaign.id);
      if (!res.ok) {
        setLaunchErr(res.error);
        return;
      }
      // launchCampaignAction revalidates this path; the server re-renders with
      // launch_locked cleared, so the launch control unmounts on its own.
      setConfirmLaunch(false);
    });
  }

  const TABS: Array<[string, string]> = [
    ["deliverables", `Deliverables`],
    ["overview", "Overview"],
    ["performance", "Performance"],
    ["sources", "Sources"],
    ["history", "History"],
  ];

  return (
    <div className="arc-campaign">
      <div className="cband">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link className="back" href="/campaigns">
            {svg('<path d="M15 5l-7 7 7 7"/>')}
            Back to Campaigns
          </Link>
          <button className="cbtn" style={{ marginLeft: "auto" }} onClick={() => setShareOpen(true)} aria-label="Share this campaign">
            {svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>')}
            Share
          </button>
        </div>
        <div className="crow">
          <div className="cmain">
            <h1 className="cname">{campaign.name}</h1>
            <div className="csub">{campaign.objective || campaign.audienceSummary}</div>
            <div className="cchips">
              {persona && (
                <span className="chip persona">
                  <span className="pgd" />
                  {persona}
                </span>
              )}
              <span className={`pill ${lifecycleTone(launchState.lifecycle)}`}>
                <span className="pd" />
                {launchState.lifecycle}
              </span>
              {campaign.owner && (
                <span className="chip ghost">
                  {svg('<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>', "gi")}
                  {campaign.owner}
                </span>
              )}
              {campaign.launchLocked && (
                <span className="chip ghost">
                  {svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', "gi")}
                  Outbound locked
                </span>
              )}
            </div>
          </div>
          <div className="cstate">
            <div className="csrow">
              <span className="csv">{launchState.approvedCount}</span>
              <span className="csk">of {launchState.requiredCount} approved</span>
            </div>
            <div className="cstrack">
              <i style={{ width: `${launchState.requiredCount ? Math.round((launchState.approvedCount / launchState.requiredCount) * 100) : 0}%` }} />
            </div>
            <div className="csmeta">
              {launchState.pendingCount} pending · {launchState.deployedCount} live
            </div>
          </div>
        </div>
      </div>

      <div className="ctabs">
        {TABS.map(([key, label]) => (
          <div key={key} className={`ctab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
            {label}
            {key === "deliverables" && <span className="cnt">{assets.length}</span>}
          </div>
        ))}
      </div>

      <div className="cbody">
        <div className="cscroll">
          {err && (
            <p className="cerr">{err}</p>
          )}

          {tab === "deliverables" &&
            (grouped.length === 0 ? (
              <p className="empty-note">No deliverables yet. Arc drafts approval-gated pieces here as it builds the package.</p>
            ) : (
              grouped.map(({ cat, items }) => (
                <div className="csec" key={cat}>
                  <h3 className="csh">
                    {CATEGORY_LABEL[cat]} <span className="cgc">{items.length}</span>
                  </h3>
                  {items.map((asset) => {
                    const meta = statusMeta(asset.status);
                    const actionable = isActionable(asset.status);
                    const assetMedia = asset.media.filter((m) => m.origin !== "referenced");
                    return (
                      <div className="deliver" key={asset.id}>
                        <div className="dhead">
                          <div className="dtitle">{asset.title}</div>
                          <span className={`pill ${meta.tone}`}>
                            <span className="pd" />
                            {meta.label}
                          </span>
                        </div>
                        <div className="dmeta">
                          {asset.channel && <span>{asset.channel}</span>}
                          {asset.toolSource && <span>· {asset.toolSource}</span>}
                          <span>· updated {fmtDate(asset.updatedAt)}</span>
                        </div>
                        {asset.preview && <div className="dbody">{asset.preview}</div>}
                        {assetMedia.length > 0 && (
                          <div className="mediagrid">
                            {assetMedia.map((m) => (
                              <MediaTile key={m.id} media={m} />
                            ))}
                          </div>
                        )}
                        {asset.revision && (
                          <div className="revnote">
                            <b>Revised by Arc.</b> Latest reflects your last request.
                          </div>
                        )}
                        {asset.complianceNotes && <div className="dcompliance">Guardrail: {asset.complianceNotes}</div>}

                        {reviseFor === asset.id ? (
                          <div className="revbox">
                            <textarea
                              value={reviseText}
                              onChange={(e) => setReviseText(e.target.value)}
                              placeholder="Tell Arc what to change…"
                              rows={2}
                              disabled={pending}
                            />
                            <div className="revactions">
                              <button className="cbtn ghost" onClick={() => { setReviseFor(null); setReviseText(""); }} disabled={pending}>
                                Cancel
                              </button>
                              <button className="cbtn gold" onClick={() => submitRevision(asset)} disabled={pending || !reviseText.trim()}>
                                Send to Arc
                              </button>
                            </div>
                          </div>
                        ) : actionable ? (
                          <div className="dctrls">
                            <button className="cbtn gold" onClick={() => decide(asset, "approved")} disabled={pending}>
                              {svg('<path d="M5 12l4 4L19 6"/>')}
                              Approve
                            </button>
                            <button className="cbtn ghost" onClick={() => setReviseFor(asset.id)} disabled={pending}>
                              {svg('<path d="M4 7h16M4 12h10M4 17h7"/>')}
                              Request revision
                            </button>
                            <button className="cbtn danger" onClick={() => decide(asset, "declined")} disabled={pending}>
                              Decline
                            </button>
                          </div>
                        ) : (
                          <div className="ddecided">
                            {meta.label}
                            {asset.dispatchLocked && " · outbound stays locked until launch"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ))}

          {tab === "overview" && (
            <div>
              <div className="csec">
                <h3 className="csh">The brief</h3>
                <div className="brief">
                  {([
                    ["What", executiveOverview.what],
                    ["Why now", executiveOverview.why],
                    ["Who", campaign.audienceSummary],
                    ["Offer", campaign.offerSummary],
                    ["Where", executiveOverview.where],
                    ["Timeframe", executiveOverview.timeframe],
                    ["Success tracking", executiveOverview.successTracking],
                  ] as Array<[string, string]>)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div className="briefrow" key={k}>
                        <div className="bk">{k}</div>
                        <div className="bv">{v}</div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="csec">
                <h3 className="csh">Why Arc built this <span className="est">Arc reasoning</span></h3>
                <div className="card">
                  {reasoning.whyBuilt && <p className="rbody">{reasoning.whyBuilt}</p>}
                  {reasoning.recommendedAction && (
                    <p className="rbody">
                      <b>Recommended:</b> {reasoning.recommendedAction}
                    </p>
                  )}
                  {reasoning.guardrailFlags.length > 0 && (
                    <div className="flags">
                      {reasoning.guardrailFlags.map((f) => (
                        <span className="flag" key={f}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {reasoning.toolsUsed.length > 0 && <div className="tools">Tools · {reasoning.toolsUsed.join(", ")}</div>}
                </div>
              </div>
            </div>
          )}

          {tab === "performance" && <PerformancePanel panel={performance} lifecycle={launchState.lifecycle} />}

          {tab === "sources" && (
            <div className="csec">
              <h3 className="csh">Source-backed evidence</h3>
              {sources.length === 0 ? (
                <p className="empty-note">No sources attached yet.</p>
              ) : (
                sources.map((s) =>
                  s.recordHref ? (
                    <Link className="srcrow" key={s.id} href={s.recordHref}>
                      <span className="srck">{s.kind}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="srct">{s.label}</div>
                        <div className="srcd">{s.detail}</div>
                      </div>
                      <span className="go">→</span>
                    </Link>
                  ) : (
                    <a className="srcrow" key={s.id} href={s.url ?? undefined} target={s.url ? "_blank" : undefined} rel="noreferrer">
                      <span className="srck">{s.kind}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="srct">{s.label}</div>
                        <div className="srcd">{s.detail}</div>
                      </div>
                      {s.url && <span className="go">↗</span>}
                    </a>
                  ),
                )
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="csec">
              <h3 className="csh">Approval history</h3>
              {approvalHistory.length === 0 ? (
                <p className="empty-note">No decisions recorded yet. Approvals, declines, and revision requests land here.</p>
              ) : (
                approvalHistory.map((h) => (
                  <div className="hist" key={h.id}>
                    <span className={`tdot ${h.tone === "green" ? "task" : h.tone === "red" ? "" : "status"}`} style={h.tone === "red" ? { background: "var(--red)" } : undefined} />
                    <div>
                      <div className="ht">
                        {h.action} <span className="by">· {h.decidedBy}</span>
                      </div>
                      <div className="hd">{h.itemTitle}</div>
                      {h.notes && <div className="hd">“{h.notes}”</div>}
                      <div className="hts">{fmtDate(h.at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <aside className="csnap">
          <div className="snsec">
            <h3 className="snh">Launch readiness</h3>
            <div className="lstate">
              <div className={`lpill ${lifecycleTone(launchState.lifecycle)}`}>{launchState.lifecycle}</div>
              <div className="lrow">
                <span>Approved</span>
                <b>{launchState.approvedCount}</b>
              </div>
              <div className="lrow">
                <span>Pending</span>
                <b>{launchState.pendingCount}</b>
              </div>
              <div className="lrow">
                <span>Required</span>
                <b>{launchState.requiredCount}</b>
              </div>
              <div className="lnote">
                {launchState.ready
                  ? "Every gating piece is approved. Launch is a separate, explicit step."
                  : "Approve the remaining deliverables to make this campaign launch-ready."}
              </div>
            </div>

            {campaign.launchLocked && (
              <div className="lctrl">
                {launchErr && <div className="cerr" style={{ margin: 0 }}>{launchErr}</div>}
                {confirmLaunch ? (
                  <>
                    <button className="cbtn gold" onClick={doLaunch} disabled={pending}>
                      {svg('<path d="M5 12l4 4L19 6"/>')}
                      {pending ? "Launching…" : "Confirm launch"}
                    </button>
                    <button className="cbtn ghost" onClick={() => setConfirmLaunch(false)} disabled={pending}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="cbtn gold"
                    onClick={() => { setErr(null); setLaunchErr(null); setConfirmLaunch(true); }}
                    disabled={!launchState.ready || pending}
                    title={launchState.ready ? undefined : "Approve every gating deliverable first"}
                  >
                    {svg('<path d="M3 12l18-8-8 18-2-7z"/>')}
                    Launch campaign
                  </button>
                )}
                <div className="lchint">
                  Launching unlocks approved deliverables for dispatch and opens the Outbox. Nothing sends automatically — you confirm each send there.
                </div>
              </div>
            )}
          </div>

          {renderableMediaList.length > 0 && (
            <div className="snsec">
              <h3 className="snh">Creative</h3>
              <div className="mediagrid">
                {renderableMediaList.slice(0, 4).map((m) => (
                  <MediaTile key={m.id} media={m} />
                ))}
              </div>
            </div>
          )}

          <div className="snsec">
            <h3 className="snh">Package</h3>
            <div className="glance">
              <div className="gl">
                <span className="gk">Deliverables</span>
                <span className="gv">{detail.metrics.assets}</span>
              </div>
              <div className="gl">
                <span className="gk">Creative</span>
                <span className="gv">{detail.metrics.media}</span>
              </div>
              <div className="gl">
                <span className="gk">Sources</span>
                <span className="gv">{detail.metrics.sources}</span>
              </div>
              <div className="gl">
                <span className="gk">Focus</span>
                <span className="gv">{campaign.restorationFocus || "—"}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {shareOpen ? (
        <ShareDialog
          subjectId={campaign.id}
          subjectNoun="campaign"
          onClose={() => setShareOpen(false)}
          load={getCampaignSharingStateAction}
          onSetVisibility={(id, visibility, permission) => setCampaignSharingAction({ campaignId: id, visibility, workspacePermission: permission })}
          onAdd={(id, userId, permission) => shareCampaignWithMemberAction({ campaignId: id, userId, permission }).then(() => {})}
          onRemove={(id, userId) => unshareCampaignMemberAction({ campaignId: id, userId }).then(() => {})}
        />
      ) : null}
    </div>
  );
}
