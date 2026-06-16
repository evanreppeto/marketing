"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import { riskReasons, type AssetDecision } from "./asset-meta";
import type { StudioAsset } from "./asset-library";

function channelLabel(channel?: string): string {
  const c = (channel ?? "").toLowerCase();
  if (c.includes("email")) return "Email";
  if (c.includes("sms") || c.includes("text")) return "SMS";
  if (c.includes("reel")) return "Reels";
  if (c.includes("meta") || c.includes("instagram") || c.includes("ad")) return "Ads";
  if (c.includes("print") || c.includes("pdf")) return "Print";
  return "Other";
}

/**
 * The campaign package header for the Studio Assets tab: name + link to the full
 * campaign, the audience/persona it targets, a channel breakdown, and an approval
 * progress bar. Makes the Studio read as a real deliverable, never an empty shell.
 */
export function CampaignCover({
  campaign,
  assets,
  onDecision,
}: {
  campaign?: { id: string; name: string };
  assets: StudioAsset[];
  onDecision?: (assetId: string, decision: AssetDecision) => void;
}) {
  const total = assets.length;
  const approved = assets.filter((a) => a.card.status === "approved").length;
  const declined = assets.filter((a) => a.card.status === "rejected").length;
  const needReview = total - approved - declined;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;

  // Approve-all only touches safe, undecided assets — flagged ones must be reviewed
  // individually (the risk gate), so they're intentionally left out.
  const eligible = assets.filter(
    (a) => a.card.approval && riskReasons(a.card).length === 0 && a.card.status !== "approved" && a.card.status !== "rejected",
  );
  function approveAll() {
    if (!onDecision) return;
    for (const a of eligible) if (a.card.approval) onDecision(a.card.approval.assetId, "approved");
  }

  // Audience persona(s), derived from asset rows — no faked fields.
  const personas = Array.from(
    new Set(
      assets
        .map((a) => a.card.rows.find((r) => /persona/i.test(r.name))?.meta)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  // Channel breakdown, e.g. "2 Ads · 1 Email · 1 SMS".
  const counts = new Map<string, number>();
  for (const a of assets) {
    const label = channelLabel(a.card.channel);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const breakdown = Array.from(counts.entries())
    .map(([label, n]) => `${n} ${label}`)
    .join(" · ");

  return (
    <div className="mb-3 rounded-xl bg-[var(--surface-soft)] p-3 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-strong)]" aria-hidden>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l7-3 7 3-7 3z" /><path d="M3 7v6l7 3 7-3V7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-[var(--text-primary)]">{campaign?.name ?? "Campaign package"}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{total} asset{total === 1 ? "" : "s"}{breakdown ? ` · ${breakdown}` : ""}</p>
        </div>
        {campaign ? (
          <Link
            href={`/campaigns/${campaign.id}`}
            className="shrink-0 text-[11px] font-semibold text-[var(--accent-contrast)] transition hover:underline"
          >
            Open
          </Link>
        ) : null}
      </div>

      {personas.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Audience</span>
          {personas.map((p) => (
            <span key={p} className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{p}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[var(--text-secondary)]">
            {approved} of {total} approved
          </span>
          <span className="text-[var(--text-muted)]">
            {needReview} need review{declined > 0 ? ` · ${declined} declined` : ""}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
          <div
            className={cx("h-full rounded-full transition-[width] duration-500", approved > 0 ? "bg-[var(--ok-solid)]" : "bg-transparent")}
            style={{ width: `${pct}%` }}
          />
        </div>
        {onDecision && eligible.length > 0 ? (
          <button
            type="button"
            onClick={approveAll}
            className="mt-2.5 w-full rounded-lg border border-[var(--ok-border)] bg-[var(--ok-soft)] py-1.5 text-[11px] font-bold text-[var(--ok-text)] transition hover:bg-[var(--ok-solid)] hover:text-[var(--on-ok)]"
          >
            Approve all {eligible.length} unflagged
          </button>
        ) : null}
      </div>
    </div>
  );
}
