"use client";

import Link from "next/link";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Search } from "lucide-react";

import { ChannelRow } from "@/app/_components/brand-logos";
import { cx } from "@/app/_components/theme";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
    <section className="space-y-5" aria-label="Campaign library">
      <div className="border-b border-[var(--border-hairline)] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <nav aria-label="Filter campaigns" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {views.map((view) => {
              const active = view.key === activeView;
              return (
                <Link
                  key={view.key}
                  href={viewHref(view.key, trimmedQuery)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "group inline-flex min-h-8 items-center gap-1.5 border-b py-1 text-[12px] font-semibold transition",
                    active
                      ? "border-[var(--accent)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {view.label}
                  <span className={cx("font-mono text-[10px] tabular-nums", active ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
                    {counts[view.key]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <form
            action="/campaigns"
            className="w-full lg:w-[22rem]"
            role="search"
          >
            <input type="hidden" name="view" value={activeView} />
            <label className="sr-only" htmlFor="campaign-search">
              Search campaigns
            </label>
            <InputGroup className="h-10 border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_80%,var(--canvas))]">
              <InputGroupAddon>
                <Search aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </InputGroupAddon>
              <InputGroupInput
                id="campaign-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search campaigns"
                className="text-sm"
              />
            </InputGroup>
            <button type="submit" className="sr-only">
              Search
            </button>
          </form>
        </div>
      </div>

      {filteredCampaigns.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <CampaignIndex campaigns={filteredCampaigns} agentName={agentName} />
          <CampaignFeaturedRail campaign={pickFeatured(filteredCampaigns)} agentName={agentName} />
        </div>
      ) : (
        <div className="border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 py-10 text-center">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">No campaigns in this view</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-6 text-[var(--text-secondary)]">
            Try another filter or clear the search.
          </p>
        </div>
      )}
    </section>
  );
}

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
    <section className="overflow-hidden border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Campaign queue</h2>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {campaigns.length} campaigns / {packageCount} pieces / {mediaCount} media
        </span>
      </div>
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(13rem,1.35fr)_minmax(8rem,0.7fr)_minmax(10rem,0.85fr)] gap-4 border-b border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-panel)_86%,var(--surface-inset))] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--text-muted)] md:grid"
      >
        <span>Campaign</span>
        <span>Audience</span>
        <span>Delivery</span>
      </div>
      {groups.map((group) => (
        <Collapsible.Root key={group.key} defaultOpen className="border-b border-[var(--border-hairline)] last:border-b-0">
          <Collapsible.Trigger className="group flex w-full items-center gap-2 bg-[color-mix(in_srgb,var(--surface-panel)_76%,var(--surface-inset))] px-4 py-2 text-left transition hover:bg-[var(--surface-inset)] [&[data-state=open]>svg]:rotate-180">
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform duration-150" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{group.label}</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{group.items.length}</span>
            <span aria-hidden className="h-px flex-1 bg-[var(--border-hairline)]" />
          </Collapsible.Trigger>
          <Collapsible.Content className="divide-y divide-[var(--border-hairline)]">
            {group.items.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} agentName={agentName} selected={campaign.id === featuredId} />
            ))}
          </Collapsible.Content>
        </Collapsible.Root>
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
  const channelNames = (campaign.channels.length > 0 ? campaign.channels : where).filter(
    (label) => label.toLowerCase() !== "not chosen",
  );
  const thumb = campaign.thumbnailUrl;

  return (
    <Link
      href={campaign.href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "grid gap-3 px-4 py-3 transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] md:grid-cols-[minmax(13rem,1.35fr)_minmax(8rem,0.7fr)_minmax(10rem,0.85fr)] md:items-center md:gap-4",
        selected ? "bg-[color-mix(in_srgb,var(--surface-inset)_54%,transparent)]" : "",
      )}
    >
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-serif text-sm font-semibold text-[var(--text-muted)]">{campaign.name.charAt(0)}</span>
          )}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{campaign.name}</h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="shrink-0 font-mono tabular-nums">{shortUpdatedAt(campaign.updatedAt)}</span>
            <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
            <span className="font-mono tabular-nums">{campaign.contentPieces.length} pieces</span>
            <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
            <span className={cx("truncate", statusTextClass(status.tone))}>{status.label}</span>
          </div>
        </div>
      </div>

      <MetaCell label="Audience">{targetLabel(campaign.persona)}</MetaCell>

      <div className="flex min-w-0 items-center gap-2 md:block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] md:hidden">Delivery</span>
        <div className="flex min-w-0 items-center gap-2">
          <ChannelRow channels={channelNames} size={18} max={4} />
          <span className="min-w-0 truncate text-[11px] text-[var(--text-secondary)]">{channelNames.slice(0, 3).join(", ") || "Not chosen"}</span>
        </div>
        <div className="mt-1 hidden font-mono text-[10px] tabular-nums text-[var(--text-muted)] md:block">
          {campaign.contentPieces.length} pieces{campaign.mediaCount > 0 ? ` / ${campaign.mediaCount} media` : ""}
        </div>
      </div>
    </Link>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 md:block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] md:hidden">{label}</span>
      <span className="min-w-0 truncate text-[12px] text-[var(--text-secondary)] md:block">{children}</span>
    </div>
  );
}

function statusTextClass(tone: string) {
  if (tone === "green") return "text-[var(--ok-text)]";
  if (tone === "amber") return "text-[var(--warn-text)]";
  if (tone === "red") return "text-[var(--priority-text)]";
  if (tone === "blue" || tone === "dark") return "text-[var(--accent-contrast)]";
  return "text-[var(--text-muted)]";
}

function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}

function shortUpdatedAt(value: string) {
  return value.replace(/,\s*\d{4}.*$/, "");
}

function viewHref(view: CampaignManagerView, query: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (query) params.set("q", query);
  return `/campaigns?${params.toString()}`;
}
