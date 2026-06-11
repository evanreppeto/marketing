import Link from "next/link";

import { buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { campaignManagerWhere, campaignNextStep } from "./library-model";

export function CampaignManagerPreview({ campaign, id }: { campaign: CampaignWorkspaceListItem; id?: string }) {
  const where = campaignManagerWhere(campaign);
  const nextStep = campaignNextStep(campaign);

  return (
    <div id={id} className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-4 sm:px-5">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.9fr_0.8fr]">
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Campaign preview</h3>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{campaign.whyBuilt || campaign.objective}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={campaign.href} className={buttonClasses({ size: "sm" })}>
              Open full page
            </Link>
            <Link href={`${campaign.href}?focus=mark`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Ask Mark
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">What is inside</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {campaign.assetTypes.length > 0 ? (
              campaign.assetTypes.slice(0, 4).map((type) => (
                <div key={type} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs">
                  <strong className="block text-[var(--text-primary)]">{humanize(type)}</strong>
                  <span className="text-[var(--text-muted)]">Content piece</span>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
                Mark is still building the content.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Can it go out?</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <PreviewFact label="Destinations" value={where.join(", ")} />
            <PreviewFact label="Ready pieces" value={readinessLabel(campaign)} />
            <PreviewFact label="Best next step" value={nextStep} />
          </dl>
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

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readinessLabel(campaign: CampaignWorkspaceListItem) {
  if (campaign.assetCount === 0 || campaign.lifecycle === "Drafting" || campaign.pendingCount > 0) return "Not yet";
  return "Ready";
}
