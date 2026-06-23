"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SafeImage } from "./safe-image";
import { attachMediaAction, listAttachableMediaAction } from "../actions";
import type { AttachableMediaItem } from "@/lib/campaigns/attach-media";

/**
 * Operator affordance to attach a real, approved Library image to a campaign
 * asset (e.g. an email's hero) — the on-purpose replacement for the fabricated
 * images we no longer render. Approval-safe: attaching never unlocks outbound.
 */
export function AttachMediaButton({
  assetId,
  campaignId,
  label = "Attach approved media",
}: {
  assetId: string;
  campaignId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {label}
      </button>
      {open ? <AttachMediaDialog assetId={assetId} campaignId={campaignId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AttachMediaDialog({
  assetId,
  campaignId,
  onClose,
}: {
  assetId: string;
  campaignId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AttachableMediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    listAttachableMediaAction()
      .then((res) => {
        if (active) setItems(res);
      })
      .catch(() => {
        if (active) setError("Couldn't load your Library.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function attach(item: AttachableMediaItem) {
    const formData = new FormData();
    formData.set("assetId", assetId);
    formData.set("campaignId", campaignId);
    formData.set("libraryAssetId", item.id);
    setError(null);
    setBusyId(item.id);
    startTransition(async () => {
      const result = await attachMediaAction(null, formData);
      setBusyId(null);
      if (result?.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(result?.message ?? "Couldn't attach that media.");
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attach approved media"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55" />
      <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--canvas)] shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Attach approved media</h2>
            <p className="text-xs text-[var(--text-muted)]">Real assets from your Library. Outbound stays locked until you approve.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-bold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)]"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-2 text-xs text-[var(--accent)]">{error}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items === null ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">Loading your Library…</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              No Library media yet. Add approved images in the Library, then attach them here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => attach(item)}
                  disabled={busyId !== null}
                  className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] text-left transition hover:border-[var(--accent)] disabled:opacity-50"
                  title={item.fileName}
                >
                  <SafeImage
                    src={item.url}
                    alt={item.fileName}
                    className="h-28 w-full bg-[var(--surface-inset)] object-cover"
                  />
                  <span className="truncate px-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    {busyId === item.id ? "Attaching…" : item.fileName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
