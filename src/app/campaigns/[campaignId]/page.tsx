import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../../_components/app-shell";
import { EmptyState, StatusPill, buttonClasses } from "../../_components/page-header";
import { DetailStack, MetricStrip, WorkspaceHeader, WorkspacePanel } from "../../_components/workspace";
import {
  getCampaignWorkspaceDetail,
  type CampaignMediaAsset,
  type CampaignWorkspaceAsset,
  type CampaignWorkspaceAssetCategory,
} from "@/lib/campaigns/read-model";

type CampaignDetailPageProps = {
  params: Promise<{ campaignId: string }>;
};

const assetSections: Array<{ key: CampaignWorkspaceAssetCategory; title: string; detail: string }> = [
  { key: "physical", title: "Physical campaign", detail: "Print, direct mail, leave-behinds, scripts, and field handoff material." },
  { key: "virtual", title: "Virtual campaign", detail: "Email, SMS, landing pages, social, and sequence copy." },
  { key: "ads", title: "Ads", detail: "Paid concepts, ad copy, targeting notes, and platform-ready drafts." },
  { key: "media", title: "Image and video assets", detail: "Creative previews, generated media, mockups, source files, and links." },
  { key: "other", title: "Other campaign pieces", detail: "Supporting drafts or records that do not fit a standard bucket yet." },
];

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  await connection();

  const { campaignId } = await params;
  const workspace = await getCampaignWorkspaceDetail(campaignId);

  if (workspace.status === "unavailable") {
    return (
      <AppShell active="/campaigns">
        <WorkspaceHeader
          eyebrow="Campaign workspace"
          title="Campaign detail is unavailable."
          description={workspace.message}
          status="Supabase unavailable"
          statusTone="amber"
          primary={{ label: "Back to campaigns", href: "/campaigns" }}
          secondary={{ label: "Mark operations", href: "/agent-operations" }}
        />
      </AppShell>
    );
  }

  if (workspace.status === "not_found") {
    return (
      <AppShell active="/campaigns">
        <WorkspaceHeader
          eyebrow="Campaign workspace"
          title="Campaign not found."
          description="The campaign record does not exist in the Growth Engine database, or it was removed."
          status="Missing"
          statusTone="red"
          primary={{ label: "Back to campaigns", href: "/campaigns" }}
          secondary={{ label: "Approval queue", href: "/approvals" }}
        />
      </AppShell>
    );
  }

  const { campaign, groupedAssets } = workspace;

  return (
    <AppShell active="/campaigns">
      <WorkspaceHeader
        eyebrow="Campaign workspace"
        title={campaign.name}
        description={campaign.objective}
        status={campaign.status}
        statusTone={campaign.launchLocked ? "amber" : "green"}
        primary={{ label: "Review approvals", href: "/approvals" }}
        secondary={{ label: "All campaigns", href: "/campaigns" }}
      />

      <MetricStrip
        metrics={[
          { label: "Assets", value: workspace.metrics.assets, detail: "Campaign pieces created", tone: workspace.metrics.assets > 0 ? "blue" : "gray" },
          { label: "Approvals", value: workspace.metrics.approvals, detail: "Human gate records", tone: workspace.metrics.approvals > 0 ? "amber" : "green", href: "/approvals" },
          { label: "Media", value: workspace.metrics.media, detail: "Images, videos, links, files", tone: workspace.metrics.media > 0 ? "blue" : "gray" },
          { label: "Sources", value: workspace.metrics.sources, detail: "Audience and evidence records", tone: workspace.metrics.sources > 0 ? "blue" : "gray" },
        ]}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Brief"
            title="Campaign summary"
            description="The operator-facing version of the campaign brief Mark prepared."
            aside={<StatusPill tone={campaign.launchLocked ? "amber" : "green"}>{campaign.launchLocked ? "Launch locked" : "Launch unlocked"}</StatusPill>}
          >
            <DetailStack
              items={[
                { label: "Persona", value: campaign.persona },
                { label: "Loss focus", value: campaign.restorationFocus },
                { label: "Audience", value: campaign.audienceSummary },
                { label: "Offer", value: campaign.offerSummary },
                { label: "Owner", value: campaign.owner },
                { label: "Updated", value: campaign.updatedAt },
              ]}
            />
            <div className="border-t border-[var(--border-hairline)] p-5">
              <div className="signal-eyebrow">Compliance notes</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{campaign.complianceNotes}</p>
            </div>
          </WorkspacePanel>

          {assetSections.map((section) => (
            <AssetSection
              assets={groupedAssets[section.key]}
              detail={section.detail}
              key={section.key}
              title={section.title}
            />
          ))}

          <WorkspacePanel
            eyebrow="Media library"
            title="Images, videos, files, and creative links"
            description="Anything Mark attaches as a visual or media URL should render here for inspection."
            aside={<StatusPill tone={workspace.media.length > 0 ? "blue" : "gray"}>{workspace.media.length} assets</StatusPill>}
          >
            <MediaGrid assets={workspace.media} />
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Sources"
            title="Audience and evidence"
            description="The records and links Mark used to justify this campaign."
          >
            {workspace.sources.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {workspace.sources.map((source) => (
                  <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={source.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-bold text-[var(--text-primary)]">{source.label}</div>
                        <StatusPill tone="gray">{source.kind}</StatusPill>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{source.detail}</p>
                    </div>
                    {source.url ? (
                      <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={source.url} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No sources captured" detail="Mark has not attached source records or evidence URLs to this campaign yet." />
            )}
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <WorkspacePanel
            eyebrow="Human gate"
            title="Approvals"
            description="Open approval cards to approve, reject, or request revisions."
            aside={<StatusPill tone={workspace.approvals.length > 0 ? "amber" : "green"}>{workspace.approvals.length} records</StatusPill>}
          >
            {workspace.approvals.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {workspace.approvals.map((approval) => (
                  <Link className="block px-5 py-4 transition hover:bg-[var(--surface-inset)]" href={approval.href} key={approval.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-[var(--text-primary)]">{approval.title}</div>
                      <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
                    </div>
                    <div className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
                      {approval.type} / {approval.riskLevel} risk / {approval.submittedAt}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No approval cards" detail="Campaign assets still need approval records before outbound action is allowed." />
              </div>
            )}
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Mark activity"
            title="What Mark wrote back"
            description="Recent agent outputs tied to this campaign, asset, or approval."
          >
            {workspace.activity.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {workspace.activity.map((item) => (
                  <div className="px-5 py-4" key={item.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-[var(--text-primary)]">{item.title}</div>
                      <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.outputType} / {item.createdAt}</div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No Mark outputs linked" detail="When Mark writes campaign outputs to agent_outputs, they will appear here." />
              </div>
            )}
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Timeline" title="Campaign events">
            {workspace.events.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {workspace.events.map((event) => (
                  <div className="px-5 py-4" key={event.id}>
                    <div className="font-bold text-[var(--text-primary)]">{event.type}</div>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{event.detail}</p>
                    <div className="mt-2 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {event.actor} / {event.occurredAt}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No timeline yet" detail="Campaign events will fill in as Mark creates, revises, and submits work." />
              </div>
            )}
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

function AssetSection({ title, detail, assets }: { title: string; detail: string; assets: CampaignWorkspaceAsset[] }) {
  return (
    <WorkspacePanel
      eyebrow="Campaign pieces"
      title={title}
      description={detail}
      aside={<StatusPill tone={assets.length > 0 ? "blue" : "gray"}>{assets.length} assets</StatusPill>}
    >
      {assets.length > 0 ? (
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          {assets.map((asset) => (
            <AssetCard asset={asset} key={asset.id} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing in this bucket yet" detail="When Mark creates this kind of campaign material, it will appear in this section." />
      )}
    </WorkspacePanel>
  );
}

function AssetCard({ asset }: { asset: CampaignWorkspaceAsset }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="border-b border-[var(--border-hairline)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="signal-eyebrow">{asset.channel}</div>
            <h3 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{asset.title}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{asset.assetType} / {asset.updatedAt}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill>
            <StatusPill tone={asset.dispatchLocked ? "amber" : "green"}>{asset.dispatchLocked ? "Locked" : "Unlocked"}</StatusPill>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <ReadableContent value={asset.preview} />
        {asset.media.length > 0 ? <MediaGrid assets={asset.media} compact /> : null}
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="signal-eyebrow">Compliance</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{asset.complianceNotes}</p>
        </div>
      </div>
    </article>
  );
}

function MediaGrid({ assets, compact = false }: { assets: CampaignMediaAsset[]; compact?: boolean }) {
  if (assets.length === 0) {
    return <EmptyState title="No media attached" detail="Images, videos, files, and creative URLs attached by Mark will preview here." />;
  }

  return (
    <div className={`grid gap-4 p-4 ${compact ? "" : "lg:grid-cols-2"}`}>
      {assets.map((asset) => (
        <MediaCard asset={asset} key={asset.id} />
      ))}
    </div>
  );
}

function MediaCard({ asset }: { asset: CampaignMediaAsset }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[var(--text-primary)]">{asset.title}</div>
          <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{asset.type} / {asset.source}</div>
        </div>
        <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={asset.url} rel="noreferrer" target="_blank">
          Open
        </a>
      </div>
      <div className="bg-[var(--surface-soft)]">
        {asset.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- Mark can attach arbitrary campaign media URLs.
          <img alt={asset.title} className="h-auto max-h-[520px] w-full object-contain" src={asset.url} />
        ) : null}
        {asset.type === "video" ? (
          <video className="max-h-[520px] w-full bg-black" controls poster={asset.thumbnailUrl ?? undefined} preload="metadata">
            <source src={asset.url} type={asset.mimeType ?? undefined} />
            <a href={asset.url}>Open video</a>
          </video>
        ) : null}
        {asset.type === "embed" ? <EmbedPreview asset={asset} /> : null}
        {asset.type === "file" || asset.type === "link" ? <LinkPreview asset={asset} /> : null}
      </div>
      {asset.description ? <p className="border-t border-[var(--border-hairline)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">{asset.description}</p> : null}
    </article>
  );
}

function EmbedPreview({ asset }: { asset: CampaignMediaAsset }) {
  const embedUrl = getEmbedUrl(asset.url);
  if (!embedUrl) return <LinkPreview asset={asset} />;

  return (
    <div className="aspect-video w-full">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full"
        src={embedUrl}
        title={asset.title}
      />
    </div>
  );
}

function LinkPreview({ asset }: { asset: CampaignMediaAsset }) {
  return (
    <div className="flex min-h-36 flex-col justify-center p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{asset.type}</div>
      <p className="mt-2 break-words text-sm leading-6 text-[var(--text-secondary)]">{asset.url}</p>
    </div>
  );
}

function ReadableContent({ value }: { value: string }) {
  const parsed = tryParseObject(value);
  if (!parsed) {
    return (
      <p className="whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-primary)]">
        {value.trim() ? value : "No copy captured yet."}
      </p>
    );
  }

  const entries = Object.entries(parsed).filter(([key]) => isReadableKey(key)).slice(0, 10);
  return (
    <div className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      {entries.map(([key, entry]) => (
        <div className="px-4 py-3" key={key}>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{humanize(key)}</div>
          <div className="mt-1 text-sm leading-6 text-[var(--text-primary)]">{renderReadableValue(entry)}</div>
        </div>
      ))}
    </div>
  );
}

function renderReadableValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1.5">
        {value.map((item, index) => (
          <li className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm" key={index}>
            {typeof item === "object" && item
              ? Object.entries(item as Record<string, unknown>)
                  .filter(([key]) => isReadableKey(key))
                  .map(([key, entry]) => `${humanize(key)}: ${typeof entry === "object" ? JSON.stringify(entry) : String(entry)}`)
                  .join(" / ")
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  return JSON.stringify(value);
}

function tryParseObject(value: string): Record<string, unknown> | null {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first === -1 || last <= first) return null;

  try {
    const parsed = JSON.parse(value.slice(first, last + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean).at(-1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).at(-1);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("complete") || normalized.includes("active")) return "green";
  if (normalized.includes("reject") || normalized.includes("block") || normalized.includes("decline")) return "red";
  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("draft") || normalized.includes("revision")) return "amber";
  return "blue";
}

function isReadableKey(key: string) {
  const normalized = key.toLowerCase();
  return !normalized.endsWith("_id") && !normalized.endsWith("_ids") && normalized !== "id" && !/payload|metadata|audit/.test(normalized);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
