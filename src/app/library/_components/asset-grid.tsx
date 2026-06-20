"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { type MediaAssetView, type MediaFolderView } from "@/lib/media-library/types";

import { DetailDrawer } from "./detail-drawer";
import { FilterChips, type AssetFilter } from "./filter-chips";
import {
  DownloadIcon,
  EditIcon,
  MoveIcon,
  PlayIcon,
  TrashIcon,
} from "./icons";
import { Lightbox } from "./lightbox";
import { deleteAssetAction, moveAssetAction, renameAssetAction } from "../actions";

/**
 * Client island for the asset grid. Owns the in-memory type/Arc/unused filter,
 * the selected asset (DetailDrawer), the lightbox index, and per-card hover
 * quick actions (rename, move, download, delete). All mutations go through the
 * existing server actions; revalidatePath refreshes the data, so no manual
 * client refetch is needed. Folder filtering itself stays server-side (URL).
 */
export function AssetGrid({
  assets,
  folders,
}: {
  assets: MediaAssetView[];
  folders: MediaFolderView[];
}) {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Open a specific asset's drawer when arriving from a deep-link (e.g. the Brain
  // tab links to /library?asset=<id>). Runs once on mount; no-op without the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get("asset");
    // Deferred to a microtask so the set-state happens outside the effect body
    // (matches the repo's set-state-in-effect rule; same pattern as command-palette).
    if (assetId) void Promise.resolve().then(() => setSelectedId(assetId));
  }, []);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    switch (filter) {
      case "photos":
        return assets.filter((a) => a.kind === "image" || a.kind === "logo");
      case "video":
        return assets.filter((a) => a.kind === "video");
      case "arc":
        return assets.filter((a) => a.availableToArc);
      case "unused":
        return assets.filter((a) => a.usedInCount === 0);
      default:
        return assets;
    }
  }, [assets, filter]);

  const selected = selectedId ? filtered.find((a) => a.id === selectedId) ?? null : null;
  const moveFolders = folders.filter((f) => f.id !== "all");

  function runMove(id: string, folderId: string) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("folderId", folderId);
    startTransition(async () => {
      await moveAssetAction(formData);
    });
  }

  function runDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      await deleteAssetAction(formData);
      if (selectedId === id) setSelectedId(null);
    });
  }

  function runRename(id: string, name: string) {
    const trimmed = name.trim();
    setRenamingId(null);
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("name", trimmed);
    startTransition(async () => {
      await renameAssetAction(formData);
    });
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4">
        <FilterChips active={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
          No assets match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => (
            <figure
              key={a.id}
              className="group relative overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] transition hover:-translate-y-0.5 hover:border-[var(--accent-border-strong)] hover:shadow-[var(--elev-card)]"
            >
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                aria-label={`Open ${a.fileName}`}
                className="block w-full"
              >
                <div className="relative aspect-[4/3] bg-[var(--surface-inset)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user media, external/public URL */}
                  <img alt={a.fileName} src={a.url} className="h-full w-full object-cover" />
                  {a.kind === "video" ? (
                    <span className="absolute inset-0 flex items-center justify-center text-white/90">
                      <PlayIcon className="h-8 w-8" />
                    </span>
                  ) : null}
                  <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    {a.badge}
                  </span>
                  {a.usedInCount > 0 ? (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-[var(--ok)]">
                      <span className="h-1 w-1 rounded-full bg-[var(--ok)]" />
                      Used in {a.usedInCount}
                    </span>
                  ) : null}
                </div>
              </button>

              {/* Hover quick-action toolbar */}
              <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                <CardAction
                  label="Rename"
                  onClick={() => setRenamingId(a.id)}
                >
                  <EditIcon className="h-3.5 w-3.5" />
                </CardAction>

                <label
                  title="Move"
                  className="pointer-events-auto relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-black/80 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  <MoveIcon className="h-3.5 w-3.5" />
                  <select
                    aria-label="Move to folder"
                    disabled={pending}
                    defaultValue=""
                    onChange={(event) => {
                      runMove(a.id, event.target.value);
                      event.target.value = "";
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="" disabled>
                      Move to…
                    </option>
                    <option value="">All media</option>
                    {moveFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <a
                  href={a.url}
                  download={a.fileName}
                  title="Download"
                  className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-black/80 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </a>

                <CardAction
                  label="Delete"
                  destructive
                  disabled={pending}
                  onClick={() => runDelete(a.id)}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </CardAction>
              </div>

              <figcaption className="px-3 py-2.5">
                {renamingId === a.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = new FormData(event.currentTarget).get("name");
                      runRename(a.id, String(value ?? ""));
                    }}
                  >
                    <input
                      autoFocus
                      name="name"
                      defaultValue={a.fileName}
                      onBlur={(event) => runRename(a.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      className="min-h-7 w-full rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 text-[12px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    />
                  </form>
                ) : (
                  <div className="truncate text-[12px] text-[var(--text-primary)]" title={a.fileName}>
                    {a.fileName}
                  </div>
                )}
                <div className="text-[10px] text-[var(--text-muted)]">
                  {[a.dimensions, a.size].filter(Boolean).join(" · ")}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {selected ? (
        <DetailDrawerHost
          asset={selected}
          onClose={() => setSelectedId(null)}
          onExpand={() => {
            const idx = filtered.findIndex((a) => a.id === selected.id);
            if (idx >= 0) setLightboxIndex(idx);
          }}
        />
      ) : null}

      {lightboxIndex !== null ? (
        <Lightbox
          assets={filtered}
          index={lightboxIndex}
          folders={folders}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}
    </div>
  );
}

// Floats the DetailDrawer to the right edge as a fixed overlay so it doesn't
// disturb the grid layout regardless of viewport width.
function DetailDrawerHost({
  asset,
  onClose,
  onExpand,
}: {
  asset: MediaAssetView;
  onClose: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex max-w-full items-start overflow-y-auto p-4">
      <DetailDrawer key={asset.id} asset={asset} onClose={onClose} onExpand={onExpand} />
    </div>
  );
}

function CardAction({
  label,
  children,
  onClick,
  destructive,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-black/80 transition disabled:opacity-60 ${
        destructive
          ? "text-[var(--priority-bright)] hover:bg-[var(--priority-soft)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}
