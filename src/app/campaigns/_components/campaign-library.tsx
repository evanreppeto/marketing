import Link from "next/link";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { CampaignListContentPiece, CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

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
  const librarySummary = summarizeLibrary(filteredCampaigns);

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

      <LibrarySummary
        visibleCount={filteredCampaigns.length}
        totalCount={campaigns.length}
        activeView={activeView}
        summary={librarySummary}
        query={trimmedQuery}
      />

      {filteredCampaigns.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <CampaignIndex campaigns={filteredCampaigns} agentName={agentName} />
          <CampaignPreviewPanel campaign={filteredCampaigns[0]} agentName={agentName} />
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

function LibrarySummary({
  visibleCount,
  totalCount,
  activeView,
  summary,
  query,
}: {
  visibleCount: number;
  totalCount: number;
  activeView: CampaignManagerView;
  summary: ReturnType<typeof summarizeLibrary>;
  query: string;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--text-primary)]">Campaign workbench</div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          {viewLabel(activeView)}. Showing {visibleCount} of {totalCount} campaign{totalCount === 1 ? "" : "s"}
          {query ? ` matching "${query}"` : ""}. Choose a row for the quick read, then open the full packet for media, drafts, and approvals.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5 md:flex md:flex-wrap md:justify-end">
        <LibraryMetric label="Total" value={summary.campaigns} />
        <LibraryMetric label="Needs review" value={summary.review} attention={summary.review > 0} />
        <LibraryMetric label="Ready" value={summary.ready} />
        <LibraryMetric label="Drafting" value={summary.drafting} />
        <LibraryMetric label="Live" value={summary.live} />
      </dl>
    </div>
  );
}

function LibraryMetric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${attention ? "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]" : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)]"}`}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">{label}</dt>
      <dd className="mt-1 font-mono text-base font-bold leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function CampaignIndex({ campaigns, agentName }: { campaigns: CampaignWorkspaceListItem[]; agentName: string }) {
  const packageCount = campaigns.reduce((total, campaign) => total + campaign.contentPieces.length, 0);
  const mediaCount = campaigns.reduce((total, campaign) => total + campaign.mediaCount, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-1 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Campaign library</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {packageCount} piece{packageCount === 1 ? "" : "s"} across this view, including {mediaCount} media item{mediaCount === 1 ? "" : "s"}.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)]">{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</span>
      </div>
      <div className="hidden border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] md:grid md:grid-cols-[minmax(220px,1.45fr)_130px_150px_120px_34px] md:gap-3">
        <span>Campaign</span>
        <span>Status</span>
        <span>Channels</span>
        <span>Updated</span>
        <span aria-hidden />
      </div>
      <div className="divide-y divide-[var(--border-hairline)]">
        {campaigns.map((campaign, index) => (
          <CampaignRow key={campaign.id} campaign={campaign} agentName={agentName} selected={index === 0} />
        ))}
      </div>
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

  return (
    <Link
      href={campaign.href}
      aria-current={selected ? "true" : undefined}
      className={`grid gap-3 px-4 py-4 transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] md:grid-cols-[minmax(220px,1.45fr)_130px_150px_120px_34px] md:items-center md:gap-3 ${
        selected ? "bg-[var(--surface-soft)] shadow-[inset_3px_0_0_var(--accent)]" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <span className="font-mono text-xs text-[var(--text-muted)]">{campaign.updatedAt}</span>
        </div>
        <h2 className="mt-1 truncate text-base font-bold tracking-[-0.02em] text-[var(--text-primary)] md:mt-0">{campaign.name}</h2>
        <p className="mt-1 line-clamp-1 text-sm text-[var(--text-secondary)]">{plainOrFallback(campaign.audienceSummary, targetLabel(campaign.persona))}</p>
      </div>
      <div className="hidden md:block">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {where.slice(0, 3).map((label) => (
          <span key={label} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
            {label}
          </span>
        ))}
      </div>
      <div className="hidden font-mono text-xs text-[var(--text-muted)] md:block">{campaign.updatedAt}</div>
      <span aria-hidden className="hidden h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--text-muted)] md:inline-flex">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </span>
    </Link>
  );
}

function CampaignPreviewPanel({ campaign, agentName }: { campaign: CampaignWorkspaceListItem; agentName: string }) {
  const status = campaignManagerStatus(campaign, agentName);
  const where = campaignManagerWhere(campaign);
  const reviewCopy = campaign.pendingCount > 0
    ? `${campaign.pendingCount} piece${campaign.pendingCount === 1 ? "" : "s"} need${campaign.pendingCount === 1 ? "s" : ""} review`
    : campaign.rollup.label;

  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <div className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <span className="font-mono text-xs text-[var(--text-muted)]">{campaign.contentPieces.length} pieces</span>
          </div>
          <h2 className="mt-3 font-serif text-2xl font-semibold leading-tight tracking-[-0.015em] text-[var(--text-primary)]">{campaign.name}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{bestCampaignSummary(campaign)}</p>
          <Link href={campaign.href} className={buttonClasses({ size: "md", className: "mt-4 w-full justify-center" })}>
            Open full campaign packet
          </Link>
        </div>

        <dl className="divide-y divide-[var(--border-hairline)]">
          <PreviewFact label="Audience" value={plainOrFallback(campaign.audienceSummary, targetLabel(campaign.persona))} />
          <PreviewFact label="Offer" value={plainOrFallback(campaign.offerSummary, "Offer not set")} />
          <PreviewFact label="Channels" value={where.join(", ")} />
          <PreviewFact label="Review status" value={reviewCopy} />
        </dl>

        <section className="border-t border-[var(--border-hairline)] p-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Package preview</h3>
          {campaign.contentPieces.length > 0 ? (
            <div className="mt-3 space-y-2">
              {campaign.contentPieces.slice(0, 4).map((piece) => (
                <PackagePiece key={piece.id} piece={piece} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-4 text-sm text-[var(--text-muted)]">
              No drafts or media have been attached yet.
            </p>
          )}
        </section>

        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] font-bold text-[var(--accent)]">
              {agentName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Ask {agentName}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">Refine messaging, offer, audience, or missing pieces.</p>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

function PackagePiece({ piece }: { piece: CampaignListContentPiece }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              {piece.kind}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{piece.channel}</span>
          </div>
          <h4 className="mt-2 line-clamp-2 text-sm font-bold text-[var(--text-primary)]">{piece.title}</h4>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${piece.needsReview ? "border-[var(--warn-border-soft)] bg-[var(--warn-soft)] text-[var(--warn-text)]" : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-muted)]"}`}>
          {piece.needsReview ? "Needs review" : piece.status}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-[var(--text-secondary)]">{piece.preview}</p>
    </section>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold leading-5 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function bestCampaignSummary(campaign: CampaignWorkspaceListItem) {
  return plainOrFallback(campaign.objective, campaign.whyBuilt || campaign.audienceSummary);
}

function plainOrFallback(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed || /not been summarized|not recorded|not captured/i.test(trimmed)) return fallback;
  return trimmed;
}

function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}

function summarizeLibrary(campaigns: CampaignWorkspaceListItem[]) {
  return campaigns.reduce(
    (summary, campaign) => ({
      campaigns: summary.campaigns + 1,
      pieces: summary.pieces + campaign.contentPieces.length,
      review: summary.review + campaign.pendingCount,
      media: summary.media + campaign.mediaCount,
      ready: summary.ready + (campaign.lifecycle === "Ready" ? 1 : 0),
      drafting: summary.drafting + (campaign.lifecycle === "Drafting" ? 1 : 0),
      live: summary.live + (campaign.lifecycle === "Live" ? 1 : 0),
    }),
    { campaigns: 0, pieces: 0, review: 0, media: 0, ready: 0, drafting: 0, live: 0 },
  );
}

function viewLabel(view: CampaignManagerView) {
  if (view === "needs-attention") return "Campaigns needing review";
  if (view === "ready-to-send") return "Campaigns ready to hand off";
  if (view === "arc-working") return "Campaigns being drafted";
  if (view === "live") return "Live campaigns";
  if (view === "archived") return "Archived campaigns";
  return "All campaigns";
}

function viewHref(view: CampaignManagerView, query: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (query) params.set("q", query);
  return `/campaigns?${params.toString()}`;
}
