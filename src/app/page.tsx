import Link from "next/link";
import { connection } from "next/server";

import { ApprovalInbox, type InboxItem } from "./_components/approval-inbox";
import { IntelligenceLinkList, IntelligencePanel } from "./_components/intelligence-panel";
import { OpportunityCommandCenter, type OpportunityBucket, type OpportunityRow } from "./_components/opportunity-command-center";
import { StatusPill, buttonClasses } from "./_components/page-header";
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
  const opportunityBuckets: OpportunityBucket[] = [
    {
      key: "high-value",
      title: "High-value urgent",
      href: "/crm",
      tone: "green",
      detail: "Lead, partner, or job records scoring 75+.",
      rows: highValueRows.map(toOpportunityRow),
      emptyTitle: "No high-value records yet",
      emptyDetail: "When CRM scores reach the high band, they will appear here for review.",
    },
    {
      key: "enrichment",
      title: "Needs enrichment",
      href: "/crm",
      tone: "blue",
      detail: "Useful records with missing confidence or context.",
      rows: enrichmentRows.map(toOpportunityRow),
      emptyTitle: "No enrichment records in this view",
      emptyDetail: "Low-context CRM records will appear here when Mark needs more evidence before a campaign draft.",
    },
    {
      key: "partners",
      title: "Best partner opportunities",
      href: "/partners",
      tone: "green",
      detail: "Partner records with stronger review scores.",
      rows: bestPartnerRows.map(toOpportunityRow),
      emptyTitle: "No scored partner opportunities yet",
      emptyDetail: "Partner companies appear here after partner tier or score data is available.",
    },
    {
      key: "campaign-ready",
      title: "Ready for campaign",
      href: "/campaigns",
      tone: "blue",
      detail: "Scored records with no known missing tags.",
      rows: readyForCampaignRows.map(toOpportunityRow),
      emptyTitle: "No records are campaign-ready yet",
      emptyDetail: "Records need score, source, service tag, persona, and evidence before this lane fills.",
    },
    {
      key: "human-input",
      title: "Needs human input",
      href: "/agent-operations",
      tone: "red",
      detail: "Blocked Mark work or repair needed.",
      rows: agentOps.status === "live" ? agentOps.tasks.filter((task) => task.status === "blocked").map(toTaskOpportunityRow) : [],
      emptyTitle: "No blocked Mark tasks",
      emptyDetail: "Blocked tasks will appear here when Mark needs a schema, input, approval, or runner fix.",
    },
    {
      key: "missing-evidence",
      title: "Missing evidence",
      href: "/crm",
      tone: "amber",
      detail: "Records without evidence URLs or notes.",
      rows: missingEvidenceRows.map(toOpportunityRow),
      emptyTitle: "No missing-evidence records in this view",
      emptyDetail: "Records with missing evidence URLs or notes will appear here for Mark enrichment.",
    },
    {
      key: "stale",
      title: "Stale / no next action",
      href: "/crm",
      tone: "gray",
      detail: "Records older than 14 days in this view.",
      rows: staleRows.map(toOpportunityRow),
      emptyTitle: "No stale records in this view",
      emptyDetail: "Older CRM records will appear here when they need a fresh next action.",
    },
    {
      key: "mark-created",
      title: "Recently created by Mark",
      href: "/agent-operations",
      tone: "gray",
      detail: "New outputs with audit trail.",
      rows: agentOps.status === "live" ? agentOps.recentOutputs.map(toOutputOpportunityRow) : [],
      emptyTitle: "No recent Mark outputs",
      emptyDetail: "Mark outputs will appear here after the runner writes audit-backed work.",
    },
  ];

  const inboxItems: InboxItem[] = approvals.map((card) => ({
    id: card.id,
    title: card.title,
    previewText: card.previewText,
    persona: card.persona,
    statusLabel: card.statusLabel,
    riskLevel: card.riskLevel,
    channel: card.channel,
    sourceAgent: card.sourceAgent,
    recommendedAction: card.recommendedAction,
    evidenceCount: card.evidence.length,
    mediaCount: card.creativeAssets.length,
    campaignId: card.campaign.id,
    campaignName: card.campaign.name,
    relatedCount: [
      card.relatedRecords.company,
      card.relatedRecords.contact,
      card.relatedRecords.lead,
    ].filter(Boolean).length,
  }));

  return (
    <>
      <header className="module-rise mb-5 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-4 shadow-[var(--elev-panel)] sm:px-5">
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Today</span>
              <StatusPill tone={totalWaiting > 0 ? "amber" : "green"}>{totalWaiting > 0 ? `${totalWaiting} waiting` : "Clear"}</StatusPill>
              <StatusPill tone="blue">Outbound locked</StatusPill>
            </div>
            <h1 className="mt-3 max-w-3xl text-[clamp(1.65rem,2.6vw,2.55rem)] font-black leading-[1.04] tracking-[-0.035em] text-[var(--text-primary)]">
              Mark prepares the work. You approve the move.
            </h1>
            <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              Start with the queue, inspect the CRM evidence, then open campaign packages when Mark creates deliverables.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={topApproval ? `/approvals?item=${topApproval.id}` : "/approvals"}>
                Review approvals
              </Link>
              <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/agent-operations">
                Open Mark tasks
              </Link>
            </div>
          </div>
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
            eyebrow="Decide next"
            title="Needs your approval"
            description="Low and medium risk can be decided here; high or blocked items open the campaign so you see the full draft first. Outbound stays locked."
          >
            <ApprovalInbox items={inboxItems} />
          </WorkspacePanel>

          <OpportunityCommandCenter buckets={opportunityBuckets} />
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

function toOpportunityRow(row: {
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
  sourceTag: string;
  lifecycleTag: string;
}): OpportunityRow {
  return {
    id: row.id,
    href: row.href,
    record: row.record,
    account: row.account,
    nextStep: row.nextStep,
    stage: row.stage,
    tone: row.tone,
    value: row.value,
    personaTag: row.personaTag,
    urgencyTag: row.urgencyTag,
    sourceTag: row.sourceTag,
    lifecycleTag: row.lifecycleTag,
  };
}

function toTaskOpportunityRow(task: {
  id: string;
  href: string;
  task: string;
  objective: string;
  agentName: string;
  status: string;
  risk: string;
  approval: string;
}): OpportunityRow {
  return {
    id: task.id,
    href: task.href,
    record: task.task,
    account: task.agentName,
    nextStep: task.objective,
    stage: task.status,
    tone: task.status === "blocked" ? "red" : "amber",
    value: task.risk,
    urgencyTag: task.approval,
    lifecycleTag: task.status,
  };
}

function toOutputOpportunityRow(output: { output: string; agent: string; status: string; time: string }): OpportunityRow {
  return {
    id: `${output.output}-${output.time}`,
    href: "/agent-operations",
    record: output.output,
    account: output.agent,
    nextStep: "Open Mark operations to inspect the output and audit trail.",
    stage: output.status,
    tone: output.status.toLowerCase().includes("approved") ? "green" : "gray",
    value: output.time,
    lifecycleTag: output.status,
  };
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
