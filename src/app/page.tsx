import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "./_components/app-shell";
import { CountUp } from "./_components/count-up";
import { StatusPill, buttonClasses } from "./_components/page-header";
import { DetailStack, EmptyWorkspace, MetricStrip, WorkspaceHeader, WorkspacePanel } from "./_components/workspace";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";
import { getDashboardCounts } from "@/lib/dashboard/read-model";

export default async function HomePage() {
  await connection();

  const dashboardCounts = await getDashboardCounts();
  const agentDashboard = await getAgentOperationsDashboard();
  const liveCounts = dashboardCounts.status === "live" ? dashboardCounts : null;
  const recentOutputs = agentDashboard.status === "live" ? agentDashboard.recentOutputs.slice(0, 4) : [];
  const runner = agentDashboard.status === "live" ? agentDashboard.markRunner : null;

  const approvalsWaiting = liveCounts?.approvalsWaiting ?? 0;
  const leadsAwaitingReview = liveCounts?.leadsAwaitingReview ?? 0;
  const agentTasksOpen = liveCounts?.agentTasksOpen ?? 0;
  const campaignsDrafted = liveCounts?.campaignsDrafted ?? 0;
  const totalWaiting = approvalsWaiting + leadsAwaitingReview + agentTasksOpen;
  const nextStep = getNextStep({
    approvalsWaiting,
    leadsAwaitingReview,
    agentTasksOpen,
    liveError: dashboardCounts.status === "live" ? null : dashboardCounts.message,
  });

  return (
    <AppShell active="/">
      <WorkspaceHeader
        eyebrow="Today"
        title="Mark prepares the work. You decide what moves."
        description="A cleaner command center for the day: approvals first, CRM context second, outbound locked until a human says yes."
        status={totalWaiting > 0 ? `${totalWaiting} waiting` : "Clear"}
        statusTone={totalWaiting > 0 ? "amber" : "green"}
        primary={{ label: nextStep.cta, href: nextStep.href }}
        secondary={{ label: "Open Mark", href: "/agent-operations" }}
      />

      <MetricStrip
        metrics={[
          { label: "Needs approval", value: <CountUp value={approvalsWaiting} />, detail: "Human decisions waiting", tone: approvalsWaiting > 0 ? "amber" : "green", href: "/approvals" },
          { label: "Lead review", value: <CountUp value={leadsAwaitingReview} />, detail: "CRM items to qualify", tone: leadsAwaitingReview > 0 ? "blue" : "gray", href: "/crm/leads" },
          { label: "Open Mark tasks", value: <CountUp value={agentTasksOpen} />, detail: "Queued, running, blocked", tone: agentTasksOpen > 0 ? "amber" : "green", href: "/agent-operations" },
          { label: "Campaign drafts", value: <CountUp value={campaignsDrafted} />, detail: "Ideas or assets not yet live", tone: campaignsDrafted > 0 ? "blue" : "gray", href: "/approvals" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow={nextStep.label}
            title={nextStep.title}
            description={nextStep.detail}
            aside={<StatusPill tone={nextStep.tone}>{nextStep.badge}</StatusPill>}
          >
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="p-5">
                <div className="rounded-xl border border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] p-5">
                  <div className="signal-eyebrow">Next best place to start</div>
                  <p className="mt-3 max-w-2xl text-lg font-semibold leading-7 text-[var(--text-primary)]">{nextStep.operatorCopy}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link className={buttonClasses({ variant: "primary" })} href={nextStep.href}>
                      {nextStep.cta}
                    </Link>
                    <Link className={buttonClasses({ variant: "ghost" })} href="/crm">
                      View CRM
                    </Link>
                  </div>
                </div>
              </div>
              <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5 lg:border-l lg:border-t-0">
                <div className="signal-eyebrow">How this app works</div>
                <ol className="mt-4 space-y-4">
                  {[
                    ["Prepare", "Mark finds leads, drafts campaigns, and gathers evidence."],
                    ["Review", "Humans approve, reject, edit, or request revision."],
                    ["Remember", "Supabase keeps the record, decision, and audit trail."],
                  ].map(([title, detail], index) => (
                    <li className="grid grid-cols-[34px_1fr] gap-3" key={title}>
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] font-mono text-xs font-bold text-[var(--accent)]">
                        0{index + 1}
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-[var(--text-primary)]">{title}</span>
                        <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Review stream"
            title="Latest work Mark wrote back"
            description="Recent outputs appear here so the operator does not have to dig through raw tables."
            aside={<Link className="text-sm font-bold text-[var(--accent)]" href="/agent-operations">Agent console</Link>}
          >
            {recentOutputs.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {recentOutputs.map((entry) => (
                  <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]" key={`${entry.output}-${entry.time}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[var(--text-primary)]">{entry.output}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">{entry.agent} / {entry.time}</div>
                    </div>
                    <StatusPill tone="gray">{entry.status}</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyWorkspace title="No Mark output yet" detail="Queue a task from Mark operations. Finished outputs will show here with their approval state." />
            )}
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
          <WorkspacePanel eyebrow="Mark status" title={runner?.status ?? "Pending setup"} description={runner?.mode ?? "Mark still runs outside the app on the Mac mini."}>
            <DetailStack
              items={[
                { label: "Runner", value: runner?.runner ?? "Codex OAuth or Claude Code CLI" },
                { label: "Heartbeat", value: runner?.lastHeartbeat ?? "No heartbeat yet" },
                { label: "Safety", value: runner?.killSwitch ?? "Outbound locked" },
                { label: "Next", value: runner?.nextStep ?? "Connect Mark to the Growth Engine Supabase project." },
              ]}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Primary routes" title="Where to go next">
            <div className="grid gap-2 p-4">
              {[
                ["Review", "Approve campaigns, ads, lead lists, and copy.", "/approvals"],
                ["CRM", "Leads, companies, contacts, jobs, and outcomes.", "/crm"],
                ["Personas", "Messaging, revenue fit, and guardrails.", "/persona-intelligence"],
                ["Settings", "Approval rules, scoring, integrations, and safety.", "/settings"],
              ].map(([title, detail, href]) => (
                <Link className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 transition hover:bg-[var(--surface-raised)]" href={href} key={title}>
                  <div className="font-bold text-[var(--text-primary)]">{title}</div>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
                </Link>
              ))}
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

function getNextStep({
  approvalsWaiting,
  leadsAwaitingReview,
  agentTasksOpen,
  liveError,
}: {
  approvalsWaiting: number;
  leadsAwaitingReview: number;
  agentTasksOpen: number;
  liveError: string | null;
}) {
  if (liveError) {
    return {
      label: "Connection",
      title: "Supabase needs attention",
      detail: liveError,
      operatorCopy: "Before Mark can be useful, the app needs the live Growth Engine database connection back.",
      href: "/agent-operations",
      cta: "Check Mark",
      badge: "Blocked",
      tone: "red" as const,
    };
  }

  if (approvalsWaiting > 0) {
    return {
      label: "Start here",
      title: `${approvalsWaiting} approval item${approvalsWaiting === 1 ? "" : "s"} waiting`,
      detail: "This is the main job: look at what Mark prepared and decide whether it should move forward.",
      operatorCopy: "Open Review first. Nothing outbound should happen until the approval cards are clear and the risky language is handled.",
      href: "/approvals",
      cta: "Review approvals",
      badge: "Human gate",
      tone: "amber" as const,
    };
  }

  if (agentTasksOpen > 0) {
    return {
      label: "Queue",
      title: `${agentTasksOpen} Mark task${agentTasksOpen === 1 ? "" : "s"} open`,
      detail: "Check whether Mark is queued, running, blocked, or waiting on a human decision.",
      operatorCopy: "Open the Mark console to see the queue, run logs, subagent work, and any blocked task.",
      href: "/agent-operations",
      cta: "Open Mark",
      badge: "In motion",
      tone: "blue" as const,
    };
  }

  if (leadsAwaitingReview > 0) {
    return {
      label: "CRM",
      title: `${leadsAwaitingReview} lead${leadsAwaitingReview === 1 ? "" : "s"} need review`,
      detail: "Review lead quality and persona fit before giving Mark the next step.",
      operatorCopy: "The CRM has records that need qualification. Confirm the fit, then decide whether Mark should enrich or draft outreach.",
      href: "/crm/leads",
      cta: "Review leads",
      badge: "CRM",
      tone: "blue" as const,
    };
  }

  return {
    label: "Clear",
    title: "Nothing urgent is waiting",
    detail: "The approval queue and Mark task queue are clear.",
    operatorCopy: "This is a good time to queue a focused Mark task: find partners, refresh a persona, or draft a campaign packet.",
    href: "/agent-operations",
    cta: "Queue Mark task",
    badge: "Ready",
    tone: "green" as const,
  };
}
