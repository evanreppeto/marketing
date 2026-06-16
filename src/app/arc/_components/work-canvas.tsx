"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { ArcActionCard, ArcActionFlag, ArcMedia, ArcMention } from "@/domain";
import type { ArcMessage, ArcStep } from "@/lib/arc-chat/persistence";

import { decideCampaignDraftAction } from "../actions";
import { ArtifactImage } from "./artifact-image";
import { MediaProvenance, StatusPill, riskReasons, type AssetDecision } from "./asset-meta";
import { AssetLibrary, collectAssets, type StudioAsset } from "./asset-library";
import { AudiencePanel, collectAudienceMentions } from "./audience-panel";
import { CampaignCover } from "./campaign-cover";
import { ChannelArtifact } from "./channel-artifact";

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

function flagClass(tone: ArcActionFlag["tone"]): string {
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

/** The deliverable, rendered as a framed "page" — the thing Arc is producing,
 *  reviewable and approvable without leaving the conversation. */
function Artifact({ card, image, onDecision }: { card: ArcActionCard; image?: ArcMedia; onDecision?: (assetId: string, decision: AssetDecision) => void }) {
  const approval = card.approval;
  const approved = card.status === "approved";
  const rejected = card.status === "rejected";
  const revision = card.status === "revision";
  const decided = approved || rejected || revision;
  const reasons = riskReasons(card);
  const [ack, setAck] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          {card.kind === "draft" ? "Draft" : "Result"}
        </span>
        {card.status ? <StatusPill status={card.status} /> : null}
        <LockNote />
      </div>

      {/* The page surface */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-[var(--surface-soft)] p-4 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
        {image ? <div className="mb-3"><ArtifactImage image={image} /><MediaProvenance media={image} className="mt-2" /></div> : null}
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

      {/* Review in place — approve / decline / request revision; flagged assets gate on ack. */}
      {card.kind === "draft" && approval ? (
        <div className="mt-3 flex flex-col gap-2">
          {decided ? (
            <div
              className={cx(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold",
                approved ? "bg-[var(--ok-soft)] text-[var(--ok-text)]" : revision ? "bg-[var(--warn-soft)] text-[var(--warn-text)]" : "bg-[var(--surface-inset)] text-[var(--text-muted)]",
              )}
            >
              {approved ? (
                <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
              ) : null}
              {approved ? "Approved" : revision ? "Revision requested" : "Declined"}
            </div>
          ) : (
            <>
              {reasons.length > 0 ? (
                <label className="flex items-start gap-2 rounded-lg bg-[var(--priority-soft)] p-2.5 text-[11px] leading-snug text-[var(--priority-text)]">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[var(--priority-bright)]" />
                  <span>
                    <span className="font-bold">Risk: {reasons.join(", ")}.</span> I&apos;ve reviewed these before approving.
                  </span>
                </label>
              ) : null}
              <div className="flex items-center gap-2">
                {onDecision ? (
                  <button
                    type="button"
                    disabled={reasons.length > 0 && !ack}
                    onClick={() => onDecision(approval.assetId, "approved")}
                    className="flex-1 rounded-lg border border-[var(--ok-border)] bg-[var(--ok-solid)] py-2 text-xs font-bold text-[var(--on-ok)] transition enabled:hover:bg-[var(--ok-hover)] disabled:opacity-40"
                  >
                    Approve
                  </button>
                ) : (
                  <form action={decideCampaignDraftAction} className="flex-1">
                    <input type="hidden" name="assetId" value={approval.assetId} />
                    <input type="hidden" name="campaignId" value={approval.campaignId} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" disabled={reasons.length > 0 && !ack} className="w-full rounded-lg border border-[var(--ok-border)] bg-[var(--ok-solid)] py-2 text-xs font-bold text-[var(--on-ok)] transition enabled:hover:bg-[var(--ok-hover)] disabled:opacity-40">
                      Approve
                    </button>
                  </form>
                )}
                {onDecision ? (
                  <button
                    type="button"
                    onClick={() => onDecision(approval.assetId, "declined")}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)]"
                  >
                    Decline
                  </button>
                ) : (
                  <form action={decideCampaignDraftAction}>
                    <input type="hidden" name="assetId" value={approval.assetId} />
                    <input type="hidden" name="campaignId" value={approval.campaignId} />
                    <input type="hidden" name="decision" value="declined" />
                    <button type="submit" className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)]">
                      Decline
                    </button>
                  </form>
                )}
              </div>
              {onDecision ? (
                <button
                  type="button"
                  onClick={() => onDecision(approval.assetId, "revision")}
                  className="rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
                >
                  Request a revision
                </button>
              ) : (
                <Link
                  href={`/campaigns/${approval.campaignId}`}
                  className="rounded-lg py-2 text-center text-xs font-semibold text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]"
                >
                  Request a revision · open full draft
                </Link>
              )}
            </>
          )}
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

/** While Arc drafts, mirror his progress as the artifact "forms". */
function Building({ steps }: { steps: ArcStep[] }) {
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
          <div className="arc-skel" style={{ width: "70%" }} />
          <div className="arc-skel" style={{ width: "100%" }} />
          <div className="arc-skel" style={{ width: "92%" }} />
          <div className="arc-skel" style={{ width: "60%" }} />
        </div>
        <div className="arc-progress mt-4"><span /></div>
      </div>
    </div>
  );
}

/** Fallback when there's no live artifact: what the thread touches. */
function Context({ assistantName, messages }: { assistantName: string; messages: ArcMessage[] }) {
  const seen = new Set<string>();
  const byType = new Map<string, ArcMention[]>();
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
          When {assistantName} drafts a campaign or asset, it builds here - review and approve it without leaving the chat.
        </p>
      )}
    </div>
  );
}

/** The asset's full review surface: editable when the backend draft is reachable,
 *  otherwise (preview / unmigrated) the read-only artifact — never a dead end. */
function AssetDetail({ asset, onDecision }: { asset: StudioAsset; onDecision?: (assetId: string, decision: AssetDecision) => void }) {
  const { card, media } = asset;
  if (card.approval) {
    return <ChannelArtifact approval={card.approval} image={media} fallback={<Artifact card={card} image={media} onDecision={onDecision} />} />;
  }
  return <Artifact card={card} image={media} onDecision={onDecision} />;
}

type StudioTab = "now" | "assets" | "audience";

function StudioTabs({
  tab,
  assetCount,
  audienceCount,
  onTab,
}: {
  tab: StudioTab;
  assetCount: number;
  audienceCount: number;
  onTab: (t: StudioTab) => void;
}) {
  const item = (t: StudioTab, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => onTab(t)}
      className={cx(
        "rounded-md px-2.5 py-1 transition",
        tab === t
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-hairline)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
      {typeof count === "number" ? <span className="ml-1 text-[var(--text-muted)]">{count}</span> : null}
    </button>
  );
  return (
    <div className="inline-flex rounded-lg bg-[var(--surface-inset)] p-0.5 text-[11px] font-semibold">
      {item("now", "Now")}
      {item("assets", "Assets", assetCount)}
      {item("audience", "Audience", audienceCount)}
    </div>
  );
}

/**
 * The Studio: the persistent right-side workspace for everything Arc generates
 * in a thread. Two tabs — "Now" (what Arc is building / the latest deliverable)
 * and "Assets" (a filterable library of every asset + media, click → review &
 * approve in place). Pure: derived from the message list, no extra fetches.
 */
export function WorkCanvas({
  messages,
  projectMessages = [],
  currentConversationId,
  conversationTitles,
  variant = "docked",
  open = true,
  focus,
  campaign,
  assistantName = "Arc",
  onDecision,
}: {
  messages: ArcMessage[];
  /** Asset-bearing messages from sibling chats in the project (Assets tab only). */
  projectMessages?: ArcMessage[];
  /** The active chat id — tiles from other chats get a source chip. */
  currentConversationId?: string;
  /** id -> chat title, for the cross-chat source chip. */
  conversationTitles?: Record<string, string>;
  /** "docked" = the third grid column (xl+); "drawer" = inside the slide-over shell. */
  variant?: "docked" | "drawer";
  /** Docked-only: whether the column is expanded. Ignored for the drawer. */
  open?: boolean;
  /** Chat asked to focus a specific asset (bumped `seq` re-triggers). */
  focus?: { assetId: string; seq: number } | null;
  /** The campaign this thread is producing (shown as the Assets-tab cover). */
  campaign?: { id: string; name: string };
  assistantName?: string;
  /** Preview-mode optimistic review (real mode uses the server forms). */
  onDecision?: (assetId: string, decision: AssetDecision) => void;
}) {
  const last = messages[messages.length - 1];
  const building = last?.role === "arc" && last.status === "pending";

  // Assets tab is project-wide: current chat first (so it wins dedup), then siblings.
  const assets = useMemo(
    () => collectAssets([...messages, ...projectMessages]),
    [messages, projectMessages],
  );
  // Current-chat assets only — drives the Now tab and Audience, which stay chat-scoped.
  const currentAssets = useMemo(() => collectAssets(messages), [messages]);
  const audienceCount = useMemo(() => collectAudienceMentions(messages).length, [messages]);
  const [tab, setTab] = useState<StudioTab>(() => (assets.length > 1 ? "assets" : "now"));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // When the chat clicks "open in Studio", jump to Assets and select that asset.
  useEffect(() => {
    if (!focus) return;
    void Promise.resolve().then(() => {
      setTab("assets");
      setSelectedId(focus.assetId);
    });
  }, [focus]);

  const selected = selectedId ? assets.find((a) => a.id === selectedId) ?? null : null;
  const latestDraft = [...currentAssets].reverse().find((a) => a.card.kind === "draft");
  const showTabs = !building && assets.length > 0;

  function chooseTab(t: StudioTab) {
    setTab(t);
    setSelectedId(null);
  }

  let content: React.ReactNode;
  if (building) {
    content = <Building steps={last.steps} />;
  } else if (tab === "assets") {
    content = selected ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="mb-2 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l-5 5 5 5" /></svg>
          All assets
        </button>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AssetDetail asset={selected} onDecision={onDecision} />
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        <CampaignCover campaign={campaign} assets={assets} onDecision={onDecision} />
        <AssetLibrary
            assets={assets}
            onSelect={setSelectedId}
            currentConversationId={currentConversationId}
            conversationTitles={conversationTitles}
          />
      </div>
    );
  } else if (tab === "audience") {
    content = <AudiencePanel messages={messages} assets={currentAssets} />;
  } else {
    content = latestDraft ? (
      <AssetDetail asset={latestDraft} onDecision={onDecision} />
    ) : (
      <Context assistantName={assistantName} messages={messages} />
    );
  }

  const body = (
    <>
      <div className="mb-3 flex items-center gap-2">
        {variant === "docked" ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Studio</span>
        ) : null}
        {showTabs ? (
          <span className="ml-auto">
            <StudioTabs tab={tab} assetCount={assets.length} audienceCount={audienceCount} onTab={chooseTab} />
          </span>
        ) : null}
      </div>
      {content}
    </>
  );

  if (variant === "drawer") {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--canvas)] p-4">{body}</div>;
  }

  return (
    <aside
      aria-label="Studio"
      className={cx(
        "hidden min-h-0 flex-col overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--canvas)] p-4",
        open && "xl:flex",
      )}
    >
      {body}
    </aside>
  );
}
