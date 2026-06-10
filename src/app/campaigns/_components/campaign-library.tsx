import Link from "next/link";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { CollapsedBatchGroup } from "./collapsed-batch-group";
import { formatWaitTime } from "./format-wait-time";
import { momentumCounts, partitionAwaiting } from "./library-model";
import { MomentumStrip } from "./momentum-strip";

type Lifecycle = CampaignWorkspaceListItem["lifecycle"];

/**
 * The Campaigns library: an editorial list grouped by approval lifecycle. Work
 * awaiting the operator floats to the top, glows gold, and shows Mark's reasoning
 * plus a content preview so each row is decidable without opening it. Outbound
 * campaigns get the full treatment; internal CRM batches collapse into one fold.
 */

type GroupDef = {
  key: Lifecycle;
  label: string;
  dot: string;
  flag: boolean;
  pillLabel: string;
  pillClass: string;
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

const EMPTY_NOTE: Record<Lifecycle, string> = {
  "In review": "Nothing awaiting you — Mark's drafts will land here.",
  Ready: "Nothing ready yet — approved campaigns land here.",
  Live: "Nothing live yet — launched campaigns land here.",
  Drafting: "No drafts in progress.",
};

export function CampaignLibrary({
  campaigns,
  activeStatus,
  nowMs,
}: {
  campaigns: CampaignWorkspaceListItem[];
  activeStatus: string;
  nowMs: number;
}) {
  const status: "All" | Lifecycle = (GROUPS.map((group) => group.key) as string[]).includes(activeStatus)
    ? (activeStatus as Lifecycle)
    : "All";

  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    acc[campaign.lifecycle] = (acc[campaign.lifecycle] ?? 0) + 1;
    return acc;
  }, {});

  const showAll = status === "All";
  const visibleGroups = GROUPS.filter((group) => showAll || group.key === status).map((group) => ({
    group,
    items: campaigns.filter((campaign) => campaign.lifecycle === group.key),
  }));
  // In a specific-status view we hide empty groups; in "All" we keep them so the
  // pipeline shape (Awaiting → Ready → Live → Drafts) stays legible.
  const rendered = showAll ? visibleGroups : visibleGroups.filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-6">
      <MomentumStrip counts={momentumCounts(campaigns)} />

      <nav aria-label="Filter campaigns by lifecycle" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const count = filter.key === "All" ? campaigns.length : counts[filter.key] ?? 0;
          const active = status === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "All" ? "/campaigns" : `/campaigns?status=${encodeURIComponent(filter.key)}`}
              aria-current={active ? "page" : undefined}
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

      {rendered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
          No campaigns in this view.
        </p>
      ) : (
        rendered.map(({ group, items }) => (
          <section key={group.key} aria-label={group.label}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.label}</h2>
              <span className="h-px flex-1 bg-[var(--border-hairline)]" />
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{items.length}</span>
            </div>

            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">
                {EMPTY_NOTE[group.key]}
              </p>
            ) : group.key === "In review" ? (
              <AwaitingSection items={items} group={group} nowMs={nowMs} />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {items.map((campaign) => (
                  <li key={campaign.id}>
                    <CampaignRow campaign={campaign} group={group} nowMs={nowMs} showPreview={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/** The In-review group: outbound rows (with preview) above the internal CRM fold. */
function AwaitingSection({ items, group, nowMs }: { items: CampaignWorkspaceListItem[]; group: GroupDef; nowMs: number }) {
  const { outbound, internal } = partitionAwaiting(items);
  const split = outbound.length > 0 && internal.length > 0;

  return (
    <div className="space-y-4">
      {outbound.length > 0 ? (
        <div>
          {split ? <SubLabel>Outbound</SubLabel> : null}
          <ul className="flex flex-col gap-2.5">
            {outbound.map((campaign) => (
              <li key={campaign.id}>
                <CampaignRow campaign={campaign} group={group} nowMs={nowMs} showPreview />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {internal.length > 0 ? (
        <div>
          {split ? <SubLabel>Internal CRM work</SubLabel> : null}
          {internal.length === 1 ? (
            <ul className="flex flex-col gap-2.5">
              <li>
                <CampaignRow campaign={internal[0]} group={group} nowMs={nowMs} showPreview={false} />
              </li>
            </ul>
          ) : (
            <CollapsedBatchGroup items={internal} nowMs={nowMs} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{children}</div>;
}

function CampaignRow({
  campaign,
  group,
  nowMs,
  showPreview,
}: {
  campaign: CampaignWorkspaceListItem;
  group: GroupDef;
  nowMs: number;
  showPreview: boolean;
}) {
  const why = whyLine(campaign);
  const wait = formatWaitTime(campaign.updatedAtIso, nowMs);
  const channel = channelSummary(campaign.assetTypes);
  const hasPreview = showPreview && Boolean(campaign.previewText || campaign.thumbnailUrl);

  return (
    <Link
      href={campaign.href}
      className={`group flex items-stretch gap-4 rounded-xl border px-4 py-3.5 transition hover:translate-x-0.5 ${
        group.flag
          ? "border-[var(--accent-border-strong)] bg-[linear-gradient(90deg,var(--accent-soft),var(--surface-panel)_62%)] hover:border-[var(--accent)]"
          : "border-[var(--border-panel)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: group.dot }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-base font-medium tracking-[-0.005em] text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">
            {campaign.name}
          </span>
        </div>
        {why ? <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{why}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span className="truncate">{targetLabel(campaign.persona)}</span>
          {channel ? (
            <>
              <Dot />
              <span className="truncate">{channel}</span>
            </>
          ) : null}
          <Dot />
          <span>
            {campaign.assetCount} asset{campaign.assetCount === 1 ? "" : "s"}
          </span>
          {wait ? (
            <>
              <Dot />
              <span className={group.flag ? "font-medium text-[var(--accent)]" : ""}>waiting {wait}</span>
            </>
          ) : null}
        </div>
      </div>

      {hasPreview ? <CampaignPreview campaign={campaign} /> : null}

      <span
        className={`hidden shrink-0 items-center gap-1.5 self-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:inline-flex ${group.pillClass}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: group.dot }} />
        {group.pillLabel}
      </span>

      <span
        className={`shrink-0 self-center rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
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

/** Outbound content peek — thumbnail if present, else label + preview text. */
function CampaignPreview({ campaign }: { campaign: CampaignWorkspaceListItem }) {
  return (
    <div className="hidden w-[240px] shrink-0 self-center rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2.5 lg:block">
      {campaign.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no Next image-optimizer domain config
        <img src={campaign.thumbnailUrl} alt={`Preview — ${campaign.name}`} className="h-16 w-full rounded object-cover" />
      ) : (
        <>
          {campaign.previewLabel ? (
            <div className="mb-1 text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{campaign.previewLabel}</div>
          ) : null}
          <p className="line-clamp-3 text-[11px] leading-snug text-[var(--text-secondary)]">{campaign.previewText}</p>
        </>
      )}
    </div>
  );
}

function whyLine(campaign: CampaignWorkspaceListItem): string {
  const why = campaign.whyBuilt?.trim();
  if (why) return why;
  const objective = campaign.objective?.trim();
  if (objective && objective !== "No objective captured yet.") return objective;
  return "";
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
