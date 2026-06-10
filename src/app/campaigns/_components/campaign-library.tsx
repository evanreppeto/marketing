import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

type Lifecycle = CampaignWorkspaceListItem["lifecycle"];

/**
 * The redesigned Campaigns library: a single editorial list grouped by where
 * each campaign sits in the approval lifecycle, rather than a paginated card
 * grid. Work awaiting the operator floats to the top and glows gold; every row
 * is visibly Mark's work. Clicking a row opens the campaign workspace.
 */

type GroupDef = {
  key: Lifecycle;
  label: string;
  /** Status dot color (CSS var expression). */
  dot: string;
  /** Whether rows in this group get the gold "needs you" treatment. */
  flag: boolean;
  /** Pill text + classes. */
  pillLabel: string;
  pillClass: string;
  /** Row action label. */
  cta: string;
};

const GROUPS: GroupDef[] = [
  {
    key: "In review",
    label: "Awaiting your approval",
    dot: "var(--accent)",
    flag: true,
    pillLabel: "Needs you",
    pillClass: "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    cta: "Review",
  },
  {
    key: "Ready",
    label: "Ready to launch",
    dot: "var(--ok)",
    flag: false,
    pillLabel: "Ready",
    pillClass: "border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]",
    cta: "Launch",
  },
  {
    key: "Live",
    label: "Live",
    dot: "var(--ok)",
    flag: false,
    pillLabel: "Live",
    pillClass: "border-[var(--ok-border-soft)] text-[var(--ok-text)]",
    cta: "Open",
  },
  {
    key: "Drafting",
    label: "Drafts in progress",
    dot: "var(--text-muted)",
    flag: false,
    pillLabel: "Draft",
    pillClass: "border-[var(--border-strong)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
    cta: "Open",
  },
];

const FILTERS: Array<{ key: "All" | Lifecycle; label: string }> = [
  { key: "All", label: "All" },
  { key: "In review", label: "Awaiting approval" },
  { key: "Ready", label: "Ready" },
  { key: "Live", label: "Live" },
  { key: "Drafting", label: "Drafts" },
];

export function CampaignLibrary({
  campaigns,
  activeStatus,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeStatus: string;
}) {
  const status: "All" | Lifecycle = (GROUPS.map((group) => group.key) as string[]).includes(activeStatus)
    ? (activeStatus as Lifecycle)
    : "All";

  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    acc[campaign.lifecycle] = (acc[campaign.lifecycle] ?? 0) + 1;
    return acc;
  }, {});

  const visibleGroups = GROUPS.filter((group) => status === "All" || group.key === status)
    .map((group) => ({
      group,
      items: campaigns.filter((campaign) => campaign.lifecycle === group.key),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-6">
      <nav aria-label="Filter campaigns by lifecycle" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const count = filter.key === "All" ? campaigns.length : counts[filter.key] ?? 0;
          const active = status === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "All" ? "/campaigns" : `/campaigns?status=${encodeURIComponent(filter.key)}`}
              aria-current={active ? "true" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
                active
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-panel)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
              }`}
            >
              {filter.label}
              <span className={`font-mono text-xs tabular-nums ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {visibleGroups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
          No campaigns in this view.
        </p>
      ) : (
        visibleGroups.map(({ group, items }) => (
          <section key={group.key} aria-label={group.label}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.label}</h2>
              <span className="h-px flex-1 bg-[var(--border-hairline)]" />
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{items.length}</span>
            </div>

            <ul className="flex flex-col gap-2.5">
              {items.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignRow campaign={campaign} group={group} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function CampaignRow({ campaign, group }: { campaign: CampaignWorkspaceListItem; group: GroupDef }) {
  return (
    <Link
      href={campaign.href}
      className={`group flex items-center gap-4 rounded-xl border px-4 py-3.5 transition hover:translate-x-0.5 ${
        group.flag
          ? "border-[var(--accent-border-strong)] bg-[linear-gradient(90deg,var(--accent-soft),var(--surface-panel)_62%)] hover:border-[var(--accent)]"
          : "border-[var(--border-panel)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.dot }} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium tracking-[-0.005em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
          {campaign.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span className="truncate">{targetLabel(campaign.persona)}</span>
          {channelSummary(campaign.assetTypes) ? (
            <>
              <Dot />
              <span className="truncate">{channelSummary(campaign.assetTypes)}</span>
            </>
          ) : null}
          <Dot />
          <span>
            {campaign.assetCount} asset{campaign.assetCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)] md:flex">
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--surface-inset)] font-mono text-[10px] font-bold text-[var(--accent)]"
          title="Drafted by Mark"
        >
          M
        </span>
        <span className="whitespace-nowrap text-[var(--text-muted)]">Drafted by Mark · {campaign.updatedAt}</span>
      </div>

      <span
        className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:inline-flex ${group.pillClass}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: group.dot }} />
        {group.pillLabel}
      </span>

      <span
        className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
          group.flag
            ? "bg-[var(--accent)] text-[var(--on-accent)] group-hover:bg-[var(--accent-strong)]"
            : "border border-[var(--border-strong)] text-[var(--text-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--text-primary)]"
        }`}
      >
        {group.cta}
      </span>
    </Link>
  );
}

function Dot() {
  return <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-[var(--border-strong)]" />;
}

/** Distinct delivery channels for the row meta, e.g. "Email + Landing". */
function channelSummary(assetTypes: string[]) {
  const distinct = Array.from(new Set(assetTypes.map((type) => type.trim()).filter(Boolean)));
  if (distinct.length === 0) return "";
  if (distinct.length <= 2) return distinct.join(" + ");
  return `${distinct.slice(0, 2).join(" + ")} +${distinct.length - 2}`;
}

/** Strip the "Persona " prefix the read model sometimes carries. */
function targetLabel(persona: string) {
  return persona.replace(/^Persona\s+/i, "").trim() || persona;
}
