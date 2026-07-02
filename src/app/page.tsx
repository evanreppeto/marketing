import Link from "next/link";
import { connection } from "next/server";

import { ActivationChecklist } from "./_components/activation-checklist";
import { CountUp } from "./_components/count-up";
import { EvidenceChip } from "./_components/evidence-chip";
import { buttonClasses, Panel, StatusPill } from "./_components/page-header";
import { cx, type ThemeTone } from "./_components/theme";
import { getActivationState } from "@/lib/activation/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getRecentActivity } from "@/lib/activity/read-model";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorProfile, operatorFirstName } from "@/lib/auth/operator-profile";
import { getDashboardCounts } from "@/lib/dashboard/read-model";
import { listOpenOpportunities, type OpportunityRecord } from "@/lib/opportunities/read-model";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

const URGENCY_TONE: Record<OpportunityRecord["urgency"], ThemeTone> = { high: "red", medium: "amber", low: "blue" };
const URGENCY_LABEL: Record<OpportunityRecord["urgency"], string> = {
  high: "High urgency",
  medium: "Medium urgency",
  low: "Low urgency",
};

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Humanize a persona key like `persona_homeowner_emergency` → "Homeowner Emergency". */
function personaLabel(key: string) {
  return key
    .replace(/^persona[_-]/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

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
  const [counts, campaignList, activity, opportunities, operator] = await Promise.all([
    getDashboardCounts(),
    getCampaignWorkspaceList(undefined, agentName, orgId),
    getRecentActivity({ limit: 5 }),
    listOpenOpportunities().catch(() => [] as OpportunityRecord[]),
    getOperatorProfile().catch(() => null),
  ]);
  // Personalize the greeting only when we actually know who's signed in — a real
  // operator identity (Supabase user or configured operator), never a placeholder.
  const firstName = operator?.email ? operatorFirstName(operator) : null;

  const campaigns = campaignList.status === "live" ? campaignList.campaigns : [];
  const readyCampaign = campaigns.find((campaign) => campaign.lifecycle === "Ready") ?? null;
  const reviewCampaign =
    campaigns.find((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review") ?? null;
  const topOpportunity = opportunities[0] ?? null;

  const approvalsWaiting = counts.status === "live" ? counts.approvalsWaiting : 0;
  const leadsAwaitingReview = counts.status === "live" ? counts.leadsAwaitingReview : 0;
  const openAgentTasks = counts.status === "live" ? counts.agentTasksOpen : 0;
  const readyCampaigns = campaigns.filter((campaign) => campaign.lifecycle === "Ready").length;
  const needs = approvalsWaiting + leadsAwaitingReview;

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const greeting = greetingFor(new Date());

  // Which single thing leads the page. Approval-gated work outranks a recommendation.
  const focalKind: "reviewCampaign" | "opportunity" | "readyCampaign" | "clear" = reviewCampaign
    ? "reviewCampaign"
    : topOpportunity
      ? "opportunity"
      : readyCampaign
        ? "readyCampaign"
        : "clear";

  // Signals rail = open opportunities not already shown as the focal.
  const railSignals = (focalKind === "opportunity" ? opportunities.slice(1) : opportunities).slice(0, 4);

  // Quiet list — the decisions that aren't the single top priority.
  const quietRows: QuietRowProps[] = [];
  if (leadsAwaitingReview > 0) {
    quietRows.push({
      href: "/crm/leads",
      title: `${leadsAwaitingReview} lead signal${leadsAwaitingReview === 1 ? "" : "s"} awaiting review`,
      detail: `${agentName} scored and routed them — confirm the next move.`,
      pillTone: "amber",
      pillLabel: "Needs you",
    });
  }
  if (readyCampaign && focalKind !== "readyCampaign") {
    quietRows.push({
      href: readyCampaign.href,
      title: `Launch ${readyCampaign.name}`,
      detail: "Approvals are clear — check the audience and channel plan before launch.",
      pillTone: "green",
      pillLabel: "Ready",
    });
  }
  quietRows.push({
    href: "/settings?section=brand-kit",
    title: `Keep ${agentName} inside the brand`,
    detail: "Proof points, voice, banned claims, and local detail — specific context is the antidote to generic output.",
    pillTone: "gray",
    pillLabel: "Tip",
  });

  return (
    <>
      <header className="rise-in rise-d1 mb-9 pt-1">
        <h1 className="font-editorial text-[clamp(2.1rem,3.4vw,2.95rem)] font-medium leading-[1] tracking-[-0.022em] text-[var(--text-primary)]">
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {dateStr}
          <span className="mx-2 text-[var(--border-strong)]">·</span>
          {needs > 0
            ? `${needs} ${needs === 1 ? "thing needs" : "things need"} your decision`
            : `${agentName} has nothing waiting on you`}
        </p>
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

          {focalKind === "opportunity" && topOpportunity ? (
            <OpportunityFocal opp={topOpportunity} />
          ) : focalKind === "reviewCampaign" && reviewCampaign ? (
            <CampaignFocal focal={reviewCampaign} isReview />
          ) : focalKind === "readyCampaign" && readyCampaign ? (
            <CampaignFocal focal={readyCampaign} isReview={false} />
          ) : (
            <ClearFocal agentName={agentName} />
          )}

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

        {/* ---- Right: momentum rail (Signals + agent activity) ---- */}
        <div className="min-w-0 lg:border-l lg:border-[var(--border-hairline)] lg:pl-10">
          <h2 className="rise-in rise-d3 mb-4 font-editorial text-[1.18rem] font-medium tracking-[-0.012em] text-[var(--text-primary)]">
            Momentum
          </h2>

          <Panel className="rise-in rise-d3 p-0">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Signals</span>
              <Link
                href="/opportunities"
                className="text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
              >
                Open →
              </Link>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {railSignals.length > 0 ? (
                railSignals.map((opp) => <SignalRow key={opp.id} opp={opp} />)
              ) : (
                <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
                  No open signals — {agentName} is watching for opportunities and will surface them here.
                </div>
              )}
            </div>
          </Panel>

          <Panel className="rise-in rise-d4 mt-4 p-0">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{agentName} activity</span>
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
                  <Link
                    key={entry.id}
                    href={entry.href ?? "/activity"}
                    className="block px-4 py-3 transition hover:bg-[var(--surface-soft)]"
                  >
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
        </div>
      </div>
    </>
  );
}

function OpportunityFocal({ opp }: { opp: OpportunityRecord }) {
  const ev = opp.evidence ?? {};
  const chips: { key: string; label: string }[] = [];
  if (ev.persona) chips.push({ key: "persona", label: personaLabel(ev.persona) });
  if (typeof ev.daysCold === "number") chips.push({ key: "cold", label: `${ev.daysCold}d cold` });
  if (typeof ev.leadScore === "number") chips.push({ key: "score", label: `Lead score ${ev.leadScore}` });
  const confidence = Math.max(0, Math.min(100, Math.round(opp.confidence)));

  return (
    <Link href="/opportunities" className={cx("signal-panel focal-card rise-in rise-d2 mt-4 block p-5")}>
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.72rem] font-semibold tracking-[0.01em] text-[var(--accent-contrast)]">
            Top opportunity
          </span>
          <StatusPill tone={URGENCY_TONE[opp.urgency]}>{URGENCY_LABEL[opp.urgency]}</StatusPill>
        </div>
        <div className="mt-1.5 font-editorial text-[1.32rem] font-medium leading-tight tracking-[-0.014em] text-[var(--text-primary)]">
          {opp.title}
        </div>
        <p className="mt-2 max-w-[54ch] text-sm leading-6 text-[var(--text-secondary)]">{opp.summary}</p>
        {chips.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((chip, index) => (
              <EvidenceChip key={chip.key} index={index + 1} label={chip.label} />
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <ConfidenceBar value={confidence} />
        </div>
        <div className="mt-4 inline-flex">
          <span className={buttonClasses({ size: "sm" })}>Review&nbsp;→</span>
        </div>
      </div>
    </Link>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-medium text-[var(--text-muted)]">Confidence</span>
      <span
        role="progressbar"
        aria-label="Confidence"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--surface-inset)]"
      >
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{value}%</span>
    </div>
  );
}

function CampaignFocal({ focal, isReview }: { focal: CampaignWorkspaceListItem; isReview: boolean }) {
  const label = isReview ? "Top priority" : "Ready to launch";
  const detail = isReview
    ? `${focal.pendingCount} piece${focal.pendingCount === 1 ? "" : "s"} ${focal.pendingCount === 1 ? "needs" : "need"} a decision before anything goes out. Outbound stays locked until you approve.`
    : "All required approvals are clear. Check the audience and channel plan, then launch.";
  const cta = isReview ? "Review & approve" : "Check launch";

  return (
    <Link href={focal.href} className={cx("signal-panel focal-card rise-in rise-d2 mt-4 block p-5")}>
      <div className="relative">
        <div className="text-[0.72rem] font-semibold tracking-[0.01em] text-[var(--accent-contrast)]">{label}</div>
        <div className="mt-1.5 font-editorial text-[1.32rem] font-medium leading-tight tracking-[-0.014em] text-[var(--text-primary)]">
          {focal.name}
        </div>
        <p className="mt-2 max-w-[54ch] text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
        <div className="mt-4 inline-flex">
          <span className={buttonClasses({ size: "sm" })}>{cta}&nbsp;→</span>
        </div>
      </div>
    </Link>
  );
}

function ClearFocal({ agentName }: { agentName: string }) {
  return (
    <Link href="/campaigns" className={cx("signal-panel focal-card rise-in rise-d2 mt-4 block p-5")}>
      <div className="relative">
        <div className="text-[0.72rem] font-semibold tracking-[0.01em] text-[var(--accent-contrast)]">You’re clear</div>
        <div className="mt-1.5 font-editorial text-[1.32rem] font-medium leading-tight tracking-[-0.014em] text-[var(--text-primary)]">
          Nothing is waiting on a decision
        </div>
        <p className="mt-2 max-w-[54ch] text-sm leading-6 text-[var(--text-secondary)]">
          {agentName} is watching for signals and will surface the next thing that needs you right here.
        </p>
        <div className="mt-4 inline-flex">
          <span className={buttonClasses({ size: "sm" })}>Browse campaigns&nbsp;→</span>
        </div>
      </div>
    </Link>
  );
}

type QuietRowProps = {
  href: string;
  title: string;
  detail: string;
  pillTone: ThemeTone;
  pillLabel: string;
};

function QuietRow({ href, title, detail, pillTone, pillLabel }: QuietRowProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 border-b border-[var(--border-hairline)] py-3.5 pl-1 transition-[padding] duration-200 first:border-t hover:pl-2.5"
    >
      <StatusPill tone={pillTone} className="shrink-0">
        {pillLabel}
      </StatusPill>
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

function SignalRow({ opp }: { opp: OpportunityRecord }) {
  return (
    <Link href="/opportunities" className="block px-4 py-3 transition hover:bg-[var(--surface-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{opp.title}</div>
          <p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">{opp.recommended_action}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill tone={URGENCY_TONE[opp.urgency]}>{opp.urgency}</StatusPill>
          <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            {Math.round(opp.confidence)}%
          </span>
        </div>
      </div>
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

function activityTone(tone: "green" | "red" | "amber" | "blue" | "gray") {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}
