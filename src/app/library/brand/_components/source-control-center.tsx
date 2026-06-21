"use client";

import { Check, Database, FileText, HardDrive, Link2, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import {
  deleteGoogleDriveSourceAction,
  syncGoogleDriveSourceAction,
  toggleAvailableToArcAction,
} from "@/app/library/actions";
import { type SourceControlData, type SourceControlReviewItem, type SourceControlTone } from "@/lib/brand-knowledge/source-control";

function formatDate(value: string | null) {
  if (!value) return "Never synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sync date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function providerIcon(provider: string) {
  if (provider === "Drive") return <HardDrive aria-hidden />;
  if (provider === "URL") return <Link2 aria-hidden />;
  if (provider === "Upload") return <Upload aria-hidden />;
  return <FileText aria-hidden />;
}

function driveTone(status: string): SourceControlTone {
  if (status === "active") return "green";
  if (status === "error") return "red";
  return "amber";
}

function compactKind(kind: string) {
  return kind.replace(/[_-]+/g, " ");
}

export function SourceControlCenter({ data }: { data: SourceControlData }) {
  const [reviewItems, setReviewItems] = useState(data.reviewItems);
  const [pending, startTransition] = useTransition();

  function decide(item: SourceControlReviewItem, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const result = await action(item.id);
      if (result.ok) setReviewItems((items) => items.filter((next) => next.id !== item.id));
    });
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="signal-eyebrow">Source control</div>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Library to Brain pipeline</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
              Manage the files, Drive folders, and website imports that Arc is allowed to learn from.
            </p>
          </div>
          <StatusPill tone={reviewItems.length > 0 ? "amber" : "green"}>
            {reviewItems.length > 0 ? `${reviewItems.length} needs review` : "Review clear"}
          </StatusPill>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <SourceStat label="Sources" value={data.stats.sources} />
          <SourceStat label="Drive" value={data.stats.driveSources} />
          <SourceStat label="Ready" value={data.stats.ready} />
          <SourceStat label="Learned" value={data.stats.learned} />
          <SourceStat label="Review" value={reviewItems.length} tone={reviewItems.length ? "amber" : "green"} />
          <SourceStat label="Blocked" value={data.stats.blocked} tone={data.stats.blocked ? "red" : "green"} />
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="min-w-0 border-b border-[var(--border-hairline)] xl:border-b-0 xl:border-r">
          <SectionTitle eyebrow={`${data.assets.length} library source${data.assets.length === 1 ? "" : "s"}`} title="Source inventory" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {data.assets.length > 0 ? (
              data.assets.slice(0, 10).map((asset) => (
                <article className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]" key={asset.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
                        {providerIcon(asset.provider)}
                      </span>
                      <h3 className="min-w-0 max-w-full truncate text-sm font-bold text-[var(--text-primary)]">{asset.label}</h3>
                      <StatusPill tone="gray">{asset.provider}</StatusPill>
                      <StatusPill tone={asset.status.tone}>{asset.status.label}</StatusPill>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{asset.status.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>{asset.classification.label}</span>
                      <span>{asset.classification.confidence} confidence</span>
                      <span>{compactKind(asset.kind)}</span>
                      {asset.size ? <span>{asset.size}</span> : null}
                      <span>{asset.brain.trusted} approved</span>
                      <span>{asset.brain.proposed} review</span>
                    </div>
                  </div>
                  <form action={toggleAvailableToArcAction} className="flex items-start justify-end">
                    <input name="id" type="hidden" value={asset.id} />
                    <input name="value" type="hidden" value={asset.availableToArc ? "false" : "true"} />
                    <button className={buttonClasses({ variant: asset.availableToArc ? "ghost" : "primary", size: "sm" })} type="submit">
                      {asset.availableToArc ? "Hide" : "Enable"}
                    </button>
                  </form>
                </article>
              ))
            ) : (
              <EmptyLine title="No source files yet" detail="Upload brand docs, import website pages, or save a Drive folder source." />
            )}
          </div>

          <SectionTitle eyebrow={`${data.driveSources.length} saved folder${data.driveSources.length === 1 ? "" : "s"}`} title="Drive sources" />
          <div className="divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]">
            {data.driveSources.length > 0 ? (
              data.driveSources.map((source) => (
                <article className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]" key={source.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
                        <HardDrive aria-hidden className="h-4 w-4" />
                      </span>
                      <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">{source.label}</h3>
                      <StatusPill tone={driveTone(source.status)}>{source.status}</StatusPill>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>{formatDate(source.lastSyncedAt)}</span>
                      <span>{source.lastImportedCount} imported last sync</span>
                      {source.lastError ? <span className="text-[var(--priority-text)]">{source.lastError}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <form action={syncGoogleDriveSourceAction}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button className={buttonClasses({ variant: "ghost", size: "sm" })} type="submit">
                        <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                        Sync
                      </button>
                    </form>
                    <form action={deleteGoogleDriveSourceAction}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button className={buttonClasses({ variant: "ghost", size: "sm" })} type="submit">
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <EmptyLine title="No saved Drive folders" detail="Use the Drive import panel to save a folder as a reusable source." />
            )}
          </div>
        </div>

        <div className="min-w-0">
          <SectionTitle eyebrow={`${reviewItems.length} source-linked item${reviewItems.length === 1 ? "" : "s"}`} title="Brain review" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {reviewItems.length > 0 ? (
              reviewItems.map((item) => (
                <article className="px-5 py-4" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="amber">Proposed</StatusPill>
                    <StatusPill tone="gray">{compactKind(item.kind)}</StatusPill>
                    <span className="truncate text-xs font-semibold text-[var(--text-muted)]">From {item.sourceLabel}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)]">{item.label}</h3>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {item.summary || item.body || "No supporting detail saved."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Database aria-hidden className="h-3.5 w-3.5" />
                      {item.sourceProvider}
                      {typeof item.confidence === "number" ? `, ${Math.round(item.confidence * 100)}%` : ""}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className={cx(buttonClasses({ variant: "approve", size: "sm" }), "min-w-[6rem]")}
                        disabled={pending}
                        onClick={() => decide(item, "approve")}
                        type="button"
                      >
                        <Check aria-hidden className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        className={cx(buttonClasses({ variant: "ghost", size: "sm" }), "min-w-[5.5rem]")}
                        disabled={pending}
                        onClick={() => decide(item, "reject")}
                        type="button"
                      >
                        <X aria-hidden className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyLine title="Nothing needs review" detail="New source facts will show here when Arc extracts knowledge that needs approval." />
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SourceStat({ label, value, tone = "blue" }: { label: string; value: number; tone?: SourceControlTone }) {
  return (
    <div className="border border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-panel)_72%,var(--canvas))] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
        <StatusPill tone={tone}>{value}</StatusPill>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-3">
      <div className="signal-eyebrow">{eyebrow}</div>
      <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">{title}</h3>
    </div>
  );
}

function EmptyLine({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-5">
      <div className="border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
