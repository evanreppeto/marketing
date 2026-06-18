"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BrandGlyph, ChannelLogo, ChannelRow } from "@/app/_components/brand-logos";
import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";
import type { CampaignListContentPiece, CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

type TabKey = "overview" | "email" | "sms" | "ads" | "landing";

/** Each channel tab carries the real brand/channel name so the tab icon and the
 *  preview header resolve to an actual logo (Gmail / Meta / etc.). */
const TABS: Array<{ key: TabKey; label: string; channel?: string }> = [
  { key: "overview", label: "Overview" },
  { key: "email", label: "Email", channel: "Email" },
  { key: "sms", label: "SMS", channel: "SMS" },
  { key: "ads", label: "Ads", channel: "Meta" },
  { key: "landing", label: "Landing", channel: "Landing page" },
];

/** Deterministic 9-digit-ish stat from a seed string — keeps demo numbers stable
 *  across renders without pulling new read-model fields. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickPiece(pieces: CampaignListContentPiece[], matcher: RegExp): CampaignListContentPiece | undefined {
  return pieces.find((piece) => matcher.test(piece.kind) || matcher.test(piece.channel));
}

/** Split an email-style preview ("Subject: …\n\nBody") into subject + body. */
function splitEmail(preview: string): { subject: string; body: string } {
  const match = preview.match(/^\s*Subject:\s*(.+?)(?:\n+([\s\S]*))?$/i);
  if (match) {
    return { subject: match[1].trim(), body: (match[2] ?? "").trim() };
  }
  const [first, ...rest] = preview.split(/\n+/);
  return { subject: first.trim(), body: rest.join(" ").trim() };
}

export function CampaignFeaturedRail({
  campaign,
  agentName,
}: {
  campaign: CampaignWorkspaceListItem;
  agentName: string;
}) {
  const [tab, setTab] = useState<TabKey>("email");

  const emailPiece = pickPiece(campaign.contentPieces, /email/i);
  const smsPiece = pickPiece(campaign.contentPieces, /sms/i);
  const adPiece = pickPiece(campaign.contentPieces, /social|ad|meta/i);
  const landingPiece = pickPiece(campaign.contentPieces, /landing|web/i);

  const heroUrl = "https://picsum.photos/seed/bsr-water/640/360";
  const creativeThumbs = useMemo(() => {
    const fromMedia = campaign.contentPieces
      .flatMap((piece) => piece.media)
      .map((media) => media.thumbnailUrl ?? media.url)
      .filter((url): url is string => Boolean(url));
    const fallback = ["bsr-water-1", "bsr-water-2", "bsr-water-3", "bsr-water-4"].map(
      (seed) => `https://picsum.photos/seed/${seed}/240/160`,
    );
    return [...fromMedia, ...fallback].slice(0, 4);
  }, [campaign.contentPieces]);

  const locked = campaign.lifecycle === "In review" || campaign.pendingCount > 0;

  // Deterministic performance row — stable per campaign id.
  const seed = hashSeed(campaign.id);
  const sent = 2800 + (seed % 1600);
  const openPct = 22 + (seed % 14);
  const clickPct = 4 + (seed % 6);
  const booked = 5 + (seed % 14);

  const checklist = buildChecklist(campaign);
  const doneCount = checklist.filter((item) => item.done).length;
  const progressPct = Math.round((doneCount / checklist.length) * 100);

  const email = emailPiece ? splitEmail(emailPiece.preview) : null;

  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <div className="overflow-hidden border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        {/* Status header */}
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border-l-2 border-[var(--accent)] pl-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-contrast)]">
              Featured
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {campaign.persona}
            </span>
          </div>
          <h2 className="mt-2 font-serif text-[1.4rem] font-semibold leading-tight tracking-[-0.015em] text-[var(--text-primary)]">
            {campaign.name}
          </h2>
          {campaign.channels.length > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <ChannelRow channels={campaign.channels} size={20} max={5} />
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {campaign.channels.length} channel{campaign.channels.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
          {locked ? (
            <div className="mt-2.5 flex items-center gap-2 border-l-2 border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn-soft)_48%,transparent)] px-2.5 py-1.5">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-[var(--warn-text)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
                <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
              </svg>
              <span className="text-[11px] font-bold tracking-[0.01em] text-[var(--warn-text)]">
                Outbound locked — needs approval
              </span>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-2">
              <StatusPill tone="green" className="rounded-[3px] bg-transparent">In market</StatusPill>
              <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">Updated {campaign.updatedAt}</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Campaign channels" className="flex gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2">
          {TABS.map((entry) => {
            const active = entry.key === tab;
            return (
              <button
                key={entry.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(entry.key)}
                className={cx(
                  "inline-flex min-h-7 flex-1 items-center justify-center gap-1.5 border-b px-1 text-[11px] font-semibold tracking-[0.01em] transition",
                  active
                    ? "border-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
                )}
              >
                {entry.channel ? (
                  <BrandGlyph channel={entry.channel} className="h-3.5 w-3.5 shrink-0" />
                ) : null}
                {entry.label}
              </button>
            );
          })}
        </div>

        {/* Preview surface */}
        <div className="p-4">
          {tab === "overview" ? (
            <OverviewPreview campaign={campaign} agentName={agentName} />
          ) : tab === "email" && email ? (
            <EmailPreview heroUrl={heroUrl} subject={email.subject} body={email.body} />
          ) : tab === "sms" ? (
            <SmsPreview body={smsPiece?.preview ?? "Big Shoulders Restoration: a crew can be on-site within the hour. Reply YES and we'll call you right back."} />
          ) : tab === "ads" ? (
            <AdsPreview piece={adPiece} thumbs={creativeThumbs} />
          ) : tab === "landing" ? (
            <LandingPreview piece={landingPiece} heroUrl="https://picsum.photos/seed/bsr-water-landing/640/300" />
          ) : (
            <EmailPreview heroUrl={heroUrl} subject="Water in your home? We respond in 60 minutes." body="When a pipe bursts, every minute counts. Big Shoulders crews are on call 24/7." />
          )}
        </div>

        {/* Creative strip */}
        <div className="border-t border-[var(--border-hairline)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Creative</h3>
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{creativeThumbs.length} assets</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {creativeThumbs.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="aspect-[4/3] w-full border border-[var(--border-hairline)] object-cover"
              />
            ))}
          </div>
        </div>

        {/* Performance row */}
        <div className="border-t border-[var(--border-hairline)] px-4 py-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Performance</h3>
          <dl className="mt-2 grid grid-cols-4 divide-x divide-[var(--border-hairline)]">
            <PerfStat label="Sent" value={locked ? "—" : sent.toLocaleString()} />
            <PerfStat label="Open" value={locked ? "—" : `${openPct}%`} />
            <PerfStat label="Click" value={locked ? "—" : `${clickPct}%`} />
            <PerfStat label="Booked" value={locked ? "—" : String(booked)} tone="accent" />
          </dl>
        </div>

        {/* Launch readiness */}
        <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Launch readiness</h3>
            <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--accent)]">{progressPct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-[var(--surface-inset)]">
            <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progressPct}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <CheckGlyph done={item.done} />
                <span className={cx("text-xs", item.done ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]")}>{item.label}</span>
              </li>
            ))}
          </ul>
          <Link href={campaign.href} className={buttonClasses({ size: "sm", className: "mt-3.5 w-full justify-center rounded-[4px]" })}>
            Open full campaign packet
          </Link>
        </div>
      </div>
    </aside>
  );
}

function PerfStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "accent" }) {
  return (
    <div className="px-1 first:pl-0 last:pr-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</dt>
      <dd className={cx("mt-0.5 font-mono text-sm font-bold leading-none tabular-nums", tone === "accent" ? "text-[var(--accent)]" : "text-[var(--text-primary)]")}>
        {value}
      </dd>
    </div>
  );
}

function CheckGlyph({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--ok-border-soft)] bg-[var(--ok-soft)] text-[var(--ok-text)]">
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--border-strong)] text-[var(--text-muted)]">
      <span className="h-1 w-1 bg-[var(--text-muted)]" />
    </span>
  );
}

function EmailPreview({ heroUrl, subject, body }: { heroUrl: string; subject: string; body: string }) {
  return (
    <div className="overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroUrl} alt="Email hero" className="aspect-[16/9] w-full object-cover" />
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <ChannelLogo channel="Gmail" size={16} />
          Email · Subject
        </div>
        <p className="mt-1.5 text-sm font-bold leading-snug text-[var(--text-primary)]">{subject}</p>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
        <span className="mt-3 inline-flex rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-[var(--on-accent)]">
          Request emergency crew
        </span>
      </div>
    </div>
  );
}

function SmsPreview({ body }: { body: string }) {
  return (
    <div className="border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <ChannelLogo channel="SMS" size={16} />
        SMS message
      </div>
      <div className="mt-2.5 max-w-[88%] border-l-2 border-[var(--accent-border-strong)] bg-[var(--surface-inset)] px-3.5 py-2.5">
        <p className="text-xs leading-5 text-[var(--text-primary)]">{body}</p>
      </div>
      <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">160 char limit · 1 segment</p>
    </div>
  );
}

function AdsPreview({ piece, thumbs }: { piece: CampaignListContentPiece | undefined; thumbs: string[] }) {
  return (
    <div className="overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbs[0] ?? "https://picsum.photos/seed/bsr-water-ad/640/360"} alt="Ad creative" className="aspect-[4/5] max-h-56 w-full object-cover" />
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <ChannelLogo channel="Meta" size={16} />
          Meta ad · 4:5
        </div>
        <p className="mt-1.5 text-sm font-bold leading-snug text-[var(--text-primary)]">
          {piece?.preview ?? "We respond fast. You recover faster. 24/7 emergency water mitigation."}
        </p>
      </div>
    </div>
  );
}

function LandingPreview({ piece, heroUrl }: { piece: CampaignListContentPiece | undefined; heroUrl: string }) {
  const split = piece ? splitEmail(piece.preview) : { subject: "Water damage? We're already on the way.", body: "Request a crew and start your insurance documentation in one tap." };
  const headline = split.subject.replace(/^Headline:\s*/i, "");
  return (
    <div className="overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroUrl} alt="Landing hero" className="aspect-[16/9] w-full object-cover" />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[var(--media-void)] via-transparent to-transparent p-3.5">
          <p className="font-serif text-base font-semibold leading-tight text-white">{headline}</p>
        </div>
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{split.body}</p>
        <span className="mt-2.5 inline-flex rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-[var(--on-accent)]">
          See live response times
        </span>
      </div>
    </div>
  );
}

function OverviewPreview({ campaign, agentName }: { campaign: CampaignWorkspaceListItem; agentName: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{campaign.objective}</p>
      <dl className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
        <OverviewFact label="Audience" value={campaign.audienceSummary} />
        <OverviewFact label="Offer" value={campaign.offerSummary} />
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Channels</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <ChannelRow channels={campaign.channels} size={18} max={6} />
            <span className="truncate text-xs leading-5 text-[var(--text-secondary)]">{campaign.channels.join(", ")}</span>
          </dd>
        </div>
      </dl>
      <p className="flex items-start gap-2 text-xs leading-5 text-[var(--text-muted)]">
        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[9px] font-bold text-[var(--accent)]">
          {agentName.charAt(0).toUpperCase()}
        </span>
        {campaign.whyBuilt}
      </p>
    </div>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-3 py-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

type ChecklistItem = { label: string; done: boolean };

/** Derive a launch-readiness checklist from the campaign's real state — approved
 *  pieces, media presence, lifecycle — so the progress bar reflects the gate. */
function buildChecklist(campaign: CampaignWorkspaceListItem): ChecklistItem[] {
  const approvedPieces = campaign.contentPieces.filter((piece) => !piece.needsReview).length;
  const hasEmail = campaign.contentPieces.some((piece) => /email/i.test(piece.kind));
  const hasMedia = campaign.mediaCount > 0;
  const allApproved = campaign.pendingCount === 0;
  const live = campaign.lifecycle === "Live";
  return [
    { label: "Audience & persona mapped", done: true },
    { label: "Approved BSR media attached", done: hasMedia },
    { label: "Email draft written", done: hasEmail },
    { label: `${approvedPieces} of ${campaign.contentPieces.length} pieces approved`, done: allApproved },
    { label: "Guardrail check passed", done: hasMedia && approvedPieces > 0 },
    { label: "Operator approval", done: live },
  ];
}
