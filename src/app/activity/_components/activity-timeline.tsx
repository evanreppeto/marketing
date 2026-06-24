"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChannelLogo } from "@/app/_components/brand-logos";
import { StatusPill } from "@/app/_components/page-header";
import { cx, theme } from "@/app/_components/theme";
import type {
  ActivityActorType,
  ActivityEntry,
  ActivityTone,
} from "@/lib/activity/read-model";

/**
 * Premium, client-filtered activity timeline. The server fetches and merges the
 * real audit trail; this component renders it as a continuous left-rail timeline
 * (connector line through event dots), groups by day with sticky day labels, and
 * exposes quick filter pills that filter in place — no navigation, no refetch.
 *
 * Display-only: nothing here triggers an outbound action.
 */

type QuickFilter = {
  key: string;
  label: string;
  match: (entry: ActivityEntry) => boolean;
};

const QUICK_FILTERS: QuickFilter[] = [
  { key: "all", label: "All", match: () => true },
  { key: "needs-review", label: "Needs review", match: (e) => e.insightLabel === "Needs review" || e.tone === "amber" },
  { key: "arc", label: "Arc", match: (e) => e.actorType === "arc" || e.actorType === "sub_agent" },
  { key: "humans", label: "People", match: (e) => e.actorType === "human" },
  { key: "campaign", label: "Campaigns", match: (e) => e.category === "campaign" },
  { key: "crm", label: "CRM", match: (e) => e.category === "crm" },
  { key: "asset", label: "Assets", match: (e) => e.category === "asset" },
  { key: "risk", label: "Risk", match: (e) => e.category === "risk" || e.tone === "red" },
];

/** Channel keywords we can resolve to a real brand/channel logo on an entry. */
const CHANNEL_HINTS: Array<{ re: RegExp; channel: string }> = [
  { re: /\bsms\b|\btext\b/i, channel: "SMS" },
  { re: /e-?mail|newsletter|gmail/i, channel: "Gmail" },
  { re: /instagram|\big\b/i, channel: "Instagram" },
  { re: /meta|facebook|paid social|\bad\b|\bads\b/i, channel: "Meta" },
  { re: /whatsapp/i, channel: "WhatsApp" },
  { re: /linkedin/i, channel: "LinkedIn" },
  { re: /tiktok/i, channel: "TikTok" },
  { re: /landing|one-?pager|web\b|site/i, channel: "Landing page" },
];

function channelForEntry(entry: ActivityEntry): string | null {
  const haystack = `${entry.title} ${entry.detail} ${entry.relatedLabel ?? ""}`;
  for (const hint of CHANNEL_HINTS) {
    if (hint.re.test(haystack)) return hint.channel;
  }
  return null;
}

export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const filter of QUICK_FILTERS) {
      map[filter.key] = entries.filter(filter.match).length;
    }
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    const activeFilter = QUICK_FILTERS.find((f) => f.key === active) ?? QUICK_FILTERS[0];
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!activeFilter.match(entry)) return false;
      if (!needle) return true;
      const haystack = [entry.title, entry.detail, entry.actor, entry.relatedLabel ?? "", entry.insightLabel ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, active, query]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <style>{TIMELINE_KEYFRAMES}</style>

      {/* Filter + search header */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3" role="tablist" aria-label="Filter activity">
          {QUICK_FILTERS.map((filter) => {
            const isActive = filter.key === active;
            const count = counts[filter.key] ?? 0;
            return (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(filter.key)}
                className={cx(
                  "relative inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] font-semibold transition duration-150 active:translate-y-px",
                  isActive
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {filter.label}
                <span
                  className={cx(
                    "font-mono text-[10.5px] tabular-nums",
                    isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
                  )}
                >
                  {count}
                </span>
                {isActive ? <span aria-hidden className={theme.control.tabMarker} /> : null}
              </button>
            );
          })}
        </div>

        <div className="relative shrink-0">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m11 11 3 3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter this view"
            aria-label="Filter activity"
            className="min-h-8 w-full min-w-[200px] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] pl-8 pr-3 text-[12.5px] text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] lg:w-56"
          />
        </div>
      </div>

      {groups.length > 0 ? (
        groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            {/* Sticky day label */}
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border-hairline)] bg-[color-mix(in_oklab,var(--surface-panel)_92%,transparent)] px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[10.5px] font-medium text-[var(--text-secondary)]">
                {group.label}
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">{group.entries.length}</span>
              <span aria-hidden className="h-px flex-1 bg-[var(--border-hairline)]" />
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">{group.dateLabel}</span>
            </div>

            {/* Timeline rail */}
            <ol className="relative px-4 py-1.5">
              {/* Continuous connector line */}
              <span
                aria-hidden
                className="absolute bottom-4 left-[1.72rem] top-4 w-px bg-[var(--border-hairline)]"
              />
              {group.entries.map((entry, index) => (
                <TimelineRow key={entry.id} entry={entry} index={index} />
              ))}
            </ol>
          </section>
        ))
      ) : (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">No activity matches this view</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">Clear the filter or search to see everything.</p>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ entry, index }: { entry: ActivityEntry; index: number }) {
  const channel = channelForEntry(entry);
  const body = (
    <div
      className="group relative flex items-start gap-3 rounded-lg px-2 py-2 transition-[background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface-inset)]"
      style={{ animation: "activity-row-in 240ms ease-out both", animationDelay: `${Math.min(index, 14) * 22}ms` }}
    >
      {/* Dot on the connector */}
      <span className="relative z-10 mt-0.5 grid place-items-center">
        <ToneDot tone={entry.tone} />
      </span>

      {/* Actor avatar */}
      <ActorAvatar actorType={entry.actorType} actor={entry.actor} />

      {/* Copy */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold leading-5 text-[var(--text-primary)]">
            {entry.title}
          </span>
          {entry.relatedLabel ? (
            <span className="hidden shrink-0 items-center gap-1 truncate text-[11px] font-medium text-[var(--accent)] sm:inline-flex">
              {entry.relatedLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-4 text-[var(--text-secondary)]">
          {channel ? <ChannelLogo channel={channel} size={14} className="shrink-0" /> : null}
          <span className="truncate">{entry.detail}</span>
        </p>
      </div>

      {/* Right meta: insight pill + actor + mono time */}
      <div className="flex shrink-0 items-center gap-2.5">
        {entry.insightLabel ? (
          <span className="hidden md:inline">
            <StatusPill tone={pillTone(entry.tone)}>{entry.insightLabel}</StatusPill>
          </span>
        ) : null}
        <span className="hidden w-20 truncate text-right text-[11px] font-medium text-[var(--text-muted)] lg:inline">
          {entry.actor}
        </span>
        <time
          dateTime={entry.occurredAt}
          className="w-12 shrink-0 text-right font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-secondary)]"
        >
          {formatTime(entry.occurredAt)}
        </time>
      </div>
    </div>
  );

  return <li>{entry.href ? <Link href={entry.href}>{body}</Link> : body}</li>;
}

function ActorAvatar({ actorType, actor }: { actorType: ActivityActorType; actor: string }) {
  if (actorType === "arc" || actorType === "sub_agent") {
    return (
      <span
        aria-hidden
        title={actor}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-extrabold text-[var(--on-accent)] shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        style={{ background: "radial-gradient(circle at 32% 28%, var(--accent-strong), var(--accent) 72%)" }}
      >
        {actorType === "sub_agent" ? "a" : "A"}
      </span>
    );
  }
  if (actorType === "human") {
    return (
      <span
        aria-hidden
        title={actor}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-[9px] font-extrabold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--border-panel)]"
      >
        {initials(actor)}
      </span>
    );
  }
  const glyphColor = actorType === "integration" ? "var(--accent)" : "var(--text-muted)";
  return (
    <span
      aria-hidden
      title={actor}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--border-panel)] [&>svg]:h-3 [&>svg]:w-3"
      style={{ color: glyphColor, background: "var(--surface-soft)" }}
    >
      {actorType === "integration" ? <PlugGlyph /> : <GearGlyph />}
    </span>
  );
}

function ToneDot({ tone }: { tone: ActivityTone }) {
  const color = toneColor(tone);
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface-panel)]"
      style={{ background: color, boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 55%, transparent)` }}
    />
  );
}

function toneColor(tone: ActivityTone): string {
  if (tone === "red") return "var(--priority)";
  if (tone === "amber") return "var(--warn)";
  if (tone === "green") return "var(--ok)";
  if (tone === "blue") return "var(--accent)";
  return "var(--text-muted)";
}

function pillTone(tone: ActivityTone) {
  if (tone === "red") return "red" as const;
  if (tone === "amber") return "amber" as const;
  if (tone === "green") return "green" as const;
  if (tone === "blue") return "blue" as const;
  return "gray" as const;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type DayGroup = { label: string; dateLabel: string; entries: ActivityEntry[] };

function groupByDay(entries: ActivityEntry[], now = new Date()): DayGroup[] {
  const order: string[] = [];
  const map = new Map<string, DayGroup>();

  for (const entry of entries) {
    const { label, dateLabel } = dayLabels(entry.occurredAt, now);
    if (!map.has(label)) {
      map.set(label, { label, dateLabel, entries: [] });
      order.push(label);
    }
    map.get(label)!.entries.push(entry);
  }

  return order.map((label) => map.get(label)!);
}

function dayLabels(occurredAt: string, now: Date): { label: string; dateLabel: string } {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return { label: "Unknown date", dateLabel: "" };

  const day = localDayStart(date);
  const today = localDayStart(now);
  const diffDays = Math.round((today - day) / 86_400_000);

  const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  if (diffDays === 0) return { label: "Today", dateLabel };
  if (diffDays === 1) return { label: "Yesterday", dateLabel };
  return {
    label: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
    dateLabel,
  };
}

function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function PlugGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.6v3M10 2.6v3M4.4 5.6h7.2v2a3.6 3.6 0 0 1-7.2 0v-2ZM8 11.2v2.2" />
    </svg>
  );
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
    </svg>
  );
}

// Transform-only entrance: content is never gated on opacity, so a throttled /
// backgrounded tab (which can freeze a `both`-filled animation on its `from`
// frame) can't leave rows invisible. The slide is pure enhancement.
const TIMELINE_KEYFRAMES = `@keyframes activity-row-in{from{transform:translateY(5px)}to{transform:none}}@media (prefers-reduced-motion: reduce){[style*="activity-row-in"]{animation:none !important}}`;
