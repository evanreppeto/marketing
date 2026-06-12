"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import {
  campaignManagerStatus,
  campaignManagerSummary,
  campaignManagerWhere,
  campaignNextStep,
  type CampaignManagerTone,
} from "./library-model";
import { CampaignManagerPreview } from "./campaign-manager-preview";

const TONE: Record<CampaignManagerTone, "amber" | "blue" | "green" | "gray" | "red"> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  gray: "gray",
  red: "red",
};

export function CampaignManagerRow({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const status = campaignManagerStatus(campaign);
  const summary = campaignManagerSummary(campaign);
  const where = campaignManagerWhere(campaign);
  const nextStep = campaignNextStep(campaign);

  return (
    <article className="overflow-hidden border-b border-[var(--border-hairline)] last:border-b-0">
      <div className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[34px_minmax(220px,1.5fr)_120px_130px_120px_minmax(150px,1fr)_88px] md:items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${campaign.name}`}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono text-sm font-bold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          {expanded ? "v" : ">"}
        </button>

        <div className="min-w-0">
          <Link href={campaign.href} className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]">
            {campaign.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
            {campaign.audienceSummary || campaign.objective}
          </p>
        </div>

        <div className="min-w-0">
          <MobileLabel>Status</MobileLabel>
          <StatusPill tone={TONE[status.tone]}>{status.label}</StatusPill>
        </div>

        <div className="text-xs leading-5 text-[var(--text-secondary)]">
          <MobileLabel>Content</MobileLabel>
          <div className="font-semibold text-[var(--text-primary)]">{summary.primary}</div>
          <div>{summary.secondary}</div>
        </div>

        <div className="text-xs leading-5 text-[var(--text-secondary)]">
          <MobileLabel>Where</MobileLabel>
          {where.slice(0, 2).join(", ")}
        </div>

        <div className="text-xs font-bold leading-5 text-[var(--text-primary)]">
          <MobileLabel>Next step</MobileLabel>
          {nextStep}
        </div>

        <Link href={campaign.href} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          {openLabel(campaign)}
        </Link>
      </div>

      {expanded ? <CampaignManagerPreview campaign={campaign} id={panelId} /> : null}
    </article>
  );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">{children}</div>;
}

function openLabel(campaign: CampaignWorkspaceListItem) {
  if (campaign.pendingCount > 0) return "Review";
  if (campaign.lifecycle === "Ready") return "Send";
  if (campaign.lifecycle === "Live") return "Results";
  if (campaign.lifecycle === "Drafting") return "Guide Mark";
  return "Open";
}
