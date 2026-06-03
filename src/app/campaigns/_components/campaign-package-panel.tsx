"use client";

import Link from "next/link";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import type {
  CampaignMediaAsset,
  CampaignWorkspaceApproval,
  CampaignWorkspaceAsset,
  CampaignWorkspaceAssetCategory,
  CampaignWorkspaceSource,
  LiveCampaignWorkspace,
} from "@/lib/campaigns/read-model";

import { AssetPreview } from "./asset-preview";
import { DecisionControls } from "./decision-controls";
import { statusTone } from "./status-tone";

type TabKey = "creative" | "media" | "overview" | "audience" | "reasoning" | "approvals";

const CATEGORY_META: Record<
  CampaignWorkspaceAssetCategory,
  { title: string; shortTitle: string; detail: string; action: string }
> = {
  physical: {
    title: "Physical campaign",
    shortTitle: "Physical",
    detail: "Postcards, mailers, scripts, leave-behinds, or printed partner material.",
    action: "Open print work",
  },
  virtual: {
    title: "Digital outreach",
    shortTitle: "Digital",
    detail: "Email, SMS, landing copy, social posts, or outreach sequences.",
    action: "Open digital work",
  },
  ads: {
    title: "Paid ads",
    shortTitle: "Ads",
    detail: "Meta, Google, display, search, or platform-ready ad drafts.",
    action: "Open ad work",
  },
  media: {
    title: "Media assets",
    shortTitle: "Media",
    detail: "Images, video, mockups, generated previews, and creative references.",
    action: "Open media",
  },
  other: {
    title: "Support material",
    shortTitle: "Support",
    detail: "Research, notes, campaign helpers, and other attached material.",
    action: "Open support",
  },
};

const DELIVERABLE_CONTRACTS: Array<{
  key: string;
  label: string;
  detail: string;
  tab: TabKey;
  matches: (asset: CampaignWorkspaceAsset) => boolean;
}> = [
  {
    key: "email",
    label: "Email draft",
    detail: "Partner, lead, or customer email copy.",
    tab: "creative",
    matches: (asset) => /email/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "sms",
    label: "SMS draft",
    detail: "Short text-message copy, gated before any send.",
    tab: "creative",
    matches: (asset) => /sms|text message|text/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "ads",
    label: "Ad angles",
    detail: "Meta, Google, display, or search ad copy.",
    tab: "creative",
    matches: (asset) => asset.category === "ads" || /ad|meta|google|search|display/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "social",
    label: "Social post",
    detail: "Organic social copy or post concept.",
    tab: "creative",
    matches: (asset) => /social|post|facebook|instagram|linkedin/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "landing",
    label: "Landing concept",
    detail: "Internal landing-page copy or CTA rule only.",
    tab: "creative",
    matches: (asset) => /landing|web page|page concept|cta/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "call-script",
    label: "Call script",
    detail: "Human call or partner handoff script.",
    tab: "creative",
    matches: (asset) => /call|script|talk track|handoff/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
  {
    key: "physical",
    label: "Physical piece",
    detail: "Print, leave-behind, postcard, or mailer.",
    tab: "creative",
    matches: (asset) => asset.category === "physical" || /print|postcard|mailer|leave behind|leave-behind/i.test(`${asset.assetType} ${asset.channel} ${asset.title}`),
  },
];

export function CampaignPackagePanel({
  detail,
  pendingApproval,
  onOpenTab,
  onPickAsset,
}: {
  detail: LiveCampaignWorkspace;
  pendingApproval: CampaignWorkspaceApproval | null;
  onOpenTab: (tab: TabKey) => void;
  onPickAsset: (assetId: string) => void;
}) {
  const { campaign, groupedAssets, assets, media, sources, reasoning } = detail;
  const featuredMedia = media[0] ?? null;
  const featuredAsset = assets.find((asset) => asset.media.length > 0) ?? assets[0] ?? null;
  const sourceCounts = countSources(sources);

  function openCategory(category: CampaignWorkspaceAssetCategory) {
    const firstAsset = groupedAssets[category]?.[0] ?? null;
    if (firstAsset) onPickAsset(firstAsset.id);
    onOpenTab(category === "media" && media.length > 0 ? "media" : "creative");
  }

  return (
    <section className="module-rise mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Review packet</span>
            <StatusPill tone="amber">Outbound locked</StatusPill>
            {!campaign.launchLocked ? <StatusPill tone="blue">Draft approved</StatusPill> : null}
            {pendingApproval ? <StatusPill tone={statusTone(pendingApproval.status)}>{pendingApproval.status}</StatusPill> : null}
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Campaign package at a glance</h2>
          <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--text-secondary)]">
            {campaign.audienceSummary} {campaign.offerSummary ? `Offer: ${campaign.offerSummary}` : ""}
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(CATEGORY_META) as CampaignWorkspaceAssetCategory[]).map((category) => (
                <PackageBucket
                  key={category}
                  category={category}
                  assets={groupedAssets[category] ?? []}
                  onOpen={() => openCategory(category)}
                />
              ))}
            </div>

            <DeliverableChecklist
              assets={assets}
              media={media}
              sources={sources}
              onOpenTab={onOpenTab}
              onPickAsset={onPickAsset}
            />
          </div>

          <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] p-5 lg:border-l lg:border-t-0">
            <div className="signal-eyebrow">What to check</div>
            <ol className="mt-4 space-y-3">
              {[
                ["Creative", "Read every draft and inspect generated assets."],
                ["Sources", "Confirm the leads, evidence URLs, and target persona."],
                ["Guardrails", "Check risky claims, insurance language, and approval status."],
                ["Decision", "Approve, decline, archive, or ask Mark for a revision."],
              ].map(([title, detail], index) => (
                <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] font-mono text-xs font-black text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-[var(--text-primary)]">{title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <div className="signal-eyebrow">Primary preview</div>
            <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">
              {featuredMedia?.title ?? featuredAsset?.title ?? "No creative attached yet"}
            </h3>
          </div>
          <div className="p-4">
            {featuredMedia ? (
              <FeaturedMedia media={featuredMedia} onOpenMedia={() => onOpenTab("media")} />
            ) : featuredAsset ? (
              <AssetPreview asset={featuredAsset} />
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                Mark has not attached copy, image, video, or file assets to this campaign yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-5 shadow-[var(--elev-panel)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="signal-eyebrow">Targets and evidence</div>
              <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">
                {sources.length} linked source{sources.length === 1 ? "" : "s"}
              </h3>
            </div>
            <button type="button" onClick={() => onOpenTab("audience")} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              View
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SourceStat label="Companies" value={sourceCounts.company} />
            <SourceStat label="Leads" value={sourceCounts.lead} />
            <SourceStat label="Contacts" value={sourceCounts.contact} />
            <SourceStat label="Evidence" value={sourceCounts.evidence + sourceCounts.web} />
          </div>
          {sources.slice(0, 3).length > 0 ? (
            <ul className="mt-4 space-y-2">
              {sources.slice(0, 3).map((source) => (
                <li key={source.id} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                  <div className="truncate text-sm font-bold text-[var(--text-primary)]">{source.label}</div>
                  <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{source.detail}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.08)] p-5 shadow-[var(--elev-panel)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="signal-eyebrow">Approval gate</div>
            <StatusPill tone="amber">Human decision required</StatusPill>
            <StatusPill tone="amber">No dispatch controls</StatusPill>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {reasoning.recommendedAction || "Review the package, sources, and guardrails before approving anything."}
          </p>
          <div className="mt-4">
            {pendingApproval ? (
              <DecisionControls approvalItemId={pendingApproval.id} campaignId={campaign.id} size="md" />
            ) : (
              <Link href="/approvals" className={buttonClasses({ variant: "ghost", size: "md" })}>
                Open approval queue
              </Link>
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}

function DeliverableChecklist({
  assets,
  media,
  sources,
  onOpenTab,
  onPickAsset,
}: {
  assets: CampaignWorkspaceAsset[];
  media: CampaignMediaAsset[];
  sources: CampaignWorkspaceSource[];
  onOpenTab: (tab: TabKey) => void;
  onPickAsset: (assetId: string) => void;
}) {
  const rows = [
    ...DELIVERABLE_CONTRACTS.map((contract) => {
      const asset = assets.find(contract.matches) ?? null;
      return {
        ...contract,
        asset,
        ready: Boolean(asset),
        status: asset ? asset.status : "Missing",
        action: asset ? "Open draft" : "Needs Mark",
      };
    }),
    {
      key: "media",
      label: "Image / video",
      detail: "Generated visual, video, mockup, or media prompt.",
      tab: "media" as const,
      asset: assets.find((asset) => asset.category === "media" || asset.media.length > 0) ?? null,
      ready: media.length > 0 || assets.some((asset) => asset.category === "media" || asset.media.length > 0),
      status: media.length > 0 ? `${media.length} media` : "Missing",
      action: media.length > 0 ? "Open media" : "Needs Mark",
    },
    {
      key: "sources",
      label: "Audience sources",
      detail: "Linked leads, companies, contacts, or evidence URLs.",
      tab: "audience" as const,
      asset: null,
      ready: sources.length > 0,
      status: sources.length > 0 ? `${sources.length} sources` : "Missing",
      action: sources.length > 0 ? "Open sources" : "Needs evidence",
    },
  ];

  return (
    <section className="mt-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="signal-eyebrow">Package completeness</div>
          <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Expected campaign pieces</h3>
          <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
            Present items come from campaign assets, approval records, and Mark outputs. Missing items are data contracts, not fake drafts.
          </p>
        </div>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <button
            className={`grid min-h-20 cursor-pointer gap-3 rounded-lg border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
              row.ready ? "border-[var(--border-panel)] bg-[var(--surface-inset)]" : "border-dashed border-[var(--border-hairline)] bg-[var(--surface-panel)]"
            }`}
            key={row.key}
            onClick={() => {
              if (row.asset) onPickAsset(row.asset.id);
              onOpenTab(row.tab);
            }}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-[var(--text-primary)]">{row.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{row.detail}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:justify-end">
              <StatusPill tone={row.ready ? "blue" : "amber"}>{row.status}</StatusPill>
              <span className="text-xs font-bold text-[var(--accent)]">{row.action}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PackageBucket({
  category,
  assets,
  onOpen,
}: {
  category: CampaignWorkspaceAssetCategory;
  assets: CampaignWorkspaceAsset[];
  onOpen: () => void;
}) {
  const meta = CATEGORY_META[category];
  const hasAssets = assets.length > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!hasAssets}
      className={`min-h-[164px] rounded-xl border p-4 text-left transition ${
        hasAssets
          ? "border-[var(--border-panel)] bg-[var(--surface-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
          : "border-dashed border-[var(--border-hairline)] bg-[var(--surface-soft)] opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">{meta.shortTitle}</div>
          <h3 className="mt-2 text-base font-black tracking-[-0.025em] text-[var(--text-primary)]">{meta.title}</h3>
        </div>
        <span className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
          {assets.length}
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{meta.detail}</p>
      <div className="mt-4 space-y-1">
        {assets.slice(0, 2).map((asset) => (
          <div key={asset.id} className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {asset.title}
          </div>
        ))}
        {hasAssets ? (
          <div className="pt-1 text-xs font-bold text-[var(--accent)]">{meta.action}</div>
        ) : (
          <div className="pt-1 text-xs font-semibold text-[var(--text-muted)]">No items yet</div>
        )}
      </div>
    </button>
  );
}

function FeaturedMedia({ media, onOpenMedia }: { media: CampaignMediaAsset; onOpenMedia: () => void }) {
  if (media.type === "image") {
    return (
      <button type="button" onClick={onOpenMedia} className="block w-full overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
        <img src={media.thumbnailUrl ?? media.url} alt={media.title} className="max-h-[330px] w-full object-contain" />
      </button>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        controls
        className="max-h-[330px] w-full rounded-xl border border-[var(--border-hairline)] bg-black object-contain"
      />
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)]"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
        {media.type === "embed" ? "Video link" : media.type === "file" ? "File" : "Creative link"}
      </div>
      <div className="mt-3 text-base font-bold text-[var(--text-primary)]">{media.title}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{media.description ?? `Captured from ${media.source}.`}</p>
      <div className="mt-4 text-sm font-bold text-[var(--accent)]">Open original</div>
    </a>
  );
}

function SourceStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <div className="font-mono text-lg font-black tabular-nums text-[var(--text-primary)]">{value}</div>
      <div className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function countSources(sources: CampaignWorkspaceSource[]) {
  return sources.reduce(
    (counts, source) => {
      counts[source.kind] += 1;
      return counts;
    },
    { company: 0, contact: 0, lead: 0, web: 0, evidence: 0 } satisfies Record<CampaignWorkspaceSource["kind"], number>,
  );
}
