import type { CampaignMediaAsset } from "@/lib/campaigns/read-model";

export function CampaignMediaBoard({ media }: { media: CampaignMediaAsset[] }) {
  if (media.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No image, video, file, or creative link has been attached to this campaign yet.
      </p>
    );
  }

  const featured = media[0];
  const rest = media.slice(1);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="signal-eyebrow">Creative preview</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{featured.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {featured.description ?? `Captured from ${featured.source}.`}
          </p>
        </div>
        <div className="bg-[var(--surface-soft)] p-4">
          <MediaFrame media={featured} featured />
        </div>
      </section>

      {rest.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rest.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
              <MediaFrame media={item} />
              <div className="border-t border-[var(--border-hairline)] px-4 py-3">
                <div className="line-clamp-1 font-bold text-[var(--text-primary)]">{item.title}</div>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
                  {item.description ?? `Captured from ${item.source}.`}
                </p>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function MediaFrame({ media, featured = false }: { media: CampaignMediaAsset; featured?: boolean }) {
  const sizeClass = featured ? "min-h-[360px] max-h-[620px]" : "h-56";

  if (media.type === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className={`block overflow-hidden bg-[var(--surface-inset)] ${sizeClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Mark emits arbitrary remote creative URLs; no optimizer config */}
        <img
          src={media.thumbnailUrl ?? media.url}
          alt={media.title}
          className="h-full w-full object-contain transition duration-300 hover:scale-[1.01]"
        />
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        controls
        className={`w-full bg-black object-contain ${sizeClass}`}
      />
    );
  }

  if (media.type === "embed") {
    const embedUrl = toEmbedUrl(media.url);
    return embedUrl ? (
      <iframe
        src={embedUrl}
        title={media.title}
        className={`w-full border-0 bg-black ${sizeClass}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    ) : (
      <ExternalMediaCard media={media} featured={featured} />
    );
  }

  return <ExternalMediaCard media={media} featured={featured} />;
}

function ExternalMediaCard({ media, featured }: { media: CampaignMediaAsset; featured: boolean }) {
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className={`flex flex-col justify-between bg-[var(--surface-inset)] p-5 transition hover:bg-[var(--surface-raised)] ${
        featured ? "min-h-[300px]" : "h-56"
      }`}
    >
      <div>
        <span className="signal-eyebrow">{media.type === "file" ? "Attached file" : "Creative link"}</span>
        <h3 className="mt-3 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{media.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {media.description ?? `Open the original asset from ${media.source}.`}
        </p>
      </div>
      <span className="mt-6 text-sm font-bold text-[var(--accent)]">Open original</span>
    </a>
  );
}

function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean).at(-1);
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }
  return null;
}
