"use client";

import { useState } from "react";
import Link from "next/link";

import type { SavedItem } from "@/lib/mark-chat/saved";
import { unsaveMarkItemAction } from "../../actions";
import { PromoteDialog } from "./promote-dialog";

const KIND_LABEL: Record<SavedItem["kind"], string> = { media: "Media", draft: "Drafts", angle: "Angles" };

export function SavedList({ items, campaigns }: { items: SavedItem[]; campaigns: { id: string; name: string }[] }) {
  const [promoting, setPromoting] = useState<SavedItem | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !hidden.has(i.id));
  const groups = (["media", "draft", "angle"] as const)
    .map((k) => ({ k, rows: visible.filter((i) => i.kind === k) }))
    .filter((g) => g.rows.length);

  async function remove(id: string) {
    setHidden((prev) => new Set(prev).add(id));
    await unsaveMarkItemAction(id);
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.k}>
          <p className="signal-eyebrow mb-2">{KIND_LABEL[g.k]}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.rows.map((item) => (
              <div key={item.id} className="signal-panel flex flex-col gap-2 p-3">
                {item.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config
                  <img src={item.mediaUrl} alt={item.caption ?? item.title ?? "Saved media"} className="h-32 w-full rounded-lg object-cover" />
                ) : null}
                {item.title ? <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p> : null}
                {item.body ? <p className="line-clamp-3 text-xs text-[var(--text-secondary)]">{item.body}</p> : null}
                <div className="mt-1 flex items-center gap-2">
                  {item.promotedCampaignId ? (
                    <Link href={`/campaigns/${item.promotedCampaignId}`} className="text-xs font-semibold text-[var(--ok-text)]">
                      Promoted ▸
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPromoting(item)}
                      className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)]"
                    >
                      Promote
                    </button>
                  )}
                  {item.sourceConversationId ? (
                    <Link
                      href={`/mark?c=${item.sourceConversationId}`}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
                    >
                      Continue in chat
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="ml-auto rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--priority-bright)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {promoting ? <PromoteDialog item={promoting} campaigns={campaigns} onClose={() => setPromoting(null)} /> : null}
    </div>
  );
}
