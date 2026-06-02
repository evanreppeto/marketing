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
  const paragraphs = body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
      {paragraphs.length > 0 ? (
        <div className="space-y-3">
          {paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 18)}`} className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
      )}
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
