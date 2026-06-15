"use client";

import Link from "next/link";
import { useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { formatWaitTime } from "./format-wait-time";

/** The collapsed fold for internal CRM-population batches. `items` are already
 *  sorted longest-waiting first by the caller. */
export function CollapsedBatchGroup({ items, nowMs }: { items: CampaignWorkspaceListItem[]; nowMs: number }) {
  const agentName = useAgentName();
  const [open, setOpen] = useState(false);
  const oldest = items[0]; // caller sorts longest-waiting first
  const oldestWait = oldest ? formatWaitTime(oldest.updatedAtIso, nowMs) : "";

  return (
    <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
        <span className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">CRM Population — {items.length} batches</span>
          <span className="text-[var(--text-muted)]"> · enrich {items.length} records from {agentName}&apos;s discovery crawl</span>
          {oldestWait ? <span className="text-[var(--accent)]"> · oldest waiting {oldestWait}</span> : null}
        </span>
        <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{open ? "Collapse ▴" : "Expand ▾"}</span>
      </button>

      {open ? (
        <ul className="flex flex-col gap-1.5 border-t border-[var(--border-hairline)] px-3 py-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 rounded-lg border border-[var(--border-panel)] bg-[var(--surface-inset)] px-3 py-2.5 transition hover:border-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                    {item.persona} · {item.assetCount} asset{item.assetCount === 1 ? "" : "s"} · waiting {formatWaitTime(item.updatedAtIso, nowMs)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--text-primary)]">
                  Review
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
