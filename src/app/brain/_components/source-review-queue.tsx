"use client";

import Link from "next/link";
import { Check, Database, FileText, FolderOpen, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import { type BrainSourceReviewData, type BrainSourceReviewGroup, type BrainSourceReviewItem } from "@/lib/brand-knowledge/source-review";

function kindLabel(value: string) {
  return value.replace(/[_-]+/g, " ");
}

function confidenceLabel(value: number | null) {
  if (typeof value !== "number") return null;
  return `${Math.round(value * 100)}% confidence`;
}

function removeItem(groups: BrainSourceReviewGroup[], id: string) {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.id !== id) }))
    .filter((group) => group.items.length > 0);
}

function removeGroup(groups: BrainSourceReviewGroup[], sourceId: string) {
  return groups.filter((group) => group.sourceId !== sourceId);
}

export function SourceReviewQueue({ data }: { data: BrainSourceReviewData }) {
  const [groups, setGroups] = useState(data.groups);
  const [unlinked, setUnlinked] = useState(data.unlinkedItems);
  const [pending, startTransition] = useTransition();
  const linkedCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  function decideItem(id: string, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const result = await action(id);
      if (!result.ok) return;
      setGroups((current) => removeItem(current, id));
      setUnlinked((current) => current.filter((item) => item.id !== id));
    });
  }

  function decideGroup(group: BrainSourceReviewGroup, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const results = await Promise.all(group.items.map((item) => action(item.id)));
      if (results.every((result) => result.ok)) setGroups((current) => removeGroup(current, group.sourceId));
    });
  }

  if (groups.length === 0 && unlinked.length === 0) {
    return (
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="signal-eyebrow">Source review</div>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Review by source</h2>
          </div>
          <StatusPill tone="green">Clear</StatusPill>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          No source-linked facts are waiting. New Drive, website, and uploaded source findings will appear here together.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div>
          <div className="signal-eyebrow">Source review</div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Review by source</h2>
          <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
            Approve what Arc learned from each Drive file, website import, or uploaded document before it becomes trusted memory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={linkedCount > 0 ? "amber" : "green"}>{linkedCount} linked</StatusPill>
          <StatusPill tone={unlinked.length > 0 ? "blue" : "gray"}>{unlinked.length} unlinked</StatusPill>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0 divide-y divide-[var(--border-hairline)] xl:border-r xl:border-[var(--border-hairline)]">
          {groups.length > 0 ? (
            groups.map((group) => (
              <SourceGroup
                disabled={pending}
                group={group}
                key={group.sourceId}
                onDecideGroup={decideGroup}
                onDecideItem={decideItem}
              />
            ))
          ) : (
            <EmptyBlock detail="Source-linked proposals are clear. Unlinked proposals, if any, remain on the right." title="No source groups" />
          )}
        </div>

        <div className="min-w-0">
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-3">
            <div className="signal-eyebrow">{unlinked.length} item{unlinked.length === 1 ? "" : "s"}</div>
            <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">Unlinked proposals</h3>
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {unlinked.length > 0 ? (
              unlinked.map((item) => <ReviewItem disabled={pending} item={item} key={item.id} onDecide={decideItem} compact />)
            ) : (
              <EmptyBlock detail="Every waiting item is attached to a source." title="No loose facts" />
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SourceGroup({
  disabled,
  group,
  onDecideGroup,
  onDecideItem,
}: {
  disabled: boolean;
  group: BrainSourceReviewGroup;
  onDecideGroup: (group: BrainSourceReviewGroup, decision: "approve" | "reject") => void;
  onDecideItem: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <article className="grid gap-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--accent)]">
              <FileText aria-hidden className="h-4 w-4" />
            </span>
            <h3 className="max-w-full truncate text-sm font-bold text-[var(--text-primary)]">{group.sourceLabel}</h3>
            <StatusPill tone="gray">{group.sourceProvider}</StatusPill>
            <StatusPill tone={group.availableToArc ? "amber" : "red"}>{group.items.length} proposed</StatusPill>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{group.classificationLabel}</span>
            <span>{group.classificationConfidence} source match</span>
            {!group.availableToArc ? <span className="text-[var(--priority-text)]">Hidden from Arc</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClasses({ variant: "approve", size: "sm" })}
            disabled={disabled}
            onClick={() => onDecideGroup(group, "approve")}
            type="button"
          >
            <Check aria-hidden className="h-3.5 w-3.5" />
            Approve source
          </button>
          <button
            className={buttonClasses({ variant: "ghost", size: "sm" })}
            disabled={disabled}
            onClick={() => onDecideGroup(group, "reject")}
            type="button"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
            Reject source
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {group.items.map((item) => (
          <ReviewItem disabled={disabled} item={item} key={item.id} onDecide={onDecideItem} />
        ))}
      </div>
    </article>
  );
}

function ReviewItem({
  compact = false,
  disabled,
  item,
  onDecide,
}: {
  compact?: boolean;
  disabled: boolean;
  item: BrainSourceReviewItem;
  onDecide: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <div className={cx("rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)]", compact ? "m-4 p-3" : "p-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="amber">Proposed</StatusPill>
        <span className="text-xs font-semibold capitalize text-[var(--text-muted)]">{kindLabel(item.kind)}</span>
        {confidenceLabel(item.confidence) ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Database aria-hidden className="h-3.5 w-3.5" />
            {confidenceLabel(item.confidence)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-bold text-[var(--text-primary)]">{item.label}</div>
      <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
        {item.summary || item.body || "No supporting detail saved."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={buttonClasses({ variant: "approve", size: "sm" })}
          disabled={disabled}
          onClick={() => onDecide(item.id, "approve")}
          type="button"
        >
          <Check aria-hidden className="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          className={buttonClasses({ variant: "ghost", size: "sm" })}
          disabled={disabled}
          onClick={() => onDecide(item.id, "reject")}
          type="button"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}

function EmptyBlock({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="px-5 py-5">
      <div className="rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <div className="flex items-start gap-3">
          <FolderOpen aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
            <Link className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-3" })} href="/library/brand">
              Open brand sources
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
