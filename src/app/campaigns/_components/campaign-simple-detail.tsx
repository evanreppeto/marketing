import Link from "next/link";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { CampaignBriefTabs } from "./campaign-brief-tabs";
import { CampaignPackageWorkspace } from "./campaign-package-workspace";
import {
  buildCampaignChecklist,
  buildCampaignPackageSummary,
  buildSendExportFacts,
  contentStatusForLaunch,
  type CampaignPackageSummary,
  type PlainTone,
} from "./campaign-detail-model";

export function CampaignSimpleDetail({ detail, agentName }: { detail: LiveCampaignWorkspace; agentName: string }) {
  const { campaign, executiveOverview, launchState, reasoning } = detail;
  const checklist = buildCampaignChecklist(detail, agentName);
  const facts = buildSendExportFacts(detail);
  const packageSummary = buildCampaignPackageSummary(detail);
  const statusTone = lifecycleTone(launchState.lifecycle);
  const decisionTargetId = detail.assets.find((asset) => contentStatusForLaunch(asset, detail.launchState).label === "Review")?.id;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-5">
          <div className="min-w-0">
            <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] transition hover:text-[var(--text-primary)]">
              <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                <path d="M12 5 7 10l5 5" />
                <path d="M8 10h8" />
              </svg>
              Back to campaigns
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusPill tone={statusTone}>{launchState.lifecycle}</StatusPill>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {detail.assets.length} piece{detail.assets.length === 1 ? "" : "s"}
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)]">{campaign.updatedAt}</span>
            </div>
            <h1 className="mt-3 font-serif text-[clamp(1.9rem,3vw,3rem)] font-semibold leading-[1.02] tracking-[-0.018em] text-[var(--text-primary)]">
              {campaign.name}
            </h1>
            <p className="mt-3 max-w-[78ch] text-base leading-7 text-[var(--text-secondary)]">{plainOrFallback(campaign.objective, executiveOverview.what)}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HeroFact label="For" value={targetLabel(campaign.persona)} />
              <HeroFact label="Why" value={plainOrFallback(executiveOverview.why, reasoning.whyBuilt)} />
              <HeroFact label="Offer" value={plainOrFallback(campaign.offerSummary, "Offer not set")} />
              <HeroFact label="Channels" value={packageSummary.destinations.length > 0 ? packageSummary.destinations.join(", ") : executiveOverview.where} />
            </div>
          </div>
        </div>

        <ReviewCallout summary={packageSummary} campaignName={campaign.name} decisionTargetId={decisionTargetId} agentName={agentName} />

      </section>

      <CampaignProgressBar checklist={checklist} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <CampaignPackageWorkspace
          agentName={agentName}
          assets={detail.assets}
          campaignId={campaign.id}
          launchState={detail.launchState}
          summary={packageSummary}
        />

        <CampaignContextRail
          detail={detail}
          facts={facts}
          checklist={checklist}
          agentName={agentName}
          goal={plainOrFallback(executiveOverview.what, campaign.objective)}
          audienceWhy={plainOrFallback(executiveOverview.why, reasoning.whyBuilt)}
        />
      </div>
    </div>
  );
}

function ReviewCallout({
  summary,
  campaignName,
  decisionTargetId,
  agentName,
}: {
  summary: CampaignPackageSummary;
  campaignName: string;
  decisionTargetId: string | undefined;
  agentName: string;
}) {
  const hasReview = summary.review > 0;
  const href = decisionTargetId ? `#piece-${decisionTargetId}` : "#package";
  const title = hasReview ? `${summary.review} piece${summary.review === 1 ? "" : "s"} need review` : "Package is not waiting on review";
  const body = hasReview
    ? `${campaignName} is ready for a quick human pass. Read the piece, then approve it or ask ${agentName} for rework.`
    : summary.total > 0
      ? "Everything in the current package has moved past the review step."
      : `${agentName} has not added campaign pieces yet.`;

  return (
    <div
      className={`border-b border-[var(--border-hairline)] px-5 py-4 ${
        hasReview ? "bg-[var(--warn-soft)]" : "bg-[var(--surface-soft)]"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
          <p className="mt-1 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
        </div>
        <Link href={href} className={buttonClasses({ size: "sm", variant: hasReview ? "revision" : "ghost", className: "shrink-0 justify-center" })}>
          {hasReview ? "Start review" : "View package"}
        </Link>
      </div>
    </div>
  );
}

function CampaignProgressBar({ checklist }: { checklist: ReturnType<typeof buildCampaignChecklist> }) {
  if (checklist.length === 0) return null;

  const completedCount = checklist.filter((step) => step.state === "done").length;
  const activeStep = checklist.find((step) => step.state === "active") ?? checklist.find((step) => step.state === "locked") ?? checklist[checklist.length - 1];
  const activeIndex = Math.max(0, checklist.findIndex((step) => step.label === activeStep.label));
  const percent = Math.round((completedCount / checklist.length) * 100);

  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--elev-panel)]" aria-label="Campaign checklist progress">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Campaign progress</h2>
            <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
              {completedCount}/{checklist.length} complete
            </span>
            <span className="rounded-md border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--warn-text)]">
              Current
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm leading-5 text-[var(--text-secondary)]">
            Step {activeIndex + 1} of {checklist.length}: <span className="font-semibold text-[var(--text-primary)]">{activeStep.label}</span>
          </p>
        </div>
        <div className="font-mono text-sm font-bold text-[var(--text-primary)]">{percent}% complete</div>
      </div>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${checklist.length}, minmax(0, 1fr))` }}>
        {checklist.map((step, index) => (
          <div key={step.label} className="min-w-0">
            <div
              className={`h-3 rounded-full ${progressSegmentClass(step.state)}`}
              title={`${index + 1}. ${step.label}: ${step.detail}`}
            />
            <div className={`mt-1.5 hidden truncate text-[11px] font-bold uppercase tracking-[0.08em] md:block ${progressLabelClass(step.state)}`}>
              {step.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CampaignContextRail({
  detail,
  facts,
  checklist,
  agentName,
  goal,
  audienceWhy,
}: {
  detail: LiveCampaignWorkspace;
  facts: ReturnType<typeof buildSendExportFacts>;
  checklist: ReturnType<typeof buildCampaignChecklist>;
  agentName: string;
  goal: string;
  audienceWhy: string;
}) {
  const { campaign, reasoning } = detail;

  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <CampaignBriefTabs
        agentName={agentName}
        audienceSummary={plainOrFallback(campaign.audienceSummary, "This campaign is not tied to a specific audience summary yet.")}
        campaignId={campaign.id}
        facts={facts}
        goal={goal}
        offer={plainOrFallback(campaign.offerSummary, "No offer has been set yet.")}
        recommendedAction={plainOrFallback(reasoning.recommendedAction, reasoning.whyBuilt || `Ask ${agentName} to revise or add missing pieces.`)}
        sources={detail.sources}
        steps={checklist}
        why={audienceWhy}
      />
    </aside>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 line-clamp-3 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function lifecycleTone(lifecycle: LiveCampaignWorkspace["launchState"]["lifecycle"]): PlainTone {
  if (lifecycle === "Live") return "green";
  if (lifecycle === "Ready") return "blue";
  if (lifecycle === "In review") return "amber";
  return "gray";
}

function progressSegmentClass(state: "done" | "active" | "locked") {
  if (state === "done") return "bg-[var(--ok)]";
  if (state === "active") return "bg-[var(--warn)] shadow-[0_0_0_1px_var(--warn-border-soft)]";
  return "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1px_var(--border-hairline)]";
}

function progressLabelClass(state: "done" | "active" | "locked") {
  if (state === "done") return "text-[var(--ok-text)]";
  if (state === "active") return "text-[var(--warn-text)]";
  return "text-[var(--text-muted)]";
}

function plainOrFallback(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed || /not been summarized|not recorded|not captured/i.test(trimmed)) return fallback;
  return trimmed;
}

function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
