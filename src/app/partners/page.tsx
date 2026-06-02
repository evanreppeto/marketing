import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import type { IntelligencePanelModel } from "../_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import { getPartnerDevelopmentDashboard, type PartnerCard } from "@/lib/partners/read-model";

export default async function PartnersPage() {
  await connection();

  const dashboard = await getPartnerDevelopmentDashboard();

  if (dashboard.status !== "live") {
    return (
      <>
        <WorkspaceHeader
          eyebrow="Partner development"
          title="Partner desk"
          description="Referral partners, trade sources, and campaign handoffs will appear here once Supabase is available."
          status="Unavailable"
          statusTone="amber"
        />
        <WorkspacePanel>
          <EmptyState title="Partner data unavailable" detail={dashboard.message} />
        </WorkspacePanel>
      </>
    );
  }

  const strongest = dashboard.strongestPartner;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Partner development"
        title="Build the referral network without letting Mark go outbound."
        description="Review plumbers, sewer and drain companies, insurance agents, property managers, and other partner lanes. Mark can enrich, score, and draft approval packets; humans still approve every external move."
        status="Outbound locked"
        statusTone="amber"
        primary={{ label: "Review approvals", href: "/approvals" }}
        secondary={{ label: "Open campaigns", href: "/campaigns" }}
      />

      <MetricStrip
        metrics={[
          {
            label: "Partners",
            value: dashboard.metrics.partnerCandidates,
            detail: "Partner-like companies and candidates",
            tone: dashboard.metrics.partnerCandidates > 0 ? "blue" : "gray",
          },
          {
            label: "Scored",
            value: dashboard.metrics.scoredPartners,
            detail: "Health, tier, metadata, or lead-score signal",
            tone: dashboard.metrics.scoredPartners > 0 ? "green" : "amber",
          },
          {
            label: "Open approvals",
            value: dashboard.metrics.openApprovals,
            detail: "Human review still required",
            tone: dashboard.metrics.openApprovals > 0 ? "amber" : "green",
            href: "/approvals",
          },
          {
            label: "Campaign links",
            value: dashboard.metrics.campaignLinks,
            detail: "Packages tied to partners or leads",
            tone: dashboard.metrics.campaignLinks > 0 ? "blue" : "gray",
            href: "/campaigns",
          },
        ]}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Partner board"
            title="Referral-development queue"
            description="Each card shows the partner lane, source strength, active campaign or approval work, missing fields, and Mark's safest next internal action."
            aside={<StatusPill tone="amber">No dispatch</StatusPill>}
          >
            {dashboard.partners.length > 0 ? (
              <div className="grid gap-3 p-4 xl:grid-cols-2">
                {dashboard.partners.map((partner) => (
                  <PartnerDevelopmentCard key={partner.id} partner={partner} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No partner candidates yet"
                detail="Once Mark finds or imports companies with partner personas, partner tier, or partner-score metadata, they will appear here."
                action={
                  <Link className={buttonClasses({ variant: "primary", size: "sm" })} href="/agent-operations">
                    Open Mark tasks
                  </Link>
                }
              />
            )}
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Partner lanes"
            title="Relationship tracks"
            description="These are the lanes Mark should classify. Counts come from live partner inference, not placeholder cards."
          >
            <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {dashboard.tracks.map((track) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={track.label}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{track.label}</div>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{track.cta}</p>
                    </div>
                    <StatusPill tone={track.count > 0 ? "blue" : "gray"}>{track.count}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel model={strongest ? intelligenceModel(strongest) : { title: "Partner intelligence", outboundLocked: true, emptyDetail: "No partner candidate is available yet." }} />

          <WorkspacePanel eyebrow="Mark can help" title="Safe internal moves">
            <div className="grid gap-2 p-4">
              <Link className={buttonClasses({ variant: "primary", className: "justify-between" })} href="/agent-operations">
                <span>Prepare enrichment task</span>
                <span className="text-[var(--on-accent)]/75">Mark</span>
              </Link>
              <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href="/campaigns">
                <span>Draft campaign package</span>
                <span className="text-[var(--text-muted)]">Approval gated</span>
              </Link>
              <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href="/approvals">
                <span>Review open packets</span>
                <span className="text-[var(--text-muted)]">{dashboard.metrics.openApprovals}</span>
              </Link>
            </div>
            <p className="border-t border-[var(--border-hairline)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
              These links do not send email, SMS, launch ads, publish pages, change spend, or contact a partner.
            </p>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Data contracts" title="What is live vs needed">
            <div className="grid gap-2 p-4">
              {dashboard.dataContracts.map((contract) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={contract.label}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-[var(--text-primary)]">{contract.label}</div>
                    <StatusPill tone={contract.status === "live" ? "green" : "amber"}>{contract.status}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{contract.detail}</p>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </>
  );
}

function PartnerDevelopmentCard({ partner }: { partner: PartnerCard }) {
  return (
    <article className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={partner.scoreTone}>{typeof partner.score === "number" ? `${partner.score}` : "Unscored"}</StatusPill>
            <StatusPill tone={partner.partnerTypeSource === "missing" ? "amber" : "blue"}>{partner.partnerType}</StatusPill>
            {partner.openApprovals > 0 ? <StatusPill tone="amber">{partner.openApprovals} approvals</StatusPill> : null}
          </div>
          <Link className="mt-3 block truncate text-xl font-black tracking-[-0.025em] text-[var(--text-primary)] transition hover:text-[var(--accent)]" href={partner.href}>
            {partner.name}
          </Link>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{partner.summary}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Revenue</div>
          <div className="mt-1 font-display text-2xl font-black tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{partner.revenue}</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Contacts" value={partner.contacts} />
        <MiniStat label="Leads" value={partner.leads} />
        <MiniStat label="Campaigns" value={partner.campaigns.length} />
        <MiniStat label="Last signal" value={partner.lastSignal} />
      </dl>

      <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Mark-safe next action</div>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-primary)]">{partner.nextAction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.nextActionHref}>
            Open next step
          </Link>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.href}>
            CRM record
          </Link>
          {partner.websiteUrl ? (
            <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={partner.websiteUrl} rel="noreferrer" target="_blank">
              Source site
            </a>
          ) : null}
        </div>
      </div>

      {partner.campaigns.length > 0 || partner.approvals.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {partner.approvals.slice(0, 2).map((approval) => (
            <Link className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm transition hover:border-[var(--border-strong)]" href={approval.href} key={approval.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[var(--text-primary)]">{approval.title}</span>
                <StatusPill tone={riskTone(approval.riskLevel)}>{approval.riskLevel}</StatusPill>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">{approval.status}</div>
            </Link>
          ))}
          {partner.campaigns.slice(0, 2).map((campaign) => (
            <Link className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm transition hover:border-[var(--border-strong)]" href={campaign.href} key={campaign.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[var(--text-primary)]">{campaign.name}</span>
                <StatusPill tone="blue">{campaign.status}</StatusPill>
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">Campaign package</div>
            </Link>
          ))}
        </div>
      ) : null}

      {partner.missingFields.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {partner.missingFields.slice(0, 6).map((field) => (
            <span className="rounded-md border border-[oklch(0.82_0.13_85/0.32)] bg-[oklch(0.82_0.13_85/0.1)] px-2 py-1 text-[11px] font-semibold text-[oklch(0.9_0.09_85)]" key={field}>
              needs {field.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function intelligenceModel(partner: PartnerCard): IntelligencePanelModel {
  return {
    title: partner.name,
    persona: partner.persona,
    confidence: partner.scoreSource,
    journeyStage: partner.relationshipStage,
    urgency: partner.openApprovals > 0 ? "Needs approval review" : typeof partner.score === "number" && partner.score >= 80 ? "High-fit partner" : "Partner development",
    attentionReason: partner.summary,
    nextBestAction: partner.nextAction,
    cta: partner.cta,
    messageAngle: "Relationship-first partner handoff, documentation, and approval-gated campaign prep.",
    guardrailStatus: "Internal review only. No partner contact, outbound dispatch, publishing, launch, or spend change from this page.",
    scores: [
      { label: "Partner score", value: partner.score, detail: partner.scoreSource, tone: partner.scoreTone },
      { label: "Approvals", value: partner.openApprovals, detail: "Open human gates", tone: partner.openApprovals > 0 ? "amber" : "green" },
      { label: "Campaigns", value: partner.campaigns.length, detail: "Linked packages", tone: partner.campaigns.length > 0 ? "blue" : "gray" },
    ],
    proofPoints: [
      `${partner.contacts} linked contact${partner.contacts === 1 ? "" : "s"}`,
      `${partner.leads} linked lead signal${partner.leads === 1 ? "" : "s"}`,
      `${partner.revenue} linked revenue`,
      ...partner.riskFlags.slice(0, 3),
    ],
    evidence: partner.evidence,
    outboundLocked: true,
  };
}

function riskTone(risk: string) {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium/i.test(risk)) return "amber";
  return "green";
}
