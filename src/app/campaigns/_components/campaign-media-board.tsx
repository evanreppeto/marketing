"use client";

import { useEffect, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { cx, theme, toneTextClass, type ThemeTone } from "@/app/_components/theme";
import type { CampaignMediaAsset } from "@/lib/campaigns/read-model";

type GroupKey = "image" | "motion" | "file" | "link";
type FilterKey = GroupKey | "all";

const GROUP_META: Record<GroupKey, { title: string; detail: string; tone: ThemeTone }> = {
  image: { title: "Images", detail: "Generated visuals, postcards, and mockups.", tone: "blue" },
  motion: { title: "Video", detail: "Rendered video and embedded players.", tone: "red" },
  file: { title: "Files", detail: "Documents and downloadable assets.", tone: "amber" },
  link: { title: "Creative links", detail: "External references captured by the agent.", tone: "green" },
};

const GROUP_ORDER: GroupKey[] = ["image", "motion", "file", "link"];

function groupKey(media: CampaignMediaAsset): GroupKey {
  if (media.type === "image") return "image";
  if (media.type === "video" || media.type === "embed") return "motion";
  if (media.type === "file") return "file";
  return "link";
}

export function CampaignMediaBoard({
  media,
  filter,
  onFilterChange,
}: {
  media: CampaignMediaAsset[];
  filter: string | null;
  onFilterChange: (value: string | null) => void;
}) {
  const [lightbox, setLightbox] = useState<CampaignMediaAsset | null>(null);

  if (media.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
        No image, video, file, or creative link has been attached to this campaign yet.
      </p>
    );
  }

  const grouped = GROUP_ORDER.map((key) => ({ key, items: media.filter((item) => groupKey(item) === key) })).filter(
    (group) => group.items.length > 0,
  );
  // Controlled by the URL ?filter=…; fall back to "all" for missing/unknown values.
  const activeFilter: FilterKey = grouped.some((group) => group.key === filter) ? (filter as GroupKey) : "all";
  const visible = activeFilter === "all" ? grouped : grouped.filter((group) => group.key === activeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Media type">
        <MediaChip active={activeFilter === "all"} count={media.length} tone="blue" onClick={() => onFilterChange(null)}>
          All media
        </MediaChip>
        {grouped.map((group) => (
          <MediaChip
            key={group.key}
            active={activeFilter === group.key}
            count={group.items.length}
            tone={GROUP_META[group.key].tone}
            onClick={() => onFilterChange(group.key)}
          >
            {GROUP_META[group.key].title}
          </MediaChip>
        ))}
      </div>

      {visible.map((group) => (
        <MediaSection key={group.key} groupKey={group.key} items={group.items} onZoom={setLightbox} />
      ))}

      {lightbox ? <Lightbox media={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function MediaSection({
  groupKey: key,
  items,
  onZoom,
}: {
  groupKey: GroupKey;
  items: CampaignMediaAsset[];
  onZoom: (media: CampaignMediaAsset) => void;
}) {
  const agentName = useAgentName();
  const meta = GROUP_META[key];
  const detail = key === "link" ? `External references captured by ${agentName}.` : meta.detail;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className={`text-base font-semibold uppercase tracking-[0.1em] ${toneText(meta.tone)}`}>{meta.title}</div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detail}</p>
        </div>
        <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {key === "image" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {items.map((item) => (
            <ImageTile key={item.id} media={item} onZoom={() => onZoom(item)} />
          ))}
        </div>
      ) : null}

      {key === "motion" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <MotionTile key={item.id} media={item} />
          ))}
        </div>
      ) : null}

      {key === "file" ? (
        <ul className="divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
          {items.map((item) => (
            <FileRow key={item.id} media={item} />
          ))}
        </ul>
      ) : null}

      {key === "link" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <LinkCard key={item.id} media={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ImageTile({ media, onZoom }: { media: CampaignMediaAsset; onZoom: () => void }) {
  return (
    <figure className="group overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-inset)]">
      <button
        type="button"
        onClick={onZoom}
        className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
        title={media.description ?? media.title}
      >
        <div className="aspect-[4/3] overflow-hidden bg-[oklch(0.15_0.03_250)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- Arc emits arbitrary remote creative URLs; no optimizer config */}
          <img
            src={media.thumbnailUrl ?? media.url}
            alt={media.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        </div>
      </button>
      <figcaption className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] px-3 py-2">
        <span className="truncate text-xs font-semibold text-[var(--text-secondary)]">{media.title}</span>
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">View</span>
      </figcaption>
    </figure>
  );
}

function MotionTile({ media }: { media: CampaignMediaAsset }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="bg-[var(--media-void)]">
        {media.type === "video" ? (
          <video src={media.url} poster={media.thumbnailUrl ?? undefined} controls className="max-h-80 w-full object-contain" />
        ) : (
          <EmbedFrame media={media} />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-[var(--text-primary)]">{media.title}</div>
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-secondary)]">{media.description ?? `Captured from ${media.source}.`}</p>
        </div>
        <TypeBadge tone="red">{media.type === "embed" ? "Embed" : "Video"}</TypeBadge>
      </div>
    </article>
  );
}

function EmbedFrame({ media }: { media: CampaignMediaAsset }) {
  const embedUrl = toEmbedUrl(media.url);
  if (!embedUrl) return <LinkCardBody media={media} />;
  return (
    <iframe
      src={embedUrl}
      title={media.title}
      className="aspect-video w-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}

function FileRow({ media }: { media: CampaignMediaAsset }) {
  return (
    <li>
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[oklch(0.78_0.14_76/0.36)] bg-[oklch(0.52_0.13_76/0.14)]" aria-hidden>
          <DocIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[var(--text-primary)]">{media.title}</span>
          <span className="block truncate text-xs text-[var(--text-muted)]">{fileExtension(media) ?? "Document"} · from {media.source}</span>
        </span>
        <span className="shrink-0 font-mono text-xs font-bold text-[var(--accent)]">Open</span>
      </a>
    </li>
  );
}

function LinkCard({ media }: { media: CampaignMediaAsset }) {
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col rounded-xl border border-[oklch(0.72_0.14_155/0.34)] bg-[oklch(0.43_0.12_155/0.1)] p-4 transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <LinkCardBody media={media} />
    </a>
  );
}

function LinkCardBody({ media }: { media: CampaignMediaAsset }) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <LinkIcon />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[oklch(0.84_0.13_155)]">{hostOf(media.url)}</span>
      </div>
      <h4 className="mt-2 line-clamp-2 font-bold text-[var(--text-primary)]">{media.title}</h4>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
        {media.description ?? "Open the original asset."}
      </p>
      <span className="mt-auto pt-3 font-mono text-xs font-bold text-[var(--accent)]">Open original</span>
    </div>
  );
}

function Lightbox({ media, onClose }: { media: CampaignMediaAsset; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={media.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[oklch(0.1_0.02_250/0.88)] p-6 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate font-bold text-[var(--text-primary)]">{media.title}</div>
          {media.description ? <p className="truncate text-sm text-[var(--text-secondary)]">{media.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Close (Esc)
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- Arc emits arbitrary remote creative URLs; no optimizer config */}
      <img
        src={media.url}
        alt={media.title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[78vh] max-w-full rounded-lg border border-[var(--border-strong)] object-contain shadow-[0_30px_80px_oklch(0.02_0.02_250/0.6)]"
      />
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="font-mono text-xs font-bold text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
      >
        Open original in new tab
      </a>
    </div>
  );
}

function MediaChip({
  active,
  count,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  tone: ThemeTone;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${toneDot(tone)}`} />
      {children}
      <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
    </button>
  );
}

function TypeBadge({ tone, children }: { tone: ThemeTone; children: React.ReactNode }) {
  return (
    <span className={cx("shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]", theme.pill[tone])}>
      {children}
    </span>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.89 0.12 76)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.84 0.13 155)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  );
}

function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const videoId =
        parsed.searchParams.get("v") ??
        (pathParts[0] === "embed" || pathParts[0] === "shorts" ? pathParts[1] : null);
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
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

function fileExtension(media: CampaignMediaAsset): string | null {
  const match = media.url.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|#|$)/);
  return match ? match[1].toUpperCase() : null;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function toneText(tone: ThemeTone) {
  return toneTextClass(tone);
}

function toneDot(tone: ThemeTone) {
  if (tone === "red") return "bg-[var(--priority)]";
  if (tone === "amber") return "bg-[var(--warn)]";
  if (tone === "green") return "bg-[var(--ok)]";
  return "bg-[var(--accent)]";
}
