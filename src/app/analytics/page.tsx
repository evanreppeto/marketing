import { connection } from "next/server";
import Link from "next/link";

import { EmptyState, PageHeader } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getAppSettings } from "@/lib/settings/store";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  await connection();

  const [list, settings] = await Promise.all([getCampaignWorkspaceList(), getAppSettings()]);
  const brand = { workspaceName: settings.workspaceName, logoUrl: settings.brandLogoUrl };

  if (list.status === "unavailable") {
    return (
      <>
        <AnalyticsHeader brand={brand} />
        <EmptyState
          title="No campaign data to show yet"
          detail="Once campaigns are connected, this page will show how each one is doing and what is waiting on you."
        />
      </>
    );
  }

  const campaigns = list.campaigns;
  const rows = campaigns.map(toComparisonRow).sort(byMostNeedingAttention);

  const readyCount = rows.filter((row) => row.state === "ready").length;
  const waitingOnYou = rows.reduce((total, row) => total + row.pending, 0);

  return (
    <>
      <AnalyticsHeader brand={brand} />

      <MetricStrip
        metrics={[
          {
            label: "Waiting on you",
            value: waitingOnYou,
            detail: waitingOnYou > 0 ? "Pieces that need your approval." : "You're all caught up.",
            tone: waitingOnYou > 0 ? "amber" : "green",
            href: waitingOnYou > 0 ? "/campaigns" : undefined,
          },
          {
            label: "Approved & ready",
            value: readyCount,
            detail: "Every piece signed off.",
            tone: readyCount > 0 ? "green" : "gray",
          },
          {
            label: "Campaigns",
            value: list.totals.campaigns,
            detail: "All campaigns in your workspace.",
            tone: list.totals.campaigns > 0 ? "blue" : "gray",
          },
          {
            label: "Creative made",
            value: list.totals.assets,
            detail: "Assets drafted across campaigns.",
            tone: list.totals.assets > 0 ? "blue" : "gray",
          },
        ]}
      />

      <WorkspacePanel
        title="Compare your campaigns"
        description="Each campaign and how far it has moved from draft to approved. Anything waiting on you is flagged so it is easy to spot what to do next."
      >
        {rows.length > 0 ? (
          <ul className="divide-y divide-[var(--border-hairline)]">
            {rows.map((row) => (
              <ComparisonRow key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No campaigns yet"
            detail="When Mark drafts a campaign or you create one, it will appear here with its progress."
          />
        )}
      </WorkspacePanel>

      <p className="mt-5 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
        Want deeper numbers like views, clicks, and booked jobs? Those need a one-time backend setup before they are
        trustworthy &mdash; see the{" "}
        <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href="/reports">
          detailed performance view
        </Link>{" "}
        for exactly which fields are still needed.
      </p>
    </>
  );
}

type ComparisonRowData = {
  id: string;
  name: string;
  persona: string;
  href: string;
  updatedAt: string;
  assetCount: number;
  approved: number;
  total: number;
  pending: number;
  changes: number;
  readiness: number;
  state: "ready" | "changes" | "waiting" | "draft";
};

function toComparisonRow(campaign: CampaignWorkspaceListItem): ComparisonRowData {
  const { approved, pending, changes, total } = campaign.rollup;
  const readiness = total > 0 ? Math.round((approved / total) * 100) : 0;

  const state: ComparisonRowData["state"] =
    changes > 0 ? "changes" : pending > 0 ? "waiting" : total > 0 && approved === total ? "ready" : "draft";

  return {
    id: campaign.id,
    name: campaign.name,
    persona: campaign.persona,
    href: campaign.href,
    updatedAt: campaign.updatedAt,
    assetCount: campaign.assetCount,
    approved,
    total,
    pending,
    changes,
    readiness,
    state,
  };
}

/** Surface what needs the operator first: changes, then approvals, then the rest by progress. */
function byMostNeedingAttention(a: ComparisonRowData, b: ComparisonRowData) {
  const weight = (row: ComparisonRowData) => (row.state === "changes" ? 3 : row.state === "waiting" ? 2 : 0);
  const diff = weight(b) - weight(a);
  if (diff !== 0) return diff;
  return b.readiness - a.readiness;
}

function ComparisonRow({ row }: { row: ComparisonRowData }) {
  return (
    <li>
      <Link
        className="grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-inset)] sm:grid-cols-[minmax(0,1fr)_200px_150px] sm:items-center"
        href={row.href}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-[var(--text-primary)]">{row.name}</span>
            <StateBadge row={row} />
          </div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            {row.persona} &middot; {row.assetCount} {row.assetCount === 1 ? "asset" : "assets"} &middot; updated {row.updatedAt}
          </div>
        </div>

        <div className="min-w-0">
          <ProgressBar readiness={row.readiness} />
          <div className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
            {row.total > 0 ? `${row.approved} of ${row.total} pieces approved` : "No pieces drafted yet"}
          </div>
        </div>

        <div className="font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)] sm:text-right">
          {row.readiness}%
        </div>
      </Link>
    </li>
  );
}

function ProgressBar({ readiness }: { readiness: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]" aria-hidden="true">
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-[width]"
        style={{ width: `${Math.max(readiness, readiness > 0 ? 4 : 0)}%` }}
      />
    </div>
  );
}

function StateBadge({ row }: { row: ComparisonRowData }) {
  const config =
    row.state === "changes"
      ? {
          label: `${row.changes} need ${row.changes === 1 ? "a change" : "changes"}`,
          className: "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]",
        }
      : row.state === "waiting"
        ? {
            label: `${row.pending} waiting for approval`,
            className: "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]",
          }
        : row.state === "ready"
          ? {
              label: "Ready",
              className: "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]",
            }
          : {
              label: "In draft",
              className: "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
            };

  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.className}`}>
      {config.label}
    </span>
  );
}

function AnalyticsHeader({ brand }: { brand: { workspaceName: string; logoUrl: string } }) {
  return (
    <div className="mb-5">
      <PageHeader
        title="Analytics"
        description="A simple read on your campaigns and what is waiting on you."
        aside={
          <div className="flex items-center gap-2 px-1.5 py-0.5">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-configured logo may be external or a data URL.
              <img alt="" className="h-5 w-5 shrink-0 rounded object-contain" src={brand.logoUrl} />
            ) : null}
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{brand.workspaceName}</span>
          </div>
        }
      />
    </div>
  );
}
