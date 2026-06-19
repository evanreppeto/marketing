import Link from "next/link";
import { connection } from "next/server";

import { buttonClasses, PageHeader, Panel, StatStrip, StatusPill, type StatItem } from "./_components/page-header";
import { theme } from "./_components/theme";
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

  return (
    <>
      <PageHeader
        eyebrow="Home"
        title="Today’s work"
        description="A short operating brief for campaigns, approvals, lead signals, and the parts of the system that need a human decision."
        aside={
          <>
            <Link href="/arc" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Open {agentName}
            </Link>
            <Link
              href={reviewCampaign?.href ?? readyCampaign?.href ?? "/campaigns"}
              className={buttonClasses({ size: "sm" })}
            >
              Review work
            </Link>
          </>
        }
      />

      <StatStrip
        columns={4}
        items={buildStats({
          approvalsWaiting: counts.status === "live" ? counts.approvalsWaiting : 0,
          leadsAwaitingReview: counts.status === "live" ? counts.leadsAwaitingReview : 0,
          readyCampaigns: campaigns.filter((campaign) => campaign.lifecycle === "Ready").length,
          openAgentTasks: counts.status === "live" ? counts.agentTasksOpen : 0,
        })}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Panel className="module-rise p-0 [animation-delay:40ms]" aria-labelledby="home-priority-title">
          <div className="border-b border-[var(--border-hairline)] px-4 py-4 sm:px-5">
            <div className={theme.text.eyebrow}>Priority lane</div>
            <h2 id="home-priority-title" className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              Start with the decision, not the tool
            </h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">
              Arc can prepare work, but this console should make the next human call obvious.
            </p>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            <PriorityRow
              href={reviewCampaign?.href ?? "/campaigns?view=needs-attention"}
              label="Review"
              title={reviewCampaign ? reviewCampaign.name : "No campaign is waiting on approval"}
              detail={
                reviewCampaign
                  ? `${reviewCampaign.pendingCount} piece${reviewCampaign.pendingCount === 1 ? " needs" : "s need"} a decision before anything goes out.`
                  : "When a draft, asset, or send package needs approval, it will appear here first."
              }
              tone={reviewCampaign ? "amber" : "green"}
              action={reviewCampaign ? "Open campaign" : "View campaigns"}
            />
            <PriorityRow
              href={readyCampaign?.href ?? "/campaigns?view=ready-to-send"}
              label="Launch"
              title={readyCampaign ? readyCampaign.name : "Nothing is staged for launch"}
              detail={
                readyCampaign
                  ? "All required approvals are clear. Check the audience and channel plan before launch."
                  : "Approved campaigns move here once the launch checklist is clean."
              }
              tone={readyCampaign ? "green" : "gray"}
              action={readyCampaign ? "Check launch" : "View ready queue"}
            />
            <PriorityRow
              href="/settings?section=brand-kit"
              label="Quality"
              title="Keep Arc inside the brand"
              detail="Use the Brand Kit for proof points, voice, banned claims, services, and local details. Specific context is the antidote to generic output."
              tone="blue"
              action="Tune Brand Kit"
            />
          </div>
        </Panel>

        <Panel className="module-rise p-0 [animation-delay:80ms]" aria-labelledby="home-setup-title">
          <div className="border-b border-[var(--border-hairline)] px-4 py-4 sm:px-5">
            <div className={theme.text.eyebrow}>Product readiness</div>
            <h2 id="home-setup-title" className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              Workspace setup
            </h2>
          </div>
          <div className="grid gap-0 divide-y divide-[var(--border-hairline)]">
            <SetupRow
              title="Business profile"
              detail="Brand, services, claims, proof, and voice are editable."
              href="/settings?section=brand-kit"
              ready={Boolean(settings.workspaceName && settings.assistantName)}
            />
            <SetupRow
              title="Agent runner"
              detail={agentReady ? `${agentName} has the runner settings it needs.` : "Connect the runner before relying on background work."}
              href="/settings?section=agent"
              ready={agentReady}
            />
            <SetupRow
              title="Outbound channels"
              detail={
                configuredConnections > 0
                  ? `${configuredConnections} connection${configuredConnections === 1 ? "" : "s"} ready.`
                  : "Connect email or social before launch workflows feel real."
              }
              href="/settings?section=connections"
              ready={configuredConnections > 0}
            />
            <SetupRow
              title="Database"
              detail={isSupabaseAdminConfigured() ? "Live workspace data is available." : "Preview mode is running without live persistence."}
              href="/settings?section=system"
              ready={isSupabaseAdminConfigured()}
            />
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel className="module-rise p-0 [animation-delay:120ms]" aria-labelledby="home-campaign-title">
          <SectionHeader title="Campaign queue" detail={campaignSummary(campaigns)} href="/campaigns" action="Open campaigns" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {campaigns.slice(0, 4).map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
            {campaigns.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[var(--text-muted)]">No campaigns yet. Create one manually or ask Arc for a draft packet.</div>
            ) : null}
          </div>
        </Panel>

        <Panel className="module-rise p-0 [animation-delay:160ms]" aria-labelledby="home-activity-title">
          <SectionHeader title="Recent activity" detail="Decisions, drafts, runs, and campaign changes." href="/activity" action="Open activity" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {activity.status === "live" || activity.status === "unavailable"
              ? activity.status === "live" && activity.entries.length > 0
                ? activity.entries.slice(0, 5).map((entry) => (
                    <Link
                      key={entry.id}
                      href={entry.href ?? "/activity"}
                      className="block px-4 py-3 transition hover:bg-[var(--surface-soft)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.title}</div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{entry.detail}</p>
                        </div>
                        <StatusPill tone={activityTone(entry.tone)}>{entry.insightLabel ?? entry.category}</StatusPill>
                      </div>
                    </Link>
                  ))
                : (
                    <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                      {activity.status === "unavailable" ? activity.message : "No activity has been recorded yet."}
                    </div>
                  )
              : null}
          </div>
        </Panel>
      </section>
    </>
  );
}

function buildStats(input: {
  approvalsWaiting: number;
  leadsAwaitingReview: number;
  readyCampaigns: number;
  openAgentTasks: number;
}): StatItem[] {
  return [
    {
      label: "Needs decision",
      value: input.approvalsWaiting,
      hint: input.approvalsWaiting > 0 ? "Review before outbound" : "Clear",
      tone: input.approvalsWaiting > 0 ? "amber" : "ok",
    },
    {
      label: "Lead signals",
      value: input.leadsAwaitingReview,
      hint: input.leadsAwaitingReview > 0 ? "Awaiting review" : "None pending",
      tone: input.leadsAwaitingReview > 0 ? "accent" : "neutral",
    },
    {
      label: "Ready campaigns",
      value: input.readyCampaigns,
      hint: input.readyCampaigns > 0 ? "Launch checklist next" : "No launch queue",
      tone: input.readyCampaigns > 0 ? "ok" : "neutral",
    },
    {
      label: "Arc tasks",
      value: input.openAgentTasks,
      hint: input.openAgentTasks > 0 ? "Open or running" : "No open tasks",
      tone: input.openAgentTasks > 0 ? "accent" : "neutral",
    },
  ];
}

function PriorityRow({
  label,
  title,
  detail,
  href,
  action,
  tone,
}: {
  label: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "green" | "amber" | "blue" | "gray";
}) {
  return (
    <Link href={href} className="group block px-4 py-4 transition hover:bg-[var(--surface-soft)] sm:px-5">
      <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-2">
          <StatusPill tone={tone}>{label}</StatusPill>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
          <p className="mt-1 max-w-[72ch] text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
        </div>
        <div className="text-xs font-semibold text-[var(--accent-contrast)] transition group-hover:text-[var(--text-primary)]">
          {action}
        </div>
      </div>
    </Link>
  );
}

function SetupRow({ title, detail, href, ready }: { title: string; detail: string; href: string; ready: boolean }) {
  return (
    <Link href={href} className="group block px-4 py-3.5 transition hover:bg-[var(--surface-soft)] sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
        </div>
        <StatusPill tone={ready ? "green" : "amber"}>{ready ? "Ready" : "Needs setup"}</StatusPill>
      </div>
    </Link>
  );
}

function SectionHeader({ title, detail, href, action }: { title: string; detail: string; href: string; action: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      </div>
      <Link href={href} className={buttonClasses({ variant: "ghost", size: "sm" })}>
        {action}
      </Link>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const needsReview = campaign.pendingCount > 0 || campaign.lifecycle === "In review";
  return (
    <Link href={campaign.href} className="group block px-4 py-3.5 transition hover:bg-[var(--surface-soft)] sm:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-sm font-semibold text-[var(--accent)]">
          {campaign.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{campaign.name}</div>
            <StatusPill tone={needsReview ? "amber" : campaign.lifecycle === "Live" ? "green" : "gray"}>{campaign.lifecycle}</StatusPill>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
            {campaign.objective || campaign.audienceSummary}
          </p>
        </div>
        <div className="hidden text-right text-xs text-[var(--text-muted)] sm:block">
          <div>{campaign.assetCount} pieces</div>
          <div>{campaign.mediaCount} media</div>
        </div>
      </div>
    </Link>
  );
}

function campaignSummary(campaigns: CampaignWorkspaceListItem[]) {
  if (campaigns.length === 0) return "Create a campaign packet or ask Arc to prepare one.";
  const waiting = campaigns.filter((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review").length;
  const ready = campaigns.filter((campaign) => campaign.lifecycle === "Ready").length;
  return `${campaigns.length} campaigns, ${waiting} waiting, ${ready} ready.`;
}

function activityTone(tone: "green" | "red" | "amber" | "blue" | "gray") {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}
