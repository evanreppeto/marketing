import Link from "next/link";
import { connection } from "next/server";

import { ActivationChecklist } from "./_components/activation-checklist";
import { CountUp } from "./_components/count-up";
import { buttonClasses, Panel, StatusPill } from "./_components/page-header";
import { cx } from "./_components/theme";
import { getActivationState } from "@/lib/activation/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getRecentActivity } from "@/lib/activity/read-model";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getConnections } from "@/lib/connections/read-model";
import { getDashboardCounts } from "@/lib/dashboard/read-model";
import { getAgentDisplayName, isAgentConfigured } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export default async function HomePage() {
  await connection();

  const settings = await getAppSettings();
  const agentName = getAgentDisplayName(settings.assistantName);
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;
  const activation = orgId
    ? await getCurrentWorkspaceContext()
        .then(async (ctx) => ({
          orgName: ctx.orgName,
          checklist: (await getActivationState(ctx.orgId, ctx.workspaceId)).checklist,
        }))
        .catch(() => null)
    : null;
  const [counts, campaignList, activity, connections] = await Promise.all([
    getDashboardCounts(),
    getCampaignWorkspaceList(undefined, agentName, orgId),
    getRecentActivity({ limit: 5 }),
    getConnections(),
  ]);

  const campaigns = campaignList.status === "live" ? campaignList.campaigns : [];
  const readyCampaign = campaigns.find((campaign) => campaign.lifecycle === "Ready");
  const reviewCampaign = campaigns.find((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review");
  const configuredConnections = connections.filter((item) => item.status === "connected").length;
  const agentReady = isAgentConfigured();

  const approvalsWaiting = counts.status === "live" ? counts.approvalsWaiting : 0;
  const leadsAwaitingReview = counts.status === "live" ? counts.leadsAwaitingReview : 0;
  const openAgentTasks = counts.status === "live" ? counts.agentTasksOpen : 0;
  const readyCampaigns = campaigns.filter((campaign) => campaign.lifecycle === "Ready").length;
  const needs = approvalsWaiting + leadsAwaitingReview;

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const focal = reviewCampaign ?? readyCampaign ?? null;

  // Quiet list — the decisions that aren't the single top priority.
  const quietRows: QuietRowProps[] = [];
  if (leadsAwaitingReview > 0) {
    quietRows.push({
      href: "/crm/leads",
      title: `${leadsAwaitingReview} lead signal${leadsAwaitingReview === 1 ? "" : "s"} awaiting review`,
      detail: `${agentName} scored and routed them — confirm the next move.`,
      tone: "accent",
    });
  }
  if (readyCampaign && focal !== readyCampaign) {
    quietRows.push({
      href: readyCampaign.href,
      title: `Launch ${readyCampaign.name}`,
      detail: "Approvals are clear — check the audience and channel plan before launch.",
      tone: "ok",
    });
  }
  quietRows.push({
    href: "/settings?section=brand-kit",
    title: `Keep ${agentName} inside the brand`,
    detail: "Proof points, voice, banned claims, and local detail — specific context is the antidote to generic output.",
    tone: "muted",
  });

  return (
    <>
      <header className="relative isolate mb-9 pt-1">
        <div aria-hidden className="hero-aura left-[-4rem] right-[-1rem] top-[-6rem] h-[20rem]" />
        <div className="rise-in rise-d1 relative z-10">
          <h1 className="font-editorial text-[clamp(2.1rem,3.4vw,2.95rem)] font-medium leading-[1] tracking-[-0.022em] text-[var(--text-primary)]">
            Today
          </h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {dateStr}
            <span className="mx-2 text-[var(--border-strong)]">·</span>
            {needs > 0
              ? `${needs} ${needs === 1 ? "thing needs" : "things need"} your decision`
              : `${agentName} has nothing waiting on you`}
          </p>
        </div>
      </header>

      {activation?.checklist.showChecklist ? (
        <div className="rise-in rise-d2 mb-8">
          <ActivationChecklist checklist={activation.checklist} orgName={activation.orgName} />
        </div>
      ) : null}

      <div className="grid gap-x-10 gap-y-9 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ---- Left: the decisions ---- */}
        <div className="min-w-0">
          <div className="rise-in rise-d2 flex items-baseline justify-between">
            <h2 className="font-editorial text-[1.18rem] font-medium tracking-[-0.012em] text-[var(--text-primary)]">
              Needs you
            </h2>
            <span className="tabular-nums text-xs text-[var(--text-muted)]">{needs} open</span>
          </div>
          <div
            aria-hidden
            className="mb-1 mt-3 h-px bg-[linear-gradient(90deg,var(--accent-border-strong),var(--border-hairline)_36%,transparent)]"
          />

          <FocalPriority focal={focal} isReview={Boolean(reviewCampaign)} agentName={agentName} />

          <div className="rise-in rise-d3 mt-6">
            {quietRows.map((row) => (
              <QuietRow key={row.href + row.title} {...row} />
            ))}
          </div>

          <div className="rise-in rise-d4 mt-9 flex flex-wrap items-end gap-x-11 gap-y-6 border-t border-[var(--border-hairline)] pt-7">
            <Metric value={approvalsWaiting} label="Needs decision" warn={approvalsWaiting > 0} />
            <Metric value={leadsAwaitingReview} label="Lead signals" />
            <Metric value={readyCampaigns} label="Ready to launch" />
            <Metric value={openAgentTasks} label={`${agentName} tasks`} />
          </div>
        </div>

        {/* ---- Right: momentum rail (selective panels) ---- */}
        <div className="min-w-0 lg:border-l lg:border-[var(--border-hairline)] lg:pl-10">
          <h2 className="rise-in rise-d3 mb-4 font-editorial text-[1.18rem] font-medium tracking-[-0.012em] text-[var(--text-primary)]">
            Momentum
          </h2>

          <Panel className="rise-in rise-d3 p-0">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</span>
              <Link
                href="/activity"
                className="text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
              >
                Open →
              </Link>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {activity.status === "live" && activity.entries.length > 0 ? (
                activity.entries.slice(0, 4).map((entry) => (
                  <Link key={entry.id} href={entry.href ?? "/activity"} className="block px-4 py-3 transition hover:bg-[var(--surface-soft)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{entry.title}</div>
                        <p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">{entry.detail}</p>
                      </div>
                      <StatusPill tone={activityTone(entry.tone)}>{entry.insightLabel ?? entry.category}</StatusPill>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                  {activity.status === "unavailable" ? activity.message : `No activity yet — ${agentName}'s runs will appear here.`}
                </div>
              )}
            </div>
          </Panel>

          <Panel className="rise-in rise-d4 mt-4 p-0">
            <div className="border-b border-[var(--border-hairline)] px-4 py-3.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Workspace setup</span>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              <SetupRow title="Business profile" href="/settings?section=brand-kit" ready={Boolean(settings.workspaceName && settings.assistantName)} />
              <SetupRow title="Agent runner" href="/settings?section=agent" ready={agentReady} />
              <SetupRow title="Outbound channels" href="/settings?section=connections" ready={configuredConnections > 0} />
              <SetupRow title="Database" href="/settings?section=system" ready={isSupabaseAdminConfigured()} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function FocalPriority({ focal, isReview, agentName }: { focal: CampaignWorkspaceListItem | null; isReview: boolean; agentName: string }) {
  let label: string;
  let title: string;
  let detail: string;
  let href: string;
  let cta: string;

  if (focal && isReview) {
    label = "Top priority";
    title = focal.name;
    detail = `${focal.pendingCount} piece${focal.pendingCount === 1 ? "" : "s"} ${focal.pendingCount === 1 ? "needs" : "need"} a decision before anything goes out. Outbound stays locked until you approve.`;
    href = focal.href;
    cta = "Review & approve";
  } else if (focal) {
    label = "Ready to launch";
    title = focal.name;
    detail = "All required approvals are clear. Check the audience and channel plan, then launch.";
    href = focal.href;
    cta = "Check launch";
  } else {
    label = "You’re clear";
    title = "Nothing is waiting on a decision";
    detail = `${agentName} is watching for signals and will surface the next thing that needs you right here.`;
    href = "/campaigns";
    cta = "Browse campaigns";
  }

  return (
    <Link href={href} className={cx("signal-panel focal-card rise-in rise-d2 mt-4 block p-5")}>
      <div className="relative">
        <div className="text-[0.72rem] font-semibold tracking-[0.01em] text-[var(--accent-contrast)]">{label}</div>
        <div className="mt-1.5 font-editorial text-[1.32rem] font-medium leading-tight tracking-[-0.014em] text-[var(--text-primary)]">
          {title}
        </div>
        <p className="mt-2 max-w-[54ch] text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
        <div className="mt-4 inline-flex">
          <span className={buttonClasses({ size: "sm" })}>{cta}&nbsp;→</span>
        </div>
      </div>
    </Link>
  );
}

type QuietRowProps = {
  href: string;
  title: string;
  detail: string;
  tone: "accent" | "ok" | "warn" | "muted";
};

function QuietRow({ href, title, detail, tone }: QuietRowProps) {
  const dot =
    tone === "warn" ? "var(--warn)" : tone === "accent" ? "var(--accent)" : tone === "ok" ? "var(--ok)" : "var(--text-muted)";
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 border-b border-[var(--border-hairline)] py-3.5 pl-1 transition-[padding] duration-200 first:border-t hover:pl-2.5"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{detail}</span>
      </span>
      <span className="ml-auto shrink-0 text-xs font-semibold text-[var(--text-secondary)] transition group-hover:text-[var(--accent)]">
        Open&nbsp;→
      </span>
    </Link>
  );
}

function Metric({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <div>
      <div
        className={cx(
          "font-display text-[1.7rem] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          warn ? "text-[var(--warn-text)]" : "text-[var(--text-primary)]",
        )}
      >
        <CountUp value={value} />
      </div>
      <div className="mt-2 text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function SetupRow({ title, href, ready }: { title: string; href: string; ready: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--surface-soft)]">
      <span className="text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
      <StatusPill tone={ready ? "green" : "amber"}>{ready ? "Ready" : "Set up"}</StatusPill>
    </Link>
  );
}

function activityTone(tone: "green" | "red" | "amber" | "blue" | "gray") {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}
