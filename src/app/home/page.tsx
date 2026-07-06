import Link from "next/link";
import { redirect } from "next/navigation";

import { listApprovalCards } from "@/lib/approvals/read-model";
import { getCurrentWorkspaceContext, type WorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

import "./arc-home.css";

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

function initials(name: string): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "A";
}

/** amber for a pending decision, red when a risk/block flag is set. */
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
  const [campaigns, leads, companies, contacts, approvals] = await Promise.all([
    countOf("campaigns"),
    countOf("leads"),
    countOf("companies"),
    countOf("contacts"),
    countOf("approval_items"),
  ]);
  return { campaigns, leads, companies, contacts, approvals };
}

const IconArc = (
  <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 12.5h5" /></svg>
);
const IconHome = <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
const IconCampaigns = <svg viewBox="0 0 24 24"><path d="M4 5h16v6H4z" /><path d="M4 15h10v4H4z" /></svg>;
const IconCrm = <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /><path d="M16 6h5M16 10h5" /></svg>;
const IconOpp = <svg viewBox="0 0 24 24"><path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 21l-5-2.7 1-5.5-4-4 5.5-.8z" /></svg>;
const IconAnalytics = <svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8" /></svg>;
const IconBrain = <svg viewBox="0 0 24 24"><path d="M12 4a4 4 0 00-4 4 3 3 0 00-1 6 3 3 0 003 3 3 3 0 006 0 3 3 0 003-3 3 3 0 00-1-6 4 4 0 00-4-4z" /></svg>;
const IconPersonas = <svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3 19c0-3 2-4.5 5-4.5M21 19c0-3-2-4.5-5-4.5M9 19c0-2 1.5-3 3-3s3 1 3 3" /></svg>;
const IconStudio = <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="M4 14l5-4 4 3 3-2 4 3" /><circle cx="9" cy="9" r="1.4" /></svg>;
const IconLibrary = <svg viewBox="0 0 24 24"><path d="M4 7h6l2 2h8v10H4z" /></svg>;
const IconBrand = <svg viewBox="0 0 24 24"><path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z" /></svg>;
const IconOutbox = <svg viewBox="0 0 24 24"><path d="M3 12l18-8-8 18-2-7z" /></svg>;

// Home + Campaigns are real routes; the rest still point at the mockup screens
// until each is ported.
const NAV_GROUPS: { group: string; items: { label: string; href: string; icon: React.ReactNode; active?: boolean }[] }[] = [
  {
    group: "Workspace",
    items: [
      { label: "Arc", href: "/build-arc-v2.html", icon: IconArc },
      { label: "Home", href: "/home", icon: IconHome, active: true },
      { label: "Campaigns", href: "/campaigns", icon: IconCampaigns },
      { label: "CRM", href: "/build-crm.html", icon: IconCrm },
      { label: "Opportunities", href: "/build-opportunities.html", icon: IconOpp },
    ],
  },
  { group: "Growth", items: [{ label: "Analytics", href: "/build-analytics.html", icon: IconAnalytics }] },
  {
    group: "Intelligence",
    items: [
      { label: "Brain", href: "/build-brain.html", icon: IconBrain },
      { label: "Personas", href: "/build-personas.html", icon: IconPersonas },
    ],
  },
  {
    group: "Assets",
    items: [
      { label: "Studio", href: "/build-studio.html", icon: IconStudio },
      { label: "Library", href: "/build-library.html", icon: IconLibrary },
      { label: "Brand", href: "/build-brand.html", icon: IconBrand },
      { label: "Outbox", href: "/build-outbox.html", icon: IconOutbox },
    ],
  },
];

export default async function HomePage() {
  let ctx: WorkspaceContext;
  try {
    ctx = await getCurrentWorkspaceContext();
  } catch {
    redirect("/login?from=/home");
  }
  if (!ctx.workspaceId) redirect("/onboarding");

  const user = await getSupabaseAuthenticatedUser();
  const userName = String(user?.user_metadata?.full_name ?? "").trim();
  const displayName = userName || ctx.orgName;
  const firstName = userName.split(/\s+/)[0] || "there";

  const [c, approvals, campaignList, opportunities] = await Promise.all([
    workspaceCounts(ctx.orgId),
    listApprovalCards({ orgId: ctx.orgId, limit: 5 }).catch(() => []),
    getCampaignWorkspaceList(undefined, "Arc", ctx.orgId).catch(() => ({ status: "unavailable" as const })),
    listOpenOpportunities(undefined, ctx.orgId).catch(() => []),
  ]);
  const campaigns = campaignList.status === "live" ? campaignList.campaigns.slice(0, 5) : [];
  const opps = opportunities.slice(0, 4);
  const focal = opps[0] ?? null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
  const liveCampaigns = campaigns.filter((camp) => /live|active|sending/i.test(camp.status)).length;

  const metrics = [
    { label: "Campaigns", value: c.campaigns },
    { label: "Leads", value: c.leads },
    { label: "Companies", value: c.companies },
  ];

  return (
    <div className="arc-home">
      <div className="app">
        <aside className="rail">
          <div className="ws">
            <span className="mk">{initials(ctx.orgName)}</span>
            <div>
              <div className="nm">{ctx.workspaceName}</div>
              <div className="pl">{ctx.orgName}</div>
            </div>
          </div>
          <div className="indtag">
            <i />
            {ctx.orgName.split(/\s+/)[0]?.toUpperCase()} workspace
          </div>
          <div className="navwrap">
            {NAV_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="grp">{g.group.toUpperCase()}</div>
                {g.items.map((it) => (
                  <Link key={it.label} href={it.href} className={`nav${it.active ? " on" : ""}`}>
                    {it.active && <span className="tick" />}
                    {it.icon}
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <Link href="/settings/team" className="user">
            <span className="av">{initials(displayName)}</span>
            <div className="nm">{firstName}</div>
            <span className="cog">⚙</span>
          </Link>
        </aside>

        <div className="main">
          <header className="top">
            <span className="crumb">Home</span>
            <div className="search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              Search or jump to…
              <span className="k">⌘K</span>
            </div>
            <span className="topav">{initials(displayName)}</span>
          </header>

          <div className="scroll">
            <section className="content">
              <div className="date">{dateLabel}</div>
              <h1 className="greet">
                {greeting}, {firstName}
              </h1>
              <div className="subline">
                {c.approvals} {c.approvals === 1 ? "package" : "packages"} waiting
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
                <span className="ct">{c.approvals} to decide</span>
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
              <h3 className="rh">Quick actions</h3>
              <div className="rsub">Start something with Arc</div>
              <div className="qa">
                <Link className="qbtn" href="/build-campaign-builder.html">
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  New campaign
                  <span className="kk">C</span>
                </Link>
                <Link className="qbtn" href="/build-crm.html">
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

              <div className="rsec">
                <h3 className="rh">Team</h3>
                <div className="rsub">{ctx.orgName}</div>
                <Link className="qbtn" href="/settings/team">
                  <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /></svg>
                  Manage team
                </Link>
              </div>

              <p className="empty-note" style={{ marginTop: 26 }}>Outbound stays locked until you approve.</p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
