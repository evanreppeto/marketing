import Link from "next/link";

import { StatusPill } from "@/app/_components/page-header";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

import { FilterSelect } from "./filter-select";

type Lifecycle = CampaignWorkspaceListItem["lifecycle"];

const PAGE_SIZES = [12, 24, 48];
const LIFECYCLES: Lifecycle[] = ["Drafting", "In review", "Ready", "Live"];

const LIFECYCLE_TONE: Record<Lifecycle, "blue" | "green" | "amber" | "gray"> = {
  Drafting: "gray",
  "In review": "amber",
  Ready: "green",
  Live: "blue",
};

const SEGMENTS: Array<{ key: "All" | Lifecycle; label: string; dot: string }> = [
  { key: "All", label: "All", dot: "bg-[var(--text-muted)]" },
  { key: "In review", label: "Needs review", dot: "bg-[var(--warn)]" },
  { key: "Ready", label: "Ready to launch", dot: "bg-[var(--ok)]" },
  { key: "Live", label: "Live", dot: "bg-[var(--accent)]" },
  { key: "Drafting", label: "Drafting", dot: "bg-[var(--border-strong)]" },
];

const SORTS = [
  { key: "recent", label: "Recently updated" },
  { key: "needs-review", label: "Needs review first" },
  { key: "pending", label: "Most pending" },
  { key: "name", label: "Name (A–Z)" },
];
const SORT_KEYS = SORTS.map((sortOption) => sortOption.key);
const LIFECYCLE_PRIORITY: Record<Lifecycle, number> = { "In review": 0, Ready: 1, Drafting: 2, Live: 3 };

export function CampaignGallery({
  campaigns,
  page,
  pageSize,
  persona,
  query,
  status,
  sort,
  view,
}: {
  campaigns: CampaignWorkspaceListItem[];
  page: number;
  pageSize: number;
  persona: string;
  query: string;
  status: string;
  sort: string;
  view: string;
}) {
  const personas = ["All", ...Array.from(new Set(campaigns.map((campaign) => targetLabel(campaign.persona))))];
  const statusFilter: "All" | Lifecycle = (LIFECYCLES as string[]).includes(status) ? (status as Lifecycle) : "All";
  const personaFilter = personas.includes(persona) ? persona : "All";
  const sortKey = SORT_KEYS.includes(sort) ? sort : "recent";
  const viewMode: "cards" | "table" = view === "table" ? "table" : "cards";

  const counts = countByLifecycle(campaigns);

  const q = query.trim().toLowerCase();
  const matched = campaigns.filter((campaign) => {
    const matchStatus = statusFilter === "All" || campaign.lifecycle === statusFilter;
    const matchPersona = personaFilter === "All" || targetLabel(campaign.persona) === personaFilter;
    const matchQuery =
      q.length === 0 ||
      `${campaign.name} ${targetLabel(campaign.persona)} ${campaign.persona} ${campaign.objective} ${campaign.audienceSummary} ${campaign.offerSummary} ${campaign.assetTypes.join(" ")}`
        .toLowerCase()
        .includes(q);
    return matchStatus && matchPersona && matchQuery;
  });
  const sorted = sortCampaigns(matched, sortKey);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, sorted.length);
  const visible = sorted.slice(startIndex, endIndex);
  const showingLabel = `Showing ${startIndex + (sorted.length > 0 ? 1 : 0)}-${endIndex} of ${sorted.length}`;
  const matchedLabel = sorted.length === campaigns.length ? "packages" : `matched from ${campaigns.length} packages`;
  const hasActiveFilters = q.length > 0 || statusFilter !== "All" || personaFilter !== "All" || pageSize !== 12 || sortKey !== "recent";

  function hrefFor(updates: Partial<{ q: string; status: string; persona: string; page: number; pageSize: number; sort: string; view: string }>) {
    const merged = {
      q: query.trim(),
      status: statusFilter,
      persona: personaFilter,
      page: currentPage,
      pageSize,
      sort: sortKey,
      view: viewMode,
      ...updates,
    };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.status && merged.status !== "All") params.set("status", merged.status);
    if (merged.persona && merged.persona !== "All") params.set("persona", merged.persona);
    if (merged.pageSize && merged.pageSize !== 12) params.set("pageSize", String(merged.pageSize));
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    if (merged.sort && merged.sort !== "recent") params.set("sort", merged.sort);
    if (merged.view && merged.view !== "cards") params.set("view", merged.view);
    const qs = params.toString();
    return qs ? `/campaigns?${qs}` : "/campaigns";
  }

  return (
    <div className="space-y-4">
      {/* Lifecycle segment bar — the "what needs me" console + live counts. */}
      <nav aria-label="Filter by lifecycle" className="flex flex-wrap gap-2">
        {SEGMENTS.map((segment) => {
          const count = segment.key === "All" ? campaigns.length : counts[segment.key as Lifecycle] ?? 0;
          const active = statusFilter === segment.key;
          return (
            <Link
              key={segment.key}
              href={hrefFor({ status: segment.key, page: 1 })}
              aria-current={active ? "true" : undefined}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
                  : "border-[var(--border-panel)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
              }`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${segment.dot}`} />
              {segment.label}
              <span className="rounded-full bg-[var(--surface-raised)] px-1.5 font-mono text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
            </Link>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <span className="signal-eyebrow">Campaign packages</span>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{showingLabel}</span> {matchedLabel}.
                </p>
              </div>
              <ViewToggle view={viewMode} hrefFor={(next) => hrefFor({ view: next, page: 1 })} />
            </div>

            <form action="/campaigns" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
              {/* Preserve lifecycle + view (set outside this form) across submits. */}
              <input type="hidden" name="status" value={statusFilter === "All" ? "" : statusFilter} />
              <input type="hidden" name="view" value={viewMode === "cards" ? "" : viewMode} />
              <div className="flex flex-col gap-4">
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Search</span>
                  <span className="relative block">
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="9" cy="9" r="6" />
                      <path d="m18 18-4.5-4.5" strokeLinecap="round" />
                    </svg>
                    <input
                      defaultValue={query}
                      name="q"
                      type="search"
                      placeholder="Campaign name, persona, offer..."
                      className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    />
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_0.7fr_auto] xl:items-end">
                  <FilterSelect
                    label="Sort"
                    name="sort"
                    value={sortKey === "recent" ? "" : sortKey}
                    options={SORTS.map((sortOption) => ({ label: sortOption.label, value: sortOption.key === "recent" ? "" : sortOption.key }))}
                  />

                  <FilterSelect
                    label="Target"
                    name="persona"
                    value={personaFilter === "All" ? "" : personaFilter}
                    options={personas.map((target) => ({ label: target === "All" ? "All targets" : target, value: target === "All" ? "" : target }))}
                  />

                  <FilterSelect
                    label="Show"
                    name="pageSize"
                    value={pageSize === 12 ? "" : String(pageSize)}
                    options={PAGE_SIZES.map((size) => ({ label: `${size} cards`, value: size === 12 ? "" : String(size) }))}
                  />

                  <div className="flex items-end gap-2">
                    <button className="sr-only" type="submit">
                      Apply
                    </button>
                    {hasActiveFilters ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                        href="/campaigns"
                      >
                        Reset
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="m-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
            No campaigns match{q ? ` "${query.trim()}"` : ""}{statusFilter !== "All" ? ` in "${statusFilter}"` : ""}.
          </p>
        ) : viewMode === "table" ? (
          <CampaignTable rows={visible} />
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}

        <PaginationLinks
          currentPage={currentPage}
          endIndex={endIndex}
          hrefFor={(nextPage) => hrefFor({ page: nextPage })}
          pageCount={pageCount}
          startIndex={startIndex}
          total={sorted.length}
        />
      </section>
    </div>
  );
}

function ViewToggle({ view, hrefFor }: { view: "cards" | "table"; hrefFor: (next: string) => string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-1" role="group" aria-label="View">
      {(["cards", "table"] as const).map((mode) => (
        <Link
          key={mode}
          href={hrefFor(mode)}
          aria-current={view === mode ? "true" : undefined}
          className={`inline-flex min-h-8 items-center justify-center rounded-md px-3 text-xs font-semibold uppercase tracking-[0.1em] transition ${
            view === mode
              ? "bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_oklch(0.74_0.115_232/0.42)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
          }`}
        >
          {mode}
        </Link>
      ))}
    </div>
  );
}

function sortCampaigns(items: CampaignWorkspaceListItem[], sortKey: string) {
  const copy = items.slice();
  if (sortKey === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === "pending") copy.sort((a, b) => b.pendingCount - a.pendingCount);
  else if (sortKey === "needs-review") copy.sort((a, b) => LIFECYCLE_PRIORITY[a.lifecycle] - LIFECYCLE_PRIORITY[b.lifecycle]);
  // "recent" keeps the read-model's updated-desc order.
  return copy;
}

function countByLifecycle(items: CampaignWorkspaceListItem[]): Partial<Record<Lifecycle, number>> {
  return items.reduce<Partial<Record<Lifecycle, number>>>((acc, campaign) => {
    acc[campaign.lifecycle] = (acc[campaign.lifecycle] ?? 0) + 1;
    return acc;
  }, {});
}

function ctaLabel(lifecycle: Lifecycle) {
  if (lifecycle === "In review") return "Review";
  if (lifecycle === "Ready") return "Launch";
  return "Open";
}

function PaginationLinks({
  currentPage,
  endIndex,
  hrefFor,
  pageCount,
  startIndex,
  total,
}: {
  currentPage: number;
  endIndex: number;
  hrefFor: (page: number) => string;
  pageCount: number;
  startIndex: number;
  total: number;
}) {
  const visibleLabel = total === 0 ? "No campaign packages matched" : `Showing ${startIndex + 1}-${endIndex} of ${total} campaign packages`;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">Page {currentPage} of {pageCount}</span>
        <span className="ml-2 font-normal text-[var(--text-muted)]">{visibleLabel}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <PageLink disabled={currentPage <= 1} href={hrefFor(Math.max(1, currentPage - 1))}>
          Previous
        </PageLink>
        {visiblePageNumbers(currentPage, pageCount).map((pageNumber) => (
          <PageLink active={pageNumber === currentPage} href={hrefFor(pageNumber)} key={pageNumber}>
            {pageNumber}
          </PageLink>
        ))}
        <PageLink disabled={currentPage >= pageCount} href={hrefFor(Math.min(pageCount, currentPage + 1))}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  active,
  children,
  disabled,
  href,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  href: string;
}) {
  const classes = `inline-flex min-h-10 items-center justify-center rounded-md border px-4 text-sm font-bold transition ${
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
      : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
  } ${disabled ? "pointer-events-none opacity-45" : ""}`;

  return (
    <Link aria-current={active ? "page" : undefined} aria-disabled={disabled ? true : undefined} className={classes} href={disabled ? "#" : href}>
      {children}
    </Link>
  );
}

function visiblePageNumbers(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function CampaignTable({ rows }: { rows: CampaignWorkspaceListItem[] }) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <th className="py-2 pr-3 font-semibold">Campaign</th>
            <th className="px-3 py-2 font-semibold">Target</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Needs you</th>
            <th className="px-3 py-2 font-semibold">Deliverables</th>
            <th className="px-3 py-2 font-semibold">Updated</th>
            <th className="py-2 pl-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((campaign) => (
            <tr key={campaign.id} className="border-b border-[var(--border-hairline)] transition last:border-b-0 hover:bg-[var(--surface-inset)]">
              <td className="py-2.5 pr-3">
                <Link href={campaign.href} className="font-bold text-[var(--text-primary)] transition hover:text-[var(--accent)]">
                  {campaign.name}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">{targetLabel(campaign.persona)}</td>
              <td className="px-3 py-2.5">
                <StatusPill tone={LIFECYCLE_TONE[campaign.lifecycle]}>{campaign.lifecycle}</StatusPill>
              </td>
              <td className="px-3 py-2.5">
                {campaign.pendingCount > 0 ? (
                  <span className="font-mono font-bold tabular-nums text-[var(--warn)]">{campaign.pendingCount}</span>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--text-secondary)]">{campaign.assetCount}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-muted)]">{campaign.updatedAt}</td>
              <td className="py-2.5 pl-3 text-right">
                <Link href={campaign.href} className="text-xs font-bold text-[var(--accent)] transition hover:text-[var(--accent-strong)]">
                  {ctaLabel(campaign.lifecycle)} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const needsReview = campaign.lifecycle === "In review";

  return (
    <Link
      href={campaign.href}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-[var(--surface-soft)] transition hover:bg-[var(--surface-raised)] ${
        needsReview
          ? "border-[oklch(0.82_0.13_85/0.5)] shadow-[0_0_0_1px_oklch(0.82_0.13_85/0.28)] hover:border-[var(--warn)]"
          : "border-[var(--border-panel)] hover:border-[var(--accent)]"
      }`}
    >
      <CardCover campaign={campaign} />

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <StatusPill tone={LIFECYCLE_TONE[campaign.lifecycle]}>{campaign.lifecycle}</StatusPill>
          <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)] group-hover:hidden">{campaign.updatedAt}</span>
          <span className="hidden shrink-0 text-[11px] font-bold text-[var(--accent)] group-hover:inline">{ctaLabel(campaign.lifecycle)} →</span>
        </div>
        <h3 className="font-bold leading-tight text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{campaign.name}</h3>
        <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
          <Stat value={campaign.assetCount} label="assets" />
          <Stat value={campaign.approvalCount} label="approvals" />
          <Stat value={campaign.mediaCount} label="media" />
          <Stat value={campaign.sourceCount} label="sources" />
        </div>
      </div>
    </Link>
  );
}

function CardCover({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="relative h-40 overflow-hidden bg-[radial-gradient(circle_at_22%_18%,oklch(0.74_0.115_232/0.3),transparent_62%),linear-gradient(135deg,var(--surface-raised),var(--surface-inset))]">
      {campaign.thumbnailUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
          <img
            src={campaign.thumbnailUrl}
            alt={`${campaign.name} creative`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[oklch(0.1_0.03_250/0.78)] to-transparent" />
        </>
      ) : (
        <CreativeCover campaign={campaign} />
      )}

      <span className={`absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm ${targetBadgeClasses(campaign.persona)}`}>
        Target: {targetLabel(campaign.persona)}
      </span>
    </div>
  );
}

/** Clean, branded cover for campaigns with no image: the deliverable kinds it
 *  contains + a count, over a faint type glyph. No raw draft text. */
function CreativeCover({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  const types = campaign.assetTypes.slice(0, 4);

  if (types.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">No creative yet</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2.5 px-5">
      <span aria-hidden className="pointer-events-none absolute select-none font-display text-[5.5rem] font-bold leading-none tracking-[-0.04em] text-[var(--text-primary)] opacity-[0.06]">
        {coverGlyph(campaign.assetTypes)}
      </span>
      <div className="relative z-10 flex flex-wrap justify-center gap-1.5">
        {types.map((type) => (
          <span
            key={type}
            className="rounded-md border border-[var(--border-strong)] bg-[oklch(0.12_0.03_250/0.6)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] backdrop-blur-sm"
          >
            {type}
          </span>
        ))}
      </div>
      <span className="relative z-10 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {campaign.assetCount} deliverable{campaign.assetCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/** A faint background glyph hinting at the dominant deliverable kind. */
function coverGlyph(assetTypes: string[]) {
  const joined = assetTypes.join(" ").toLowerCase();
  if (/email/.test(joined)) return "@";
  if (/sms|text/.test(joined)) return "#";
  if (/landing|web|page/.test(joined)) return "WWW";
  if (/ad|search|social|meta|google|display/.test(joined)) return "AD";
  if (/image|video|media|photo|creative/.test(joined)) return "IMG";
  return "DOC";
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{value}</span> {label}
    </span>
  );
}

function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}

function targetKind(persona: string) {
  const target = targetLabel(persona).toLowerCase();
  if (/property manager|hoa|landlord/.test(target)) return "property";
  if (/plumbing|hvac|roof|electrical|gc|remodeler|partner/.test(target)) return "trade";
  if (/insurance/.test(target)) return "insurance";
  if (/homeowner/.test(target)) return "homeowner";
  if (/agent/.test(target)) return "agent";
  return "default";
}

function targetBadgeClasses(persona: string) {
  const kind = targetKind(persona);
  if (kind === "property") return "border-[oklch(0.74_0.115_232/0.42)] bg-[oklch(0.16_0.05_235/0.82)] text-[oklch(0.86_0.07_232)]";
  if (kind === "trade") return "border-[oklch(0.78_0.14_158/0.42)] bg-[oklch(0.16_0.055_158/0.82)] text-[oklch(0.86_0.09_158)]";
  if (kind === "insurance") return "border-[oklch(0.82_0.13_85/0.46)] bg-[oklch(0.2_0.06_85/0.82)] text-[oklch(0.91_0.09_85)]";
  if (kind === "homeowner") return "border-[oklch(0.68_0.2_26/0.46)] bg-[oklch(0.2_0.065_26/0.82)] text-[oklch(0.88_0.08_26)]";
  if (kind === "agent") return "border-[oklch(0.75_0.12_285/0.42)] bg-[oklch(0.18_0.055_285/0.82)] text-[oklch(0.86_0.08_285)]";
  return "border-[var(--border-strong)] bg-[oklch(0.1_0.03_250/0.72)] text-[var(--text-secondary)]";
}
