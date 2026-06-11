import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { CampaignManagerRow } from "./campaign-manager-row";
import { filterCampaignManagerItems, managerViewCounts, type CampaignManagerView } from "./library-model";

const VIEWS: Array<{ key: CampaignManagerView; label: string }> = [
  { key: "needs-attention", label: "Needs attention" },
  { key: "all", label: "All campaigns" },
  { key: "ready-to-send", label: "Ready to send" },
  { key: "mark-working", label: "Mark is working" },
  { key: "live", label: "Live" },
  { key: "archived", label: "Archived" },
];

export function CampaignLibrary({
  campaigns,
  activeView,
  query,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeView: CampaignManagerView;
  query: string;
}) {
  const counts = managerViewCounts(campaigns);
  const filteredCampaigns = filterCampaignManagerItems(campaigns, activeView, query);
  const trimmedQuery = query.trim();

  return (
    <section className="space-y-4" aria-label="Campaign manager">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Saved campaign views" className="flex flex-wrap gap-2">
          {VIEWS.map((view) => {
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
          <label className="sr-only" htmlFor="campaign-manager-search">
            Search campaigns
          </label>
          <input
            id="campaign-manager-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search campaigns"
            className="min-h-10 min-w-0 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] sm:w-72"
          />
          <button
            type="submit"
            className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="hidden border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] md:grid md:grid-cols-[34px_minmax(220px,1.5fr)_120px_130px_120px_minmax(150px,1fr)_88px] md:items-center md:gap-3">
          <span aria-hidden />
          <span>Campaign</span>
          <span>Status</span>
          <span>Content</span>
          <span>Where</span>
          <span>Next step</span>
          <span>Open</span>
        </div>

        {filteredCampaigns.length > 0 ? (
          <div>
            {filteredCampaigns.map((campaign) => (
              <CampaignManagerRow key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">No campaigns in this view</h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-6 text-[var(--text-secondary)]">
              Try another view or clear the search.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function viewHref(view: CampaignManagerView, query: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (query) params.set("q", query);
  return `/campaigns?${params.toString()}`;
}
