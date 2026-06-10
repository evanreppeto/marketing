"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkActionCard, MarkActionFlag, MarkMention } from "@/domain";
import type { MarkMessage, MarkStep } from "@/lib/mark-chat/persistence";

import { decideCampaignDraftAction } from "../actions";

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

function flagClass(tone: MarkActionFlag["tone"]): string {
  if (tone === "ok") return "text-[var(--ok-text)] bg-[var(--ok-soft)]";
  if (tone === "warn") return "text-[var(--warn-text)] bg-[var(--warn-soft)]";
  return "text-[var(--priority-text)] bg-[var(--priority-soft)]";
}

function LockNote() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
      <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="9" width="10" height="7" rx="1.5" />
        <path d="M7 9V7a3 3 0 0 1 6 0v2" />
      </svg>
      outbound locked
    </span>
  );
}

/** The deliverable, rendered as a framed "page" — the thing Mark is producing,
 *  reviewable and approvable without leaving the conversation. */
function Artifact({ card }: { card: MarkActionCard }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          {card.kind === "draft" ? "Draft" : "Result"}
        </span>
        <LockNote />
      </div>

      {/* The page surface */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-[var(--surface-soft)] p-4 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
        <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-[var(--text-primary)]">
          {card.title}
        </h3>

        {card.preview ? (
          <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-secondary)]">{card.preview}</p>
        ) : null}

        {card.rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-px overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-hairline)]">
            {card.rows.map((r, i) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">{r.name}</span>
                  {r.meta ? <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{r.meta}</span> : null}
                  {r.badge ? (
                    <span className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-accent)]">{r.badge}</span>
                  ) : null}
                </>
              );
              const rowCls = "flex items-center gap-2.5 bg-[var(--surface-panel)] px-3 py-2.5";
              return r.href ? (
                <Link key={`${i}-${r.name}`} href={r.href} className={cx(rowCls, "transition hover:bg-[var(--surface-raised)]")}>
                  {inner}
                </Link>
              ) : (
                <div key={`${i}-${r.name}`} className={rowCls}>
                  {inner}
                </div>
              );
            })}
          </div>
        ) : null}

        {card.flags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {card.flags.map((f, i) => (
              <span key={`${i}-${f.label}`} className={cx("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", flagClass(f.tone))}>
                {f.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Approve in place */}
      {card.kind === "draft" && card.approval ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <form action={decideCampaignDraftAction} className="flex-1">
              <input type="hidden" name="assetId" value={card.approval.assetId} />
              <input type="hidden" name="campaignId" value={card.approval.campaignId} />
              <input type="hidden" name="decision" value="approved" />
              <button
                type="submit"
                className="w-full rounded-lg border border-[var(--ok-border)] bg-[var(--ok-solid)] py-2 text-xs font-bold text-[var(--on-ok)] transition hover:bg-[var(--ok-hover)]"
              >
                Approve
              </button>
            </form>
            <form action={decideCampaignDraftAction}>
              <input type="hidden" name="assetId" value={card.approval.assetId} />
              <input type="hidden" name="campaignId" value={card.approval.campaignId} />
              <input type="hidden" name="decision" value="declined" />
              <button
                type="submit"
                className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)]"
              >
                Decline
              </button>
            </form>
          </div>
          <Link
            href={`/campaigns/${card.approval.campaignId}`}
            className="rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
          >
            Request a revision · open full draft
          </Link>
        </div>
      ) : card.href ? (
        <Link
          href={card.href}
          className="mt-3 rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
        >
          Open full record
        </Link>
      ) : null}
    </div>
  );
}

/** While Mark drafts, mirror his progress as the artifact "forms". */
function Building({ steps }: { steps: MarkStep[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] motion-safe:animate-pulse" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--accent)]">Building</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-[var(--surface-soft)] p-4 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
        {steps.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={`${i}-${s.label}`} className="flex items-start gap-2.5 text-[13px]">
                <span
                  className={cx(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    s.status === "done" ? "bg-[var(--ok)]" : "bg-[var(--accent)] motion-safe:animate-pulse",
                  )}
                />
                <span className={s.status === "done" ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}>{s.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-2">
          <div className="mark-skel" style={{ width: "70%" }} />
          <div className="mark-skel" style={{ width: "100%" }} />
          <div className="mark-skel" style={{ width: "92%" }} />
          <div className="mark-skel" style={{ width: "60%" }} />
        </div>
      </div>
    </div>
  );
}

/** Fallback when there's no live artifact: what the thread touches. */
function Context({ messages, pendingApprovals }: { messages: MarkMessage[]; pendingApprovals: number }) {
  const seen = new Set<string>();
  const byType = new Map<string, MarkMention[]>();
  for (const m of messages) {
    for (const mention of m.mentions) {
      const key = `${mention.type}:${mention.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byType.set(mention.type, [...(byType.get(mention.type) ?? []), mention]);
    }
  }
  const hasRecords = byType.size > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {hasRecords ? (
        [...byType.entries()].map(([type, items]) => (
          <div key={type} className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{TYPE_LABELS[type] ?? type}</p>
            {items.slice(0, 6).map((m) => (
              <Link
                key={`${m.type}:${m.id}`}
                href={m.href}
                className="truncate rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
              >
                {m.label}
              </Link>
            ))}
          </div>
        ))
      ) : (
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          When Mark drafts a campaign or asset, it builds here — review and approve it without leaving the chat.
        </p>
      )}
      <div className="mt-auto border-t border-[var(--border-hairline)] pt-3">
        <Link
          href="/approvals"
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
        >
          <span>Approval queue</span>
          {pendingApprovals > 0 ? (
            <span className="rounded-full bg-[var(--warn-soft)] px-1.5 py-px text-[10px] font-semibold tabular-nums text-[var(--warn-text)]">
              {pendingApprovals}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">clear</span>
          )}
        </Link>
      </div>
    </div>
  );
}

/**
 * The Live Work Canvas: a focused right-side panel that shows Mark's deliverable
 * as it forms and lets the operator approve it in place. States, in priority:
 * building (Mark is drafting) → artifact (latest draft) → context (records).
 * Pure: derived from the message list, no extra fetches.
 */
export function WorkCanvas({ messages, pendingApprovals }: { messages: MarkMessage[]; pendingApprovals: number }) {
  const last = messages[messages.length - 1];
  const building = last?.role === "mark" && last.status === "pending";

  let draft: MarkActionCard | null = null;
  for (let i = messages.length - 1; i >= 0 && !draft; i--) {
    const acts = messages[i].actions;
    for (let j = acts.length - 1; j >= 0; j--) {
      if (acts[j].kind === "draft") {
        draft = acts[j];
        break;
      }
    }
  }

  return (
    <aside
      aria-label="Work canvas"
      className="hidden min-h-0 flex-col overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--canvas)] p-4 xl:flex"
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Work canvas</p>
      {building ? (
        <Building steps={last.steps} />
      ) : draft ? (
        <Artifact card={draft} />
      ) : (
        <Context messages={messages} pendingApprovals={pendingApprovals} />
      )}
    </aside>
  );
}
