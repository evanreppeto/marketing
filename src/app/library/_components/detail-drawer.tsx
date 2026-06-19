"use client";

import { useState, useTransition } from "react";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import { type MediaAssetView } from "@/lib/media-library/types";

import { CloseIcon, ExpandIcon, SparkIcon } from "./icons";
import { sendAssetsToArcAction, setTagsAction, toggleAvailableToArcAction } from "../actions";

/**
 * Right-side detail panel for a single asset: large preview, provenance rows,
 * editable tag chips, used-in count, risk flags, and an Arc panel
 * (Available-to-Arc toggle + "Use in new Arc chat"). All mutations go through
 * server actions; revalidatePath refreshes the underlying data. Close is owned
 * by the parent via onClose.
 */
export function DetailDrawer({
  asset,
  onClose,
  onExpand,
}: {
  asset: MediaAssetView;
  onClose: () => void;
  onExpand: () => void;
}) {
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [tagsPending, startTagsTransition] = useTransition();
  const [arcPending, startArcTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  // The parent remounts this component (keyed on asset.id) when a different
  // asset is selected, so local draft state resets without a sync effect.

  function saveTags() {
    if (tags === asset.tags.join(", ")) return;
    const formData = new FormData();
    formData.set("id", asset.id);
    formData.set("tags", tags);
    startTagsTransition(async () => {
      await setTagsAction(formData);
    });
  }

  function markAsBrandSource() {
    const nextTags = Array.from(new Set([...asset.tags, "brand source", "visual identity"]));
    setTags(nextTags.join(", "));
    const formData = new FormData();
    formData.set("id", asset.id);
    formData.set("tags", nextTags.join(", "));
    startTagsTransition(async () => {
      await setTagsAction(formData);
    });
  }

  function toggleArc() {
    const formData = new FormData();
    formData.set("id", asset.id);
    formData.set("value", String(!asset.availableToArc));
    startArcTransition(async () => {
      await toggleAvailableToArcAction(formData);
    });
  }

  function sendToArc() {
    const formData = new FormData();
    formData.set("ids", asset.id);
    setSentMessage(null);
    startSendTransition(async () => {
      await sendAssetsToArcAction(formData);
      setSentMessage("Started a new Arc chat with this asset.");
    });
  }

  return (
    <aside className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
      <div className="relative aspect-[4/3] bg-[var(--surface-inset)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- user media, external/public URL */}
        <img alt={asset.fileName} src={asset.url} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={onExpand}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <ExpandIcon className="h-3 w-3" />
          Click to expand
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="truncate text-sm font-semibold text-[var(--text-primary)]" title={asset.fileName}>
          {asset.fileName}
        </div>

        <dl className="space-y-0 text-xs">
          <ProvenanceRow label="Source" value={asset.source} />
          <ProvenanceRow label="Uploaded by" value={asset.uploadedBy ?? "—"} />
          <ProvenanceRow label="Dimensions" value={asset.dimensions ?? "—"} />
          <ProvenanceRow label="Size" value={asset.size ?? "—"} />
          <ProvenanceRow label="Used in" value={`${asset.usedInCount} campaign${asset.usedInCount === 1 ? "" : "s"}`} />
        </dl>

        {asset.riskFlags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {asset.riskFlags.map((flag) => (
              <StatusPill key={flag} tone="red">
                {flag}
              </StatusPill>
            ))}
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Tags
          </div>
          {asset.tags.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {asset.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            onBlur={saveTags}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            placeholder="Comma-separated tags"
            className="min-h-9 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
          <button
            className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-2 w-full justify-center" })}
            disabled={tagsPending}
            onClick={markAsBrandSource}
            type="button"
          >
            Mark as brand source
          </button>
          {tagsPending ? <p className="mt-1 text-[10px] text-[var(--text-muted)]">Saving tags...</p> : null}
        </div>

        <div className="rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-primary)]">Available to Arc</span>
            <button
              type="button"
              role="switch"
              aria-checked={asset.availableToArc}
              disabled={arcPending}
              onClick={toggleArc}
              className={`relative h-5 w-9 rounded-full transition disabled:opacity-60 ${
                asset.availableToArc ? "bg-[var(--accent)]" : "bg-[var(--surface-raised)]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--canvas)] transition-all ${
                  asset.availableToArc ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <button
            type="button"
            onClick={sendToArc}
            disabled={sendPending}
            className={buttonClasses({ variant: "primary", size: "sm", className: "mt-3 w-full" })}
          >
            <SparkIcon className="h-3.5 w-3.5" />
            {sendPending ? "Starting chat..." : "Use in new Arc chat"}
          </button>
          {sentMessage ? (
            <p className="mt-2 text-[10px] text-[var(--text-primary)]" aria-live="polite">
              {sentMessage}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-hairline)] py-1.5 last:border-b-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-[var(--text-secondary)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
