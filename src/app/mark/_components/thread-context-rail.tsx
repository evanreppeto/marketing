"use client";

import Link from "next/link";

import { useAgentName } from "@/app/_components/agent-name-context";
import type { MarkActionCard, MarkMention } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

const TYPE_LABELS: Record<string, string> = {
  campaign: "Campaigns",
  lead: "Leads",
  company: "Companies",
  contact: "Contacts",
  property: "Properties",
  job: "Jobs",
  outcome: "Outcomes",
  persona: "Personas",
  vault: "Vault notes",
};

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</p>
      {children}
    </div>
  );
}

function RailLink({ href, label, meta }: { href: string; label: string; meta?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-[10px] uppercase text-[var(--text-muted)]">{meta}</span> : null}
    </Link>
  );
}

/** Wide-screen rail summarizing what the open thread touches: drafts/results
 *  Mark produced (action cards) and the records referenced along the way.
 *  Everything is derived from the message list — no extra fetches. */
export function ThreadContextRail({
  messages,
  pendingApprovals,
}: {
  messages: MarkMessage[];
  pendingApprovals: number;
}) {
  const agentName = useAgentName();
  const cards: MarkActionCard[] = messages.flatMap((m) => m.actions);
  const seen = new Set<string>();
  const mentions: MarkMention[] = [];
  for (const m of messages) {
    for (const mention of m.mentions) {
      const key = `${mention.type}:${mention.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push(mention);
    }
  }
  const byType = new Map<string, MarkMention[]>();
  for (const mention of mentions) {
    const list = byType.get(mention.type) ?? [];
    list.push(mention);
    byType.set(mention.type, list);
  }

  const empty = cards.length === 0 && mentions.length === 0;

  return (
    <aside
      aria-label="Thread context"
      className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l border-[var(--border-hairline)] p-4 2xl:flex"
    >
      {empty ? (
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          Drafts and records {agentName} touches in this thread will collect here.
        </p>
      ) : (
        <>
          {cards.length > 0 ? (
            <RailSection title="Working on">
              {cards.slice(-5).map((card, i) =>
                card.href ? (
                  <RailLink key={`${i}-${card.title}`} href={card.href} label={card.title} meta={card.kind} />
                ) : (
                  <p key={`${i}-${card.title}`} className="truncate px-2 py-1.5 text-sm text-[var(--text-secondary)]">
                    {card.title}
                  </p>
                ),
              )}
            </RailSection>
          ) : null}

          {[...byType.entries()].map(([type, items]) => (
            <RailSection key={type} title={TYPE_LABELS[type] ?? type}>
              {items.slice(0, 6).map((m) => (
                <RailLink key={`${m.type}:${m.id}`} href={m.href} label={m.label} />
              ))}
            </RailSection>
          ))}
        </>
      )}

      <div className="mt-auto border-t border-[var(--border-hairline)] pt-3">
        <Link
          href="/approvals"
          className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
        >
          <span>Approval queue</span>
          {pendingApprovals > 0 ? (
            <span className="rounded-full bg-[var(--priority-soft)] px-1.5 py-px text-[10px] font-semibold tabular-nums text-[var(--priority-text)]">
              {pendingApprovals}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">clear</span>
          )}
        </Link>
      </div>
    </aside>
  );
}
