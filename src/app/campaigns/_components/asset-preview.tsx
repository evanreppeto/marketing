"use client";

import { useState } from "react";
import type { CampaignMediaAsset, CampaignWorkspaceAsset } from "@/lib/campaigns/read-model";

export function AssetPreview({ asset }: { asset: CampaignWorkspaceAsset }) {
  const hasMedia = asset.media.length > 0;

  return (
    <div className="space-y-3">
      {hasMedia ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {asset.media.slice(0, 4).map((media) => (
            <MediaTile key={media.id} media={media} />
          ))}
        </div>
      ) : null}

      {asset.body ? (
        <ReadableCopy body={asset.body} />
      ) : !hasMedia ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-muted)]">
          {asset.preview}
        </p>
      ) : null}
    </div>
  );
}

function ReadableCopy({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Long bodies (e.g. full emails) collapse to a clamped preview with a fade and
  // a "Read full email" toggle; short bodies render whole with no toggle.
  const isLong = body.length > 280;
  const collapsed = isLong && !expanded;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <div className={`relative px-4 py-4 ${collapsed ? "max-h-44 overflow-hidden" : ""}`}>
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
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border-hairline)] px-4 py-2 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {expanded ? "Collapse" : "Read full email"}
        </button>
      ) : null}
    </div>
  );
}

function MediaTile({ media }: { media: CampaignMediaAsset }) {
  if (media.type === "image") {
    return (
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]"
        title={media.description ?? media.title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
        <img src={media.thumbnailUrl ?? media.url} alt={media.title} className="h-36 w-full object-contain transition group-hover:scale-[1.02]" />
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        controls
        className="h-36 w-full rounded-lg border border-[var(--border-hairline)] bg-black object-contain"
      />
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-36 flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {media.type === "embed" ? "Video" : media.type === "file" ? "File" : "Link"}
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">{media.title}</span>
      <span className="truncate text-xs text-[var(--accent)]">Open original</span>
    </a>
  );
}
