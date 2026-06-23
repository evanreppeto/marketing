"use client";

import { FileText, FolderOpen, HardDrive, Link2, RefreshCw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import {
  deleteGoogleDriveSourceAction,
  syncGoogleDriveSourceAction,
  toggleAvailableToArcAction,
} from "@/app/library/actions";
import {
  type SourceControlAsset,
  type SourceControlData,
  type SourceControlDriveSource,
} from "@/lib/brand-knowledge/source-control";

import { BrandKnowledgeSyncButton } from "./brand-knowledge-sync-button";

const COLLAPSED_COUNT = 6;

function formatDate(value: string | null) {
  if (!value) return "Never synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sync date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function providerIcon(provider: SourceControlAsset["provider"]) {
  if (provider === "Drive") return <HardDrive aria-hidden className="h-4 w-4" />;
  if (provider === "URL") return <Link2 aria-hidden className="h-4 w-4" />;
  if (provider === "Upload") return <Upload aria-hidden className="h-4 w-4" />;
  return <FileText aria-hidden className="h-4 w-4" />;
}

function driveTone(status: string) {
  if (status === "active") return "green" as const;
  if (status === "error") return "red" as const;
  return "amber" as const;
}

/**
 * Zone 4 — "Sources & media". The single consolidated list of everything Arc
 * can learn from (replaces the old two overlapping lists). Operators add via
 * the intake zone / Library, and enable, hide, sync, or remove here.
 */
export function BrandSourceList({
  data,
  readyToLearn,
}: {
  data: SourceControlData;
  readyToLearn: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = data.assets.length > COLLAPSED_COUNT;
  const visibleAssets = expanded ? data.assets : data.assets.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-labelledby="brand-sources-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-sources-heading">
            Sources &amp; media
          </h2>
          {data.assets.length > 0 ? (
            <span className="text-sm text-[var(--text-muted)]">{data.assets.length}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandKnowledgeSyncButton readyToLearn={readyToLearn} />
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
            <FolderOpen aria-hidden className="h-4 w-4" />
            Add files
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        {data.assets.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {visibleAssets.map((asset) => (
              <AssetRow asset={asset} key={asset.id} />
            ))}
          </div>
        ) : (
          <EmptyLine
            detail="Upload brand docs, import website pages, or save a Drive folder above and they'll appear here."
            title="No sources yet"
          />
        )}

        {hasMore ? (
          <button
            className="w-full border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "Show fewer" : `Show all ${data.assets.length} sources`}
          </button>
        ) : null}

        {data.driveSources.length > 0 ? (
          <div className="border-t border-[var(--border-hairline)]">
            <div className="bg-[var(--surface-inset)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Drive folders
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {data.driveSources.map((source) => (
                <DriveRow key={source.id} source={source} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 text-center">
        <Link className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href="/library">
          View everything in Library →
        </Link>
      </div>
    </section>
  );
}

function AssetRow({ asset }: { asset: SourceControlAsset }) {
  return (
    <article className="flex min-w-0 items-center gap-3 px-5 py-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
        {providerIcon(asset.provider)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 max-w-full truncate text-sm font-bold text-[var(--text-primary)]">{asset.label}</h3>
          <StatusPill tone={asset.status.tone}>{asset.status.label}</StatusPill>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{asset.status.detail}</p>
      </div>
      <form action={toggleAvailableToArcAction} className="shrink-0">
        <input name="id" type="hidden" value={asset.id} />
        <input name="value" type="hidden" value={asset.availableToArc ? "false" : "true"} />
        <button className={buttonClasses({ variant: asset.availableToArc ? "ghost" : "primary", size: "sm" })} type="submit">
          {asset.availableToArc ? "Hide" : "Enable"}
        </button>
      </form>
    </article>
  );
}

function DriveRow({ source }: { source: SourceControlDriveSource }) {
  return (
    <article className="flex min-w-0 items-center gap-3 px-5 py-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
        <HardDrive aria-hidden className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">{source.label}</h3>
          <StatusPill tone={driveTone(source.status)}>{source.status}</StatusPill>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
          {formatDate(source.lastSyncedAt)} · {source.lastImportedCount} imported last sync
          {source.lastError ? ` · ${source.lastError}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={syncGoogleDriveSourceAction}>
          <input name="sourceId" type="hidden" value={source.id} />
          <button className={buttonClasses({ variant: "ghost", size: "sm" })} type="submit">
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Sync
          </button>
        </form>
        <form action={deleteGoogleDriveSourceAction}>
          <input name="sourceId" type="hidden" value={source.id} />
          <button aria-label={`Remove ${source.label}`} className={buttonClasses({ variant: "ghost", size: "sm" })} type="submit">
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </article>
  );
}

function EmptyLine({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-6">
      <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}
