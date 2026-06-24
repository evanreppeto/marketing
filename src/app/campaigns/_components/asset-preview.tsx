"use client";

import { useId, useState } from "react";
import { theme } from "@/app/_components/theme";
import type { CampaignMediaAsset, CampaignMediaOrigin, CampaignWorkspaceAsset } from "@/lib/campaigns/read-model";
import { SafeImage } from "./safe-image";
import { ViralityBadge, viralityRank } from "./virality-badge";

/** Human-readable provenance label for a media asset's origin. */
export function mediaOriginLabel(origin: CampaignMediaOrigin): string {
  if (origin === "generated") return "AI-generated";
  return "Approved media";
}

/** Small provenance chip shown on rendered creative (source type + source). */
export function MediaProvenanceBadge({ media }: { media: CampaignMediaAsset }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      {mediaOriginLabel(media.origin)}
      {media.source ? <span className="font-medium normal-case tracking-normal text-[var(--text-muted)]">· {media.source}</span> : null}
    </span>
  );
}

export function AssetPreview({ asset }: { asset: CampaignWorkspaceAsset }) {
  const hasMedia = asset.media.length > 0;

  return (
    <div className="space-y-3">
      {hasMedia ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[...asset.media]
            .sort((a, b) => viralityRank(b) - viralityRank(a))
            .slice(0, 4)
            .map((media, index) => (
              <MediaTile key={media.id} media={media} topPick={index === 0 && viralityRank(media) >= 0} />
            ))}
        </div>
      ) : null}

      {asset.body ? (
        <ReadableCopy body={asset.body} expandLabel={expandLabelFor(asset)} />
      ) : !hasMedia ? (
        <p className={`${theme.surface.dashedEmpty} p-3 text-sm text-[var(--text-muted)]`}>
          {asset.preview}
        </p>
      ) : null}
    </div>
  );
}

/** Channel-appropriate label for the expand toggle — `ReadableCopy` is shared by
 *  every body type (emails, scripts, ad copy, postcards), not just email. */
function expandLabelFor(asset: CampaignWorkspaceAsset) {
  return /e-?mail/i.test(`${asset.channel} ${asset.assetType}`) ? "Read full email" : "Read full";
}

function ReadableCopy({ body, expandLabel }: { body: string; expandLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const paragraphs = body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Long bodies (e.g. full emails) collapse to a clamped preview with a fade and
  // an expand toggle; short bodies render whole with no toggle.
  const isLong = body.length > 280;
  const collapsed = isLong && !expanded;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <div id={regionId} className={`relative px-4 py-4 ${collapsed ? "max-h-44 overflow-hidden" : ""}`}>
        {paragraphs.length > 0 ? (
          <div className="space-y-3">
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 18)}`}
                className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
        )}
        {collapsed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface-soft)] to-transparent"
          />
        ) : null}
      </div>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border-hairline)] px-4 py-2 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {expanded ? "Collapse" : expandLabel}
        </button>
      ) : null}
    </div>
  );
}

function MediaTile({ media, topPick = false }: { media: CampaignMediaAsset; topPick?: boolean }) {
  if (media.type === "image") {
    return (
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="group relative block overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]"
        title={media.description ?? media.title}
      >
        <SafeImage
          src={media.thumbnailUrl ?? media.url}
          alt={media.title}
          className="h-36 w-full object-contain transition group-hover:scale-[1.02]"
        />
        <span className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {topPick ? (
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent-contrast)]">
              Top pick
            </span>
          ) : null}
          <MediaProvenanceBadge media={media} />
          <ViralityBadge media={media} />
        </span>
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)]">
        <video
          src={media.url}
          poster={media.thumbnailUrl ?? undefined}
          controls
          className="h-36 w-full object-contain"
        />
        <span className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {topPick ? (
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent-contrast)]">
              Top pick
            </span>
          ) : null}
          <MediaProvenanceBadge media={media} />
          <ViralityBadge media={media} />
        </span>
      </div>
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-36 flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
    >
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {media.type === "embed" ? "Video" : media.type === "file" ? "File" : "Link"}
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">{media.title}</span>
      <span className="truncate text-xs text-[var(--accent)]">Open original</span>
    </a>
  );
}
