import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "./_components/app-shell";
import { CountUp } from "./_components/count-up";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "./_components/page-header";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";
import { getDashboardCounts } from "@/lib/dashboard/read-model";

export default async function HomePage() {
  await connection();

  const dashboardCounts = await getDashboardCounts();
  const agentDashboard = await getAgentOperationsDashboard();
  const liveCounts = dashboardCounts.status === "live" ? dashboardCounts : null;
  const recentOutputs = agentDashboard.status === "live" ? agentDashboard.recentOutputs.slice(0, 3) : [];

  const approvalsWaiting = liveCounts?.approvalsWaiting ?? 0;
  const leadsAwaitingReview = liveCounts?.leadsAwaitingReview ?? 0;
  const agentTasksOpen = liveCounts?.agentTasksOpen ?? 0;
  const totalWaiting = approvalsWaiting + leadsAwaitingReview + agentTasksOpen;
  const nextStep = getNextStep({
    approvalsWaiting,
    leadsAwaitingReview,
    agentTasksOpen,
    liveError: dashboardCounts.status === "live" ? null : dashboardCounts.message,
  });

  return (
    <AppShell active="/">
      <PageHeader
        eyebrow="Today"
        title="What needs a human?"
        description="Start here. Review what Mark prepared, check the CRM, and keep outbound work locked until it is approved."
        aside={<StatusPill tone={totalWaiting > 0 ? "amber" : "green"}>{totalWaiting} waiting</StatusPill>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="p-0">
          <div className="border-b border-[var(--border-hairline)] px-5 py-5">
            <div className="signal-eyebrow">{nextStep.label}</div>
            <h2 className="mt-2 max-w-2xl font-display text-[clamp(1.75rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.04em]">
              {nextStep.title}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[var(--text-secondary)]">{nextStep.detail}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className={buttonClasses({ variant: "primary" })} href={nextStep.href}>
                {nextStep.cta}
              </Link>
              <Link className={buttonClasses({ variant: "ghost" })} href="/agent-operations">
                Mark status
              </Link>
            </div>
          </div>

          <div className="grid divide-y divide-[var(--border-hairline)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SimpleMetric label="Approvals" value={approvalsWaiting} href="/approvals" />
            <SimpleMetric label="Lead review" value={leadsAwaitingReview} href="/crm/leads" />
            <SimpleMetric label="Open Mark tasks" value={agentTasksOpen} href="/agent-operations" />
          </div>
        </Panel>

        <Panel>
          <div className="signal-eyebrow">Simple map</div>
          <ol className="mt-4 space-y-4">
            {[
              ["Mark prepares work", "Lead lists, enrichment, drafts, scoring, and evidence."],
              ["You review it", "Approve, reject, or ask for changes."],
              ["Nothing goes outbound yet", "Dispatch stays locked until a later approved workflow."],
            ].map(([title, detail], index) => (
              <li className="grid grid-cols-[32px_1fr] gap-3" key={title}>
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-inset)] font-mono text-xs font-bold text-[var(--accent)]">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <HomeLink title="Review queue" detail="Approve or reject Mark's output." href="/approvals" />
        <HomeLink title="CRM" detail="Companies, contacts, leads, and outcomes." href="/crm" />
        <HomeLink title="Personas" detail="Audience memory and messaging rules." href="/persona-intelligence" />
        <HomeLink title="Settings" detail="Mark controls, integrations, access, and scoring." href="/settings" />
      </div>

      <Panel className="mt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="signal-eyebrow">Recent Mark output</div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">Latest work</h2>
          </div>
          <Link className="text-sm font-semibold text-[var(--accent)]" href="/agent-operations">
            Open Mark
          </Link>
        </div>

        {recentOutputs.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {recentOutputs.map((entry) => (
              <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]" key={`${entry.output}-${entry.time}`}>
                <div>
                  <div className="font-semibold">{entry.output}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{entry.agent}</div>
                </div>
                <StatusPill tone="gray">{entry.status}</StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No recent output" detail="When Mark completes a task, the latest output will show up here." />
        )}
      </Panel>
    </AppShell>
  );
}

function SimpleMetric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link className="block p-5 transition hover:bg-[var(--surface-inset)]" href={href}>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      <CountUp className="mt-2 block font-display text-4xl font-black tabular-nums tracking-[-0.04em]" value={value} />
    </Link>
  );
}

function HomeLink({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link className="signal-panel block p-4 transition hover:bg-[var(--surface-inset)]" href={href}>
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
    </Link>
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
      title: "Supabase is not responding",
      detail: liveError,
      href: "/agent-operations",
      cta: "Check Mark",
    };
  }

  if (approvalsWaiting > 0) {
    return {
      label: "Start here",
      title: `${approvalsWaiting} item${approvalsWaiting === 1 ? "" : "s"} need review`,
      detail: "This is the main job of the app: look at what Mark prepared and decide whether it should move forward.",
      href: "/approvals",
      cta: "Review approvals",
    };
  }

  if (agentTasksOpen > 0) {
    return {
      label: "Next",
      title: `${agentTasksOpen} Mark task${agentTasksOpen === 1 ? "" : "s"} still open`,
      detail: "Check whether Mark is queued, running, blocked, or waiting on a human decision.",
      href: "/agent-operations",
      cta: "Open Mark",
    };
  }

  if (leadsAwaitingReview > 0) {
    return {
      label: "CRM",
      title: `${leadsAwaitingReview} lead${leadsAwaitingReview === 1 ? "" : "s"} need review`,
      detail: "Review the lead quality and persona fit before giving Mark the next step.",
      href: "/crm/leads",
      cta: "Review leads",
    };
  }

  return {
    label: "Clear",
    title: "Nothing urgent is waiting",
    detail: "The approval queue and Mark task queue are clear. Queue a task when you want Mark to prepare the next growth action.",
    href: "/agent-operations",
    cta: "Queue Mark task",
  };
}
