import Link from "next/link";

import { listApprovalCards } from "@/lib/approvals/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Home — Arc" };

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function pillTone(a: { status: string; statusLabel: string; riskLevel: string }): "warn" | "red" | "ok" {
  const s = `${a.status} ${a.statusLabel}`.toLowerCase();
  if (s.includes("block") || a.riskLevel === "high") return "red";
  if (s.includes("approv") || s.includes("review") || s.includes("pending")) return "warn";
  return "ok";
}

async function workspaceCounts(orgId: string) {
  const admin = getSupabaseAdminClient();
  const countOf = async (table: string) => {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    return count ?? 0;
  };
  const [campaigns, leads, companies] = await Promise.all([countOf("campaigns"), countOf("leads"), countOf("companies")]);
  return { campaigns, leads, companies };
}

// Recent Arc/system/user activity for the right-column feed (mockup: "Arc activity").
async function recentActivity(orgId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("audit_events")
    .select("summary,action,actor_kind,created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(4);
  return (data ?? []) as { summary: string | null; action: string; actor_kind: string | null; created_at: string }[];
}

export default async function HomePage() {
  // The (app) layout has already resolved + guarded the workspace; this cached
  // read is free.
  const ctx = await getCurrentWorkspaceContext();
  const user = await getSupabaseAuthenticatedUser();
  const firstName = String(user?.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || "there";

  const [c, approvals, campaignList, opportunities, activity] = await Promise.all([
    workspaceCounts(ctx.orgId),
    listApprovalCards({ orgId: ctx.orgId, limit: 5 }).catch(() => []),
    getCampaignWorkspaceList(undefined, "Arc", ctx.orgId).catch(() => ({ status: "unavailable" as const })),
    listOpenOpportunities(undefined, ctx.orgId).catch(() => []),
    recentActivity(ctx.orgId).catch(() => []),
  ]);
  const campaigns = campaignList.status === "live" ? campaignList.campaigns.slice(0, 5) : [];
  const opps = opportunities.slice(0, 4);
  const focal = opps[0] ?? null;
  const approvalCount = campaigns.reduce((sum, camp) => sum + camp.pendingCount, 0) || approvals.length;

  // Right column: source-backed signals (top opportunities) + Arc activity feed.
  const signalLabel: Record<string, string> = { high: "Urgent · watched by Arc", medium: "Watched by Arc", low: "Background signal" };
  const signals = opps.slice(0, 3).map((o) => ({
    title: o.title,
    source: signalLabel[o.urgency] ?? "Source-backed signal",
    time: relativeTime((o as { created_at?: string }).created_at ?? ""),
  }));
  const activityItems = activity.map((a) => ({
    at: relativeTime(a.created_at),
    actor: a.actor_kind === "agent" ? "Arc" : a.actor_kind === "system" ? "System" : "You",
    text: a.summary || a.action.replace(/[._]/g, " "),
  }));

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  const liveCampaigns = campaigns.filter((camp) => /live|active|sending/i.test(camp.status)).length;

  const metrics = [
    { label: "Campaigns", value: c.campaigns },
    { label: "Leads", value: c.leads },
    { label: "Companies", value: c.companies },
  ];

  return (
    <div className="scroll">
      <section className="content">
        <div className="date">{dateLabel}</div>
        <h1 className="greet">
          {greeting}, {firstName}
        </h1>
        <div className="subline">
          {approvals.length} {approvals.length === 1 ? "package" : "packages"} waiting
          <span className="dot">·</span>
          {opps.length} open {opps.length === 1 ? "opportunity" : "opportunities"}
          <span className="dot">·</span>
          {liveCampaigns} live
        </div>

        {focal && (
          <div className="focal">
            <div className="lab">Top opportunity</div>
            <div className="row1">
              <h2>{focal.title}</h2>
              <div className="conf">
                <span className="cl">Confidence</span>
                <span className="track">
                  <span className="fill" style={{ width: `${focal.confidence}%` }} />
                </span>
                <span className="val">{focal.confidence}%</span>
              </div>
            </div>
            <p className="d">{focal.summary}</p>
            <div className="fcta">
              <Link className="btn" href="/build-opportunities.html">Review&nbsp;→</Link>
              <Link className="btn ghost" href="/build-arc-v2.html">Ask Arc to draft it</Link>
            </div>
          </div>
        )}

        <div className="sech">
          <h3>Waiting on you</h3>
          <span className="ct">{approvalCount} to decide</span>
        </div>
        <div className="rule" />
        {approvals.length === 0 ? (
          <p className="empty-note">Nothing needs your approval right now. Arc surfaces drafts here as it prepares them.</p>
        ) : (
          approvals.map((a) => (
            <Link key={a.id} href="/campaigns" className="task">
              <span className={`pill ${pillTone(a)}`}>{a.statusLabel}</span>
              <span className="tt">{a.title}</span>
              <span className="meta">
                {humanizePersona(a.persona) && <span className="chip">{humanizePersona(a.persona)}</span>}
                <span className="ago">{relativeTime(a.submittedAt)}</span>
              </span>
            </Link>
          ))
        )}

        <div className="metrics">
          {metrics.map((m) => (
            <div className="metric" key={m.label}>
              <div className="ml">{m.label}</div>
              <div className="mrow">
                <span className="mv">{m.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sech">
          <h3>Open opportunities</h3>
          <Link className="more" href="/build-opportunities.html">All opportunities →</Link>
        </div>
        {opps.length === 0 ? (
          <p className="empty-note">No open opportunities yet. Arc watches your signals and surfaces source-backed ones here.</p>
        ) : (
          <div className="opps">
            {opps.map((o) => (
              <Link key={o.id} href="/build-opportunities.html" className="opp">
                <div className="ot">{o.title}</div>
                <div className="od">{o.summary}</div>
                <div className="miniconf">
                  <b style={{ width: `${o.confidence}%` }} />
                </div>
                <div className="orow">
                  <span className="otype">{o.recommended_action || "Opportunity"}</span>
                  <span className="oconf">{o.confidence}% confidence</span>
                </div>
                <div className="oact">
                  <span className="oaud">{humanizePersona(o.evidence?.persona ?? "")}</span>
                  <span className="odraft">Draft with Arc →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="sech">
          <h3>Campaigns in flight</h3>
          <Link className="more" href="/campaigns">All campaigns →</Link>
        </div>
        {campaigns.length === 0 ? (
          <p className="empty-note">No campaigns yet. Arc drafts approval-gated packages here as opportunities come in.</p>
        ) : (
          <div className="ctable">
            <div className="ch">
              <span>Campaign</span>
              <span>Persona</span>
              <span>Status</span>
            </div>
            {campaigns.map((camp) => (
              <Link key={camp.id} href="/campaigns" className="cr">
                <div>
                  <div className="cn">{camp.name}</div>
                  {camp.pendingCount > 0 && <div className="csub">{camp.pendingCount} to approve</div>}
                </div>
                <span>{humanizePersona(camp.persona)}</span>
                <span className="cn" style={{ textTransform: "capitalize", fontWeight: 500 }}>{camp.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <aside className="col-r">
        <h3 className="rh">Signals</h3>
        <div className="rsub">Source-backed, watched by Arc</div>
        <div>
          {signals.length === 0 ? (
            <p className="empty-note">No signals yet. Arc surfaces source-backed ones here.</p>
          ) : (
            signals.map((s, i) => (
              <div className="sig" key={i}>
                <div className="st">{s.title}</div>
                <div className="sm">
                  <span className="src">
                    <b>[{i + 1}]</b> {s.source}
                  </span>
                  <span className="sa">{s.time}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rsec">
          <h3 className="rh">Arc activity</h3>
          <div className="rsub">Recent agent runs</div>
          <div>
            {activityItems.length === 0 ? (
              <p className="empty-note">No recent activity yet.</p>
            ) : (
              activityItems.map((a, i) => (
                <div className="act" key={i}>
                  <span className="at">{a.at}</span>
                  <span className="ad">
                    <b>{a.actor}</b> {a.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rsec">
          <h3 className="rh">Quick actions</h3>
          <div className="rsub">Start something with Arc</div>
          <div className="qa">
            <Link className="qbtn" href="/campaigns">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              New campaign
              <span className="kk">C</span>
            </Link>
            <Link className="qbtn" href="/crm">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>
              Add a lead
              <span className="kk">L</span>
            </Link>
            <Link className="qbtn" href="/build-arc-v2.html">
              <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3.2-6.9L21 4v5h-5" /></svg>
              Ask Arc
              <span className="kk">⌘K</span>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
