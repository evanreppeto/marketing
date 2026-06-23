"use client";

import { Check, Database, X } from "lucide-react";
import { useState, useTransition } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import { approveNodeAction, rejectNodeAction } from "@/app/brain/actions";
import { type SourceControlReviewItem } from "@/lib/brand-knowledge/source-control";

function compactKind(kind: string) {
  return kind.replace(/[_-]+/g, " ");
}

/**
 * Zone 2 — "Needs your review". The single human-approval gate on the brand
 * page: Arc proposes facts from uploaded sources, the operator approves or
 * rejects. Nothing here is used by Arc until approved.
 */
export function BrandReviewQueue({
  agentName,
  items,
}: {
  agentName: string;
  items: SourceControlReviewItem[];
}) {
  const [reviewItems, setReviewItems] = useState(items);
  const [pending, startTransition] = useTransition();

  function decide(item: SourceControlReviewItem, decision: "approve" | "reject") {
    startTransition(async () => {
      const action = decision === "approve" ? approveNodeAction : rejectNodeAction;
      const result = await action(item.id);
      if (result.ok) setReviewItems((current) => current.filter((next) => next.id !== item.id));
    });
  }

  return (
    <section aria-labelledby="brand-review-heading">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-review-heading">
          Needs your review
        </h2>
        {reviewItems.length > 0 ? (
          <StatusPill tone="amber">{reviewItems.length}</StatusPill>
        ) : null}
      </div>

      {reviewItems.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] divide-y divide-[var(--border-hairline)]">
          {reviewItems.map((item) => (
            <article className="px-5 py-4" key={item.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="font-semibold capitalize text-[var(--text-secondary)]">{compactKind(item.kind)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Database aria-hidden className="h-3.5 w-3.5" />
                  From {item.sourceLabel}
                  {typeof item.confidence === "number" ? `, ${Math.round(item.confidence * 100)}%` : ""}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)]">{item.label}</h3>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
                {item.summary || item.body || "No supporting detail saved."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-5 py-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]">
              <Check aria-hidden className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)]">You&rsquo;re all caught up</div>
              <p className="mt-0.5 text-sm leading-6 text-[var(--text-secondary)]">
                When {agentName}{" "}finds new brand facts in your files, they&rsquo;ll wait here for your approval.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
