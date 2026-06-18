"use client";

import Link from "next/link";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Archive,
  ChevronDown,
  CircleAlert,
  List,
  PencilLine,
  Radio,
  Search,
  Send,
  type LucideIcon,
} from "lucide-react";

import { ChannelRow } from "@/app/_components/brand-logos";
import { cx, theme } from "@/app/_components/theme";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignFeaturedRail } from "./campaign-featured-rail";
import {
  campaignManagerStatus,
  campaignManagerWhere,
  campaignNextStep,
  campaignPreviewText,
  filterCampaignManagerItems,
  managerViewCounts,
  type CampaignManagerView,
} from "./library-model";

function buildViews(agentName: string): Array<{ key: CampaignManagerView; label: string; icon: LucideIcon }> {
  return [
    { key: "needs-attention", label: "Needs review", icon: CircleAlert },
    { key: "all", label: "All", icon: List },
    { key: "arc-working", label: `${agentName} drafting`, icon: PencilLine },
    { key: "ready-to-send", label: "Ready", icon: Send },
    { key: "live", label: "Live", icon: Radio },
    { key: "archived", label: "Archived", icon: Archive },
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
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <nav aria-label="Filter campaigns" className={cx(theme.control.tabList, "min-w-0 flex-1 pb-2")}>
            {views.map((view) => {
              const active = view.key === activeView;
              const Icon = view.icon;
              return (
                <Link
                  key={view.key}
                  href={viewHref(view.key, trimmedQuery)}
                  aria-current={active ? "page" : undefined}
                  className={cx(theme.control.tabBase, active ? theme.control.tabActive : theme.control.tabIdle)}
                >
                  <Icon
                    aria-hidden
                    className={cx(theme.control.tabIcon, active ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]")}
                    strokeWidth={1.8}
                  />
                  <span className="whitespace-nowrap">{view.label}</span>
                  <span className={cx(theme.control.tabBadge, active ? "text-[var(--accent)]" : "")}>
                    {counts[view.key]}
                  </span>
                  {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
                </Link>
              );
            })}
          </nav>

          <form
            action="/campaigns"
            className="w-full xl:w-[22rem]"
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

type LifecycleGroup = {
  key: string;
  label: string;
  summary: string;
  tone: "amber" | "green" | "blue" | "gray";
  items: CampaignWorkspaceListItem[];
};

function groupByLifecycle(campaigns: CampaignWorkspaceListItem[]): LifecycleGroup[] {
  const isArchived = (campaign: CampaignWorkspaceListItem) => /archived/i.test(campaign.status);
  const needsReview = campaigns.filter((campaign) => !isArchived(campaign) && (campaign.pendingCount > 0 || campaign.lifecycle === "In review"));
  const live = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Live");
  const ready = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Ready");
  const drafting = campaigns.filter((campaign) => !isArchived(campaign) && campaign.lifecycle === "Drafting");
  const archived = campaigns.filter(isArchived);
  const groups: LifecycleGroup[] = [
    { key: "review", label: "Needs review", summary: "Human decision required", tone: "amber", items: needsReview },
    { key: "live", label: "In market", summary: "Running now", tone: "green", items: live },
    { key: "ready", label: "Ready to send", summary: "Approved and waiting", tone: "blue", items: ready },
    { key: "drafting", label: "Drafting", summary: "Still being prepared", tone: "gray", items: drafting },
    { key: "archived", label: "Archived", summary: "Saved for reuse", tone: "gray", items: archived },
  ];
  return groups.filter((group) => group.items.length > 0);
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
    <section className="overflow-hidden border border-[var(--border-panel)] bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)] shadow-[var(--elev-panel)]">
      <div className="grid gap-2 border-b border-[var(--border-hairline)] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Campaign queue</h2>
          <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-muted)]">Open the packet when a campaign needs work.</p>
        </div>
        <div className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          <span className="text-[var(--text-primary)]">{campaigns.length}</span> campaigns
          <span className="mx-2 text-[var(--border-strong)]">/</span>
          <span className="text-[var(--text-primary)]">{packageCount}</span> pieces
          <span className="mx-2 text-[var(--border-strong)]">/</span>
          <span className="text-[var(--text-primary)]">{mediaCount}</span> media
        </div>
      </div>
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(17rem,1.45fr)_minmax(9rem,0.7fr)_minmax(12rem,0.85fr)] gap-4 border-b border-[var(--border-hairline)] px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)] md:grid"
      >
        <span>Campaign</span>
        <span>Next action</span>
        <span>Delivery</span>
      </div>
      {groups.map((group) => (
        <Collapsible.Root key={group.key} defaultOpen className="border-b border-[var(--border-hairline)] last:border-b-0">
          <Collapsible.Trigger className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-left transition hover:bg-[color-mix(in_srgb,var(--surface-inset)_54%,transparent)] [&[data-state=open]>svg]:rotate-180">
            <span aria-hidden className={cx("h-4 w-px", groupToneClass(group.tone))} />
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-primary)]">{group.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{group.items.length}</span>
              <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:inline">{group.summary}</span>
            </span>
            <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-150" />
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
  const nextStep = campaignNextStep(campaign, agentName);
  const preview = campaignPreviewText(campaign, agentName);
  const rowPreview = campaignRowPreview(campaign, preview);
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
        "group/row relative grid gap-3 px-4 py-3 transition hover:bg-[color-mix(in_srgb,var(--surface-raised)_68%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] md:grid-cols-[minmax(17rem,1.45fr)_minmax(9rem,0.7fr)_minmax(12rem,0.85fr)] md:items-center md:gap-4",
        selected ? "bg-[color-mix(in_srgb,var(--surface-inset)_36%,transparent)]" : "",
      )}
    >
      <span aria-hidden className={cx("absolute inset-y-3 left-0 w-px", groupToneClass(status.tone))} />
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-inset)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-serif text-sm font-semibold text-[var(--text-muted)]">{campaign.name.charAt(0)}</span>
          )}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)] group-hover/row:text-[var(--accent-contrast)]">
            {campaign.name}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-5 text-[var(--text-secondary)]">{rowPreview.text}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
            <span className="shrink-0 font-mono tabular-nums">{shortUpdatedAt(campaign.updatedAt)}</span>
            <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
            <span className="font-mono tabular-nums">{campaign.contentPieces.length} pieces</span>
            <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
            <span className="truncate">{rowPreview.label}</span>
            <span aria-hidden className="h-2.5 w-px bg-[var(--border-hairline)]" />
            <span className={cx("truncate", statusTextClass(status.tone))}>{status.label}</span>
          </div>
        </div>
      </div>

      <div className="min-w-0 md:border-l md:border-[var(--border-hairline)] md:pl-3">
        <div className={cx("text-[12px] font-semibold leading-5", statusTextClass(status.tone))}>{nextStep}</div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{targetLabel(campaign.persona)}</div>
      </div>

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

function statusTextClass(tone: string) {
  if (tone === "green") return "text-[var(--ok-text)]";
  if (tone === "amber") return "text-[var(--warn-text)]";
  if (tone === "red") return "text-[var(--priority-text)]";
  if (tone === "blue" || tone === "dark") return "text-[#9dc3e6]";
  return "text-[var(--text-muted)]";
}

function groupToneClass(tone: string) {
  if (tone === "green") return "bg-[var(--ok)]";
  if (tone === "amber") return "bg-[var(--warn)]";
  if (tone === "red") return "bg-[var(--priority)]";
  if (tone === "blue" || tone === "dark") return "bg-[#6fa8d8]";
  return "bg-[var(--border-strong)]";
}

function campaignRowPreview(
  campaign: CampaignWorkspaceListItem,
  preview: { label: string; text: string },
): { label: string; text: string } {
  if (!isPlaceholderCampaignText(preview.text)) {
    return preview;
  }
  if (usefulCampaignText(campaign.objective)) {
    return { label: "Objective", text: campaign.objective.trim() };
  }
  if (usefulCampaignText(campaign.audienceSummary)) {
    return { label: "Audience", text: campaign.audienceSummary.trim() };
  }
  if (usefulCampaignText(campaign.offerSummary)) {
    return { label: "Offer", text: campaign.offerSummary.trim() };
  }
  return { label: "Packet", text: "Review the prepared packet and decide whether it should move forward." };
}

function usefulCampaignText(value: string) {
  const text = value.trim();
  return text.length > 0 && !isPlaceholderCampaignText(text);
}

function isPlaceholderCampaignText(value: string) {
  const text = value.trim();
  return /^no\s+.+\s+captured\s+yet\.?$/i.test(text) || /\bhas not\b.+\byet\.?$/i.test(text);
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
