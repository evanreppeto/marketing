"use client";

import { useCallback, useEffect, useTransition } from "react";

import { type MediaAssetView, type MediaFolderView } from "@/lib/media-library/types";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  MoveIcon,
  SparkIcon,
  TrashIcon,
} from "./icons";
import { deleteAssetAction, moveAssetAction, sendAssetsToArcAction } from "../actions";

/**
 * Fullscreen overlay for stepping through the (filtered) asset list. Prev/next
 * buttons + arrow keys move; Esc closes. Action bar mirrors the card actions
 * (download, move, delete, use in Arc) for the currently-shown asset.
 */
export function Lightbox({
  assets,
  index,
  folders,
  onClose,
  onIndexChange,
}: {
  assets: MediaAssetView[];
  index: number;
  folders: MediaFolderView[];
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const asset = assets[index];

  const step = useCallback(
    (delta: number) => {
      const next = (index + delta + assets.length) % assets.length;
      onIndexChange(next);
    },
    [index, assets.length, onIndexChange],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  if (!asset) return null;

  const moveFolders = folders.filter((f) => f.id !== "all");

  function runMove(folderId: string) {
    const formData = new FormData();
    formData.set("id", asset.id);
    formData.set("folderId", folderId);
    startTransition(async () => {
      await moveAssetAction(formData);
    });
  }

  function runDelete() {
    const formData = new FormData();
    formData.set("id", asset.id);
    startTransition(async () => {
      await deleteAssetAction(formData);
      onClose();
    });
  }

  function runSendToArc() {
    const formData = new FormData();
    formData.set("ids", asset.id);
    startTransition(async () => {
      await sendAssetsToArcAction(formData);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--overlay)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={asset.fileName}
    >
      <div
        className="relative flex flex-1 items-center justify-center p-8"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {assets.length > 1 ? (
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="absolute left-5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-panel)] text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element -- user media, external/public URL */}
        <img
          alt={asset.fileName}
          src={asset.url}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        {assets.length > 1 ? (
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="absolute right-5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-panel)] text-[var(--text-primary)] transition hover:border-[var(--accent-border-strong)]"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-panel)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{asset.fileName}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {[asset.dimensions, asset.size, asset.source, `${index + 1} of ${assets.length}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={asset.url}
            download={asset.fileName}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Download
          </a>

          <label className="relative inline-flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]">
            <MoveIcon className="h-3.5 w-3.5" />
            Move
            <select
              aria-label="Move to folder"
              disabled={pending}
              defaultValue=""
              onChange={(event) => {
                runMove(event.target.value);
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

          <button
            type="button"
            onClick={runDelete}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--priority-border-soft)] bg-[var(--surface-inset)] px-3 py-2 text-xs font-medium text-[var(--priority-bright)] transition hover:bg-[var(--priority-soft)] disabled:opacity-60"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>

          <button
            type="button"
            onClick={runSendToArc}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent-contrast)] transition hover:border-[var(--accent)] disabled:opacity-60"
          >
            <SparkIcon className="h-3.5 w-3.5" />
            Use in Arc
          </button>
        </div>
      </div>
    </div>
  );
}
