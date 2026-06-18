import Link from "next/link";

import { ChannelRow } from "@/app/_components/brand-logos";
import { StatusPill } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignFeaturedRail } from "./campaign-featured-rail";
import {
  campaignManagerStatus,
  campaignManagerWhere,
  filterCampaignManagerItems,
  managerViewCounts,
  type CampaignManagerView,
} from "./library-model";

function buildViews(agentName: string): Array<{ key: CampaignManagerView; label: string }> {
  return [
    { key: "needs-attention", label: "Needs review" },
    { key: "all", label: "All" },
    { key: "arc-working", label: `${agentName} drafting` },
    { key: "ready-to-send", label: "Ready" },
    { key: "live", label: "Live" },
    { key: "archived", label: "Archived" },
  ];
}

export function CampaignLibrary({
  campaigns,
  activeView,
  query,
  agentName,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeView: CampaignManagerView;
  query: string;
  agentName: string;
}) {
  const views = buildViews(agentName);
  const counts = managerViewCounts(campaigns);
  const trimmedQuery = query.trim();
  const filteredCampaigns = filterCampaignManagerItems(campaigns, activeView, trimmedQuery);

  return (
    <section className="space-y-4" aria-label="Campaign library">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Filter campaigns" className="flex flex-wrap gap-2">
          {views.map((view) => {
            const active = view.key === activeView;
            return (
              <Link
                key={view.key}
                href={viewHref(view.key, trimmedQuery)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${
                  active
                    ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                }`}
              >
                {view.label}
                <span className={`font-mono text-[11px] tabular-nums ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                  {counts[view.key]}
                </span>
              </Link>
            );
          })}
        </nav>

        <form action="/campaigns" className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto" role="search">
          <input type="hidden" name="view" value={activeView} />
          <label className="sr-only" htmlFor="campaign-search">
            Search campaigns
          </label>
          <input
            id="campaign-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search campaign, audience, or content"
            className="min-h-10 min-w-0 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] sm:w-80"
          />
          <button
            type="submit"
            className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
          >
            Search
          </button>
        </form>
      </div>

      {filteredCampaigns.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <CampaignIndex campaigns={filteredCampaigns} agentName={agentName} />
          <CampaignFeaturedRail campaign={pickFeatured(filteredCampaigns)} agentName={agentName} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 py-10 text-center">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">No campaigns in this view</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-6 text-[var(--text-secondary)]">
            Try another filter or clear the search.
          </p>
        </div>
      )}
    </section>
  );
}

/** Lifecycle grouping for the library list. Order matches the operator's
 *  attention priority: review first, then in-market, ready, drafting, archived. */
type LifecycleGroup = { key: string; label: string; items: CampaignWorkspaceListItem[] };

function groupByLifecycle(campaigns: CampaignWorkspaceListItem[]): LifecycleGroup[] {
  const isArchived = (campaign: CampaignWorkspaceListItem) => /archived/i.test(campaign.status);
  const needsReview = campaigns.filter((campaign) => !isArchived(campaign) && (campaign.pendingCount > 0 || campaign.lifecycle === "In review"));
  const live = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Live");
  const ready = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Ready");
  const drafting = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Drafting");
  const archived = campaigns.filter(isArchived);
  return [
    { key: "review", label: "Needs review", items: needsReview },
    { key: "live", label: "In market", items: live },
    { key: "ready", label: "Ready to send", items: ready },
    { key: "drafting", label: "Drafting", items: drafting },
    { key: "archived", label: "Archived", items: archived },
  ].filter((group) => group.items.length > 0);
}

/** Featured = the most attention-worthy campaign: a piece needing review wins,
 *  else the most recently updated. Drives the rich right rail. */
function pickFeatured(campaigns: CampaignWorkspaceListItem[]): CampaignWorkspaceListItem {
  const needsReview = campaigns.find((campaign) => campaign.pendingCount > 0 || campaign.lifecycle === "In review");
  return needsReview ?? campaigns[0];
}

function CampaignIndex({ campaigns, agentName }: { campaigns: CampaignWorkspaceListItem[]; agentName: string }) {
  const groups = groupByLifecycle(campaigns);
  const packageCount = campaigns.reduce((total, campaign) => total + campaign.contentPieces.length, 0);
  const mediaCount = campaigns.reduce((total, campaign) => total + campaign.mediaCount, 0);
  const featuredId = pickFeatured(campaigns).id;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2.5">
        <h2 className="text-sm font-bold text-[var(--text-primary)]">Campaign library</h2>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {campaigns.length} campaigns · {packageCount} pieces · {mediaCount} media
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{group.label}</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{group.items.length}</span>
            <span aria-hidden className="h-px flex-1 bg-[var(--border-hairline)]" />
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {group.items.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} agentName={agentName} selected={campaign.id === featuredId} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function CampaignRow({
  campaign,
  agentName,
  selected,
}: {
  campaign: CampaignWorkspaceListItem;
  agentName: string;
  selected: boolean;
}) {
  const status = campaignManagerStatus(campaign, agentName);
  const where = campaignManagerWhere(campaign);
  // Prefer the canonical channel names (Email / SMS / Meta / Landing page) so the
  // brand-logo resolver maps cleanly; fall back to the asset-derived "where" labels.
  const channelNames = (campaign.channels.length > 0 ? campaign.channels : where).filter(
    (label) => label.toLowerCase() !== "not chosen",
  );
  const thumb = campaign.thumbnailUrl;

  return (
    <Link
      href={campaign.href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]",
        selected ? "bg-[var(--surface-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "",
      )}
    >
      {/* Thumbnail */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-serif text-sm font-semibold text-[var(--text-muted)]">{campaign.name.charAt(0)}</span>
        )}
      </span>

      {/* Name + persona + channels */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold tracking-[-0.01em] text-[var(--text-primary)]">{campaign.name}</h3>
          <span className="hidden shrink-0 rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-muted)] sm:inline">
            {targetLabel(campaign.persona)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2.5">
          <ChannelRow channels={channelNames} size={18} max={4} />
          <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
          <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{campaign.contentPieces.length} pieces</span>
          {campaign.mediaCount > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{campaign.mediaCount} media</span>
          ) : null}
        </div>
      </div>

      {/* Status + date */}
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <span className="hidden w-16 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)] sm:block">{campaign.updatedAt}</span>
      </div>
    </Link>
  );
}

function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}

function viewHref(view: CampaignManagerView, query: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (query) params.set("q", query);
  return `/campaigns?${params.toString()}`;
}
