import Link from "next/link";

import { AppShell } from "./_components/app-shell";
import { CountUp } from "./_components/count-up";
import { LiveTime } from "./_components/live-time";
import { PageHeader, Panel, StatusPill } from "./_components/page-header";
import {
  agentApprovalQueue,
  agentRecentOutputs,
  foundationIssues,
  intakeLeads,
  routingQueue,
} from "./_data/growth-engine";

export default function HomePage() {
  // Pick the single most urgent item across the system.
  // For now: the top of the loss-routing queue. Mocked but coherent with the routing page.
  const rightNow = routingQueue[0];

  // Counts that drive the "Also waiting" tiles.
  const intakeReviewCount = intakeLeads.filter((lead) => lead.status !== "Ready for team").length;
  const blockingIssueCount = foundationIssues.filter((issue) => issue.action !== "Review").length;
  const pendingApprovals = agentApprovalQueue.filter((item) => item.status !== "Blocked");
  const firstApproval = pendingApprovals[0];

  const totalWaiting =
    1 /* the right-now item */ + pendingApprovals.length + intakeReviewCount + blockingIssueCount;

  return (
    <AppShell active="/">
      <PageHeader
        eyebrow="Today"
        title="Here's what needs you next"
        description="The most urgent item on top, then everything else still waiting on a human. Specialized pages have the full context when you want to dig in."
        aside={
          <StatusPill tone="gray">
            <CountUp value={totalWaiting} /> waiting
          </StatusPill>
        }
      />

      <Panel className="module-rise p-0 [animation-delay:60ms]">
        <div className="flex items-center gap-2 border-b border-[#eee8e1] px-5 py-3">
          <span
            aria-hidden="true"
            className="relative inline-flex h-1.5 w-1.5 items-center justify-center"
          >
            <span className="absolute inset-0 rounded-full bg-[#d52f28] status-breathe" />
            <span className="absolute inset-0 rounded-full bg-[#d52f28]/45 status-ripple" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a07423]">
            Right now · Most urgent
          </span>
        </div>
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <div className="text-xs font-mono text-[#7a736b]">{rightNow.id}</div>
            <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#151515]">
              {rightNow.lead} — {rightNow.issue.toLowerCase()} in {rightNow.location.toLowerCase()}
            </h2>
            <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[#6e6962]">
              Waiting{" "}
              <span className="font-semibold text-[#151515]">
                <LiveTime baseline={`${rightNow.age} ago`} compact />
              </span>{" "}
              for a routing decision. Score{" "}
              <span className="font-mono font-semibold tabular-nums text-[#151515]">{rightNow.score}</span>,
              source <span className="font-semibold text-[#151515]">{rightNow.source}</span>. Recommended
              action: {rightNow.decision.toLowerCase()}.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#e7352f] px-5 text-sm font-semibold text-white shadow-[0_18px_34px_-20px_rgba(231,53,47,0.8)] transition hover:bg-[#c5261f] active:-translate-y-px"
              href={`/loss-routing?selected=${rightNow.id}`}
            >
              {rightNow.decision}
            </Link>
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-xs font-semibold transition hover:border-[#151515] active:-translate-y-px"
              href={`/loss-routing?selected=${rightNow.id}&filters=open`}
            >
              See full queue
            </Link>
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Panel className="module-rise [animation-delay:100ms]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
              Approvals
            </div>
            <CountUp
              className="font-mono text-2xl font-semibold tabular-nums text-[#151515]"
              value={pendingApprovals.length}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-[#6e6962]">
            {firstApproval
              ? `${firstApproval.source} (${firstApproval.agent}) needs review.`
              : "No drafts waiting on approval."}
          </p>
          <Link
            className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-[#21558a] hover:text-[#153b62]"
            href="/approvals"
          >
            Open approvals →
          </Link>
        </Panel>

        <Panel className="module-rise [animation-delay:140ms]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
              Intake validation
            </div>
            <CountUp
              className="font-mono text-2xl font-semibold tabular-nums text-[#151515]"
              value={intakeReviewCount}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-[#6e6962]">
            Submissions held at the intake gate because customer type, relationship, or loss scope still
            needs confirmation.
          </p>
          <Link
            className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-[#21558a] hover:text-[#153b62]"
            href="/lead-ingestion"
          >
            Open intake →
          </Link>
        </Panel>

        <Panel className="module-rise [animation-delay:180ms]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
              Integrity issues
            </div>
            <CountUp
              className="font-mono text-2xl font-semibold tabular-nums text-[#151515]"
              value={blockingIssueCount}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-[#6e6962]">
            Data-quality findings (duplicates, invalid phones, missing addresses) that would block routing
            or outreach until cleaned up.
          </p>
          <Link
            className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-[#21558a] hover:text-[#153b62]"
            href="/data-foundation"
          >
            Open data foundation →
          </Link>
        </Panel>
      </div>

      <section className="module-rise mt-6 border-t border-[#ddd6cd] pt-6 [animation-delay:220ms]">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a736b]">Recent</div>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-[#151515]">
              Latest agent work
            </h2>
          </div>
          <Link
            className="text-xs font-semibold text-[#21558a] hover:text-[#153b62]"
            href="/agent-operations"
          >
            All activity →
          </Link>
        </div>
        <ul className="divide-y divide-[#eee8e1] rounded-md border border-[#e7e0d8] bg-[#fbfaf8]">
          {agentRecentOutputs.map((entry) => (
            <li
              className="grid grid-cols-[80px_1fr_auto] items-baseline gap-4 px-4 py-2.5"
              key={`${entry.output}-${entry.time}`}
            >
              <span className="text-xs text-[#7a736b]">
                <LiveTime baseline={entry.time} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#151515]">{entry.output}</div>
                <div className="truncate text-xs text-[#6e6962]">{entry.agent}</div>
              </div>
              <span className="text-[11px] font-medium text-[#7a736b]">{entry.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
