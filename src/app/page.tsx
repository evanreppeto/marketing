import Link from "next/link";
import { connection } from "next/server";

import { IntelligenceLinkList, IntelligencePanel } from "./_components/intelligence-panel";
import { EmptyState, StatusPill, buttonClasses } from "./_components/page-header";
import { MetricStrip, WorkspacePanel } from "./_components/workspace";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";
import { listApprovalCards } from "@/lib/approvals/read-model";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getCrmOverviewData } from "@/lib/crm/read-model";
import { getDashboardCounts } from "@/lib/dashboard/read-model";

export default async function TodayPage() {
  await connection();

  const [counts, agentOps, campaigns, crm, approvals] = await Promise.all([
    getDashboardCounts(),
    getAgentOperationsDashboard(),
    getCampaignWorkspaceList(),
    getCrmOverviewData(),
    loadApprovals(),
  ]);

  const liveCounts = counts.status === "live" ? counts : null;
  const campaignList = campaigns.status === "live" ? campaigns.campaigns : [];
  const crmRows = crm.status === "live" ? crm.rows : [];
  const mark = agentOps.status === "live" ? agentOps.markRunner : null;
  const topApproval = approvals[0] ?? null;
  const highValueRows = crmRows.filter((row) => row.score >= 75).slice(0, 4);
  const enrichmentRows = crmRows.filter((row) => row.score < 60).slice(0, 4);
  const missingEvidenceRows = crmRows.filter((row) => row.missingTags.includes("missing_evidence")).slice(0, 4);
  const staleRows = crmRows.filter((row) => isStale(row.updated)).slice(0, 4);
  const bestPartnerRows = crmRows.filter((row) => row.objectType === "partner" && row.score >= 70).slice(0, 4);
  const readyForCampaignRows = crmRows
    .filter((row) => row.score >= 60 && row.missingTags.length === 0 && (row.objectType === "lead" || row.objectType === "partner"))
    .slice(0, 4);
  const totalWaiting = (liveCounts?.approvalsWaiting ?? 0) + (liveCounts?.leadsAwaitingReview ?? 0) + (liveCounts?.agentTasksOpen ?? 0);

  return (
    <>
      <header className="module-rise mb-5 overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="grid min-h-[190px] lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="relative px-5 py-5 sm:px-6">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,oklch(0.74_0.115_232/0.16),transparent_34%)]" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="signal-eyebrow">Today</span>
                <StatusPill tone={totalWaiting > 0 ? "amber" : "green"}>{totalWaiting > 0 ? `${totalWaiting} waiting` : "Clear"}</StatusPill>
              </div>
              <h1 className="mt-5 max-w-4xl text-[clamp(2rem,4vw,4rem)] font-black leading-[0.96] tracking-[-0.055em] text-[var(--text-primary)]">
                Mark prepares growth work. Humans approve what moves.
              </h1>
              <p className="mt-4 max-w-[68ch] text-base leading-7 text-[var(--text-secondary)]">
                The Growth Intelligence CRM is organized around attention, evidence, partner development, campaign packages, and a hard outbound lock.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link className={buttonClasses({ variant: "primary" })} href={topApproval ? `/approvals?item=${topApproval.id}` : "/approvals"}>
                  Review approvals
                </Link>
                <Link className={buttonClasses({ variant: "ghost" })} href="/agent-operations">
                  Open Mark tasks
                </Link>
              </div>
            </div>
          </div>
          <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5 lg:border-l lg:border-t-0">
            <div className="signal-eyebrow">Operating rule</div>
            <div className="mt-5 space-y-3">
              {[
                ["Human gate", "On"],
                ["Outbound", "Locked"],
                ["CRM source", "Supabase"],
                ["Mark runner", mark?.status ?? "Unknown"],
              ].map(([label, value]) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5" key={label}>
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </header>

      <MetricStrip
        metrics={[
          { label: "Needs approval", value: liveCounts?.approvalsWaiting ?? 0, detail: "Human decisions waiting", tone: (liveCounts?.approvalsWaiting ?? 0) > 0 ? "amber" : "green", href: "/approvals" },
          { label: "Lead review", value: liveCounts?.leadsAwaitingReview ?? 0, detail: "CRM items to qualify", tone: (liveCounts?.leadsAwaitingReview ?? 0) > 0 ? "blue" : "gray", href: "/crm" },
          { label: "Open Mark tasks", value: liveCounts?.agentTasksOpen ?? 0, detail: "Queued, running, blocked", tone: (liveCounts?.agentTasksOpen ?? 0) > 0 ? "amber" : "green", href: "/agent-operations" },
          { label: "Campaign drafts", value: liveCounts?.campaignsDrafted ?? campaignList.length, detail: "Packages not live", tone: campaignList.length > 0 ? "blue" : "gray", href: "/campaigns" },
        ]}
      />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Prioritized opportunities"
            title="Needs attention now"
            description="The queue is split by what an operator can safely decide next. Mark can prepare and revise; outbound stays locked."
          >
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              <OpportunityBucket title="Waiting on approval" count={approvals.length} href="/approvals" tone="amber" detail="Generated work needs a human decision." />
              <OpportunityBucket title="High-value urgent" count={highValueRows.length} href="/crm" tone="green" detail="Lead, partner, or job records scoring 75+." />
              <OpportunityBucket title="Needs enrichment" count={enrichmentRows.length} href="/crm" tone="blue" detail="Useful records with missing confidence or context." />
              <OpportunityBucket title="Best partner opportunities" count={bestPartnerRows.length} href="/partners" tone="green" detail="Partner records with stronger review scores." />
              <OpportunityBucket title="Ready for campaign" count={readyForCampaignRows.length} href="/campaigns" tone="blue" detail="Scored records with no known missing tags." />
              <OpportunityBucket title="Needs human input" count={mark?.blockedTasks ?? 0} href="/agent-operations" tone="red" detail="Blocked Mark work or repair needed." />
              <OpportunityBucket title="Missing evidence" count={missingEvidenceRows.length} href="/crm" tone="amber" detail="Records without evidence URLs or notes." />
              <OpportunityBucket title="Stale / no next action" count={staleRows.length} href="/crm" tone="gray" detail="Records older than 14 days in this view." />
              <OpportunityBucket title="Recently created by Mark" count={agentOps.status === "live" ? agentOps.recentOutputs.length : 0} href="/agent-operations" tone="gray" detail="New outputs with audit trail." />
            </div>
          </WorkspacePanel>

          <div className="grid gap-5 xl:grid-cols-2">
            <OpportunityList
              eyebrow="Top records"
              title="High-value urgent"
              rows={highValueRows}
              emptyTitle="No high-value records yet"
              emptyDetail="When CRM scores reach the high band, they will appear here for review."
            />
            <OpportunityList
              eyebrow="Partners"
              title="Best partner opportunities"
              rows={bestPartnerRows}
              emptyTitle="No scored partner opportunities yet"
              emptyDetail="Partner companies appear here after partner tier or score data is available."
            />
            <OpportunityList
              eyebrow="Campaign prep"
              title="Ready for campaign"
              rows={readyForCampaignRows}
              emptyTitle="No records are campaign-ready yet"
              emptyDetail="Records need score, source, service tag, persona, and evidence before this bucket fills."
            />
            <OpportunityList
              eyebrow="Data quality"
              title="Missing evidence"
              rows={missingEvidenceRows}
              emptyTitle="No missing-evidence records in this view"
              emptyDetail="Records with missing evidence URLs or notes will appear here for Mark enrichment."
            />
          </div>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: topApproval ? topApproval.title : "Operator decision context",
              persona: topApproval?.persona ?? null,
              confidence: topApproval ? "Approval packet ready" : "No active packet",
              journeyStage: topApproval ? "Waiting on approval" : "Monitoring",
              urgency: topApproval?.riskLevel ?? "Normal",
              attentionReason: topApproval?.previewText ?? "No active approval card is waiting. Watch Mark tasks, CRM enrichment, and campaign packages.",
              nextBestAction: topApproval?.recommendedAction ?? "Queue Mark only when the database has enough evidence to prepare useful work.",
              cta: "Use persona-safe CTAs only: Call Now, Upload Photos, Request Vendor Packet, Refer a Client, or Become a Partner.",
              messageAngle: topApproval ? `${topApproval.channel} / ${topApproval.sourceAgent}` : "Restoration, mitigation, documentation, rebuild, and partner handoff.",
              guardrailStatus: "No outbound send, publish, launch, spend, or contact action without explicit human approval.",
              scores: [
                { label: "Approvals", value: approvals.length, detail: "Active review records", tone: approvals.length > 0 ? "amber" : "green" },
                { label: "Campaigns", value: campaignList.length, detail: "Packages in library", tone: campaignList.length > 0 ? "blue" : "gray" },
                { label: "Tasks", value: mark?.queuedTasks ?? 0, detail: "Queued for Mark", tone: (mark?.queuedTasks ?? 0) > 0 ? "amber" : "gray" },
              ],
              evidence: topApproval?.evidence.map((href) => ({ label: sourceLabel(href), href })) ?? [],
              outboundLocked: true,
            }}
          />

          <IntelligenceLinkList
            title="Operating areas"
            items={[
              { label: "Approval Queue", detail: "Approve, decline, revise, or archive Mark-created work.", href: "/approvals", tone: "amber" },
              { label: "Partners", detail: "Plumbers, sewer/drain, HVAC, property managers, insurance agents, HOAs, and more.", href: "/partners", tone: "blue" },
              { label: "Campaigns", detail: "Briefs, assets, media prompts, source evidence, approvals, and revisions.", href: "/campaigns", tone: "blue" },
              { label: "Performance", detail: "Measurement structure and attribution empty states.", href: "/reports", tone: "gray" },
            ]}
          />
        </aside>
      </div>
    </>
  );
}

async function loadApprovals() {
  try {
    return await listApprovalCards({ limit: 25 });
  } catch {
    return [];
  }
}

function OpportunityBucket({ title, count, detail, href, tone }: { title: string; count: number; detail: string; href: string; tone: "amber" | "green" | "red" | "blue" | "gray" }) {
  return (
    <Link className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:bg-[var(--surface-raised)]" href={href}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-bold text-[var(--text-primary)]">{title}</div>
        <StatusPill tone={tone}>{count}</StatusPill>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </Link>
  );
}

function OpportunityList({
  eyebrow,
  title,
  rows,
  emptyTitle,
  emptyDetail,
}: {
  eyebrow: string;
  title: string;
  rows: Array<{
    id: string;
    href: string;
    record: string;
    account: string;
    nextStep: string;
    stage: string;
    tone: "amber" | "green" | "red" | "blue";
    value: string;
    personaTag: string;
    urgencyTag: string;
  }>;
  emptyTitle: string;
  emptyDetail: string;
}) {
  return (
    <WorkspacePanel eyebrow={eyebrow} title={title}>
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <Link className="block px-5 py-4 transition hover:bg-[var(--surface-inset)]" href={row.href} key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[var(--text-primary)]">{row.record}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{row.account}</span>
                </span>
                <StatusPill tone={row.tone}>{row.stage}</StatusPill>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono font-bold text-[var(--accent)]">{row.value}</span>
                <span>{humanizeTag(row.personaTag)}</span>
                <span>{humanizeTag(row.urgencyTag)}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{row.nextStep}</div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      )}
    </WorkspacePanel>
  );
}

function sourceLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "Evidence";
  }
}

function isStale(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - time > fourteenDays;
}

function humanizeTag(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
