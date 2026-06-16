import Link from "next/link";

import { useAgentName } from "@/app/_components/agent-name-context";
import { buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { campaignAssetKindLabel, campaignDecisionPrompt, campaignManagerWhere, campaignNextStep, campaignPreviewText } from "./library-model";

export function CampaignManagerPreview({ campaign, id }: { campaign: CampaignWorkspaceListItem; id?: string }) {
  const agentName = useAgentName();
  const where = campaignManagerWhere(campaign);
  const nextStep = campaignNextStep(campaign, agentName);
  const preview = campaignPreviewText(campaign, agentName);

  return (
    <div id={id} className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-4 sm:px-5">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.9fr_0.8fr]">
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">What {agentName} made</h3>
          <div className="mt-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{preview.label}</div>
            <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm leading-5 text-[var(--text-secondary)]">{preview.text}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={campaign.href} className={buttonClasses({ size: "sm" })}>
              Review full campaign
            </Link>
            <Link href={`${campaign.href}#arc`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Ask {agentName}
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Who and what</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <PreviewFact label="Audience" value={campaign.audienceSummary || "Audience not set"} />
            <PreviewFact label="Offer" value={campaign.offerSummary || "Offer not set"} />
            <PreviewFact label="Destinations" value={where.join(", ")} />
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {campaign.pendingDeliverables.length > 0 ? (
              campaign.pendingDeliverables.slice(0, 4).map((item) => (
                <div key={item.assetId} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs">
                  <strong className="block text-[var(--text-primary)]">{campaignAssetKindLabel(item.kind)}</strong>
                  <span className="text-[var(--text-muted)]">Needs review</span>
                </div>
              ))
            ) : campaign.assetTypes.length > 0 ? (
              campaign.assetTypes.slice(0, 4).map((type) => (
                <div key={type} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs">
                  <strong className="block text-[var(--text-primary)]">{humanize(type)}</strong>
                  <span className="text-[var(--text-muted)]">Content piece</span>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
                {agentName} is still building the content.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">What should happen next?</h3>
          <ol className="mt-3 space-y-2">
            <ChecklistItem done={campaign.pendingCount === 0} label="Review content" detail={campaign.pendingCount > 0 ? `${campaign.pendingCount} waiting` : "Done"} />
            <ChecklistItem done={campaign.lifecycle === "Ready" || campaign.lifecycle === "Live"} label="Approve pieces" detail={readinessLabel(campaign)} />
            <ChecklistItem done={campaign.lifecycle === "Live"} label="Send or export" detail={nextStep} />
          </ol>
          <p className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {campaignDecisionPrompt(campaign, agentName)}
          </p>
        </section>
      </div>
    </div>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-[var(--border-hairline)] pt-2 first:border-t-0 first:pt-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function ChecklistItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs">
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${
          done
            ? "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
            : "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]"
        }`}
      >
        {done ? "OK" : "!"}
      </span>
      <span className="min-w-0">
        <strong className="block text-[var(--text-primary)]">{label}</strong>
        <span className="text-[var(--text-muted)]">{detail}</span>
      </span>
    </li>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readinessLabel(campaign: CampaignWorkspaceListItem) {
  if (campaign.assetCount === 0 || campaign.lifecycle === "Drafting" || campaign.pendingCount > 0) return "Not yet";
  return "Ready";
}
