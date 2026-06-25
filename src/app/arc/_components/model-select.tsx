"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import type { ArcRoute } from "@/domain";

/**
 * Arc model picker. Patterned on the ai-elements `prompt-input` model-select,
 * rebuilt on Signal tokens so it stays cohesive with the Command Charcoal
 * surface rather than the shadcn neutral palette.
 *
 * The two tiers map 1:1 onto the existing `route` contract (`fast` | `standard`)
 * — no backend change. The richer presentation (taglines + speed/depth meters +
 * the "Tuned for BSR" cue) is what surfaces our ability to shape Arc's model
 * per message, the way Claude/ChatGPT expose a model switcher in the composer.
 */

type ModelOption = {
  id: ArcRoute;
  /** Full name shown in the menu, e.g. "Arc Studio". */
  name: string;
  /** Compact label shown on the trigger chip, e.g. "Studio". */
  short: string;
  /** Plain-language "pick this when…" guidance. */
  when: string;
  /** One honest trade, wait-time included. */
  signal: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "standard",
    name: "Arc Studio",
    short: "Studio",
    when: "For work that ships — campaign packages, hero media, anything needing Arc's best reasoning.",
    signal: "Deeper · top-tier media · takes a beat",
  },
  {
    id: "fast",
    name: "Arc Swift",
    short: "Swift",
    when: "For quick passes — brainstorming, edits, fast iterations where you want an answer now.",
    signal: "Near-instant · fast media",
  },
];

/** Tier glyph: a four-point spark, the Arc model mark. */
function SparkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5c.4 3.2 1.4 4.2 4.6 4.6-3.2.4-4.2 1.4-4.6 4.6-.4-3.2-1.4-4.2-4.6-4.6 3.2-.4 4.2-1.4 4.6-4.6Z" />
      <path d="M15 12.5c.2 1.5.7 2 2.2 2.2-1.5.2-2 .7-2.2 2.2-.2-1.5-.7-2-2.2-2.2 1.5-.2 2-.7 2.2-2.2Z" />
    </svg>
  );
}

/** Studio = spark (its own mark); Swift = a bolt. */
function TierGlyph({ id, className }: { id: ArcRoute; className?: string }) {
  if (id === "fast") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2 4 11h5l-1 7 7-9h-5z" />
      </svg>
    );
  }
  return <SparkGlyph className={className} />;
}

export function ModelSelect({
  value,
  onChange,
}: {
  value: ArcRoute;
  onChange: (route: ArcRoute) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = MODEL_OPTIONS.find((o) => o.id === value) ?? MODEL_OPTIONS[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Arc model: ${current.name}`}
        title={`${current.name} — ${current.signal}`}
        className={cx(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
          open
            ? "bg-[var(--surface-inset)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
      >
        <SparkGlyph className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span className="font-semibold text-[var(--text-primary)]">Arc</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-primary)]">{current.short}</span>
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-1.5 w-72 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2">
            <SparkGlyph className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Arc model</span>
              <span className="text-[10px] leading-tight text-[var(--text-muted)]">Tuned to your brand · adjust per message</span>
            </span>
          </div>

          <div className="p-1.5">
            {MODEL_OPTIONS.map((o) => {
              const active = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition",
                    active
                      ? "bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
                      : "hover:bg-[var(--surface-inset)]",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-[rgba(216,162,74,0.22)]" : "border border-[var(--border-hairline)] bg-[var(--surface-inset)]",
                    )}
                  >
                    <TierGlyph id={o.id} className={cx("h-4 w-4", active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]")} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cx("text-sm font-semibold", active ? "text-[var(--accent-contrast)]" : "text-[var(--text-primary)]")}>
                        Arc <span style={{ fontFamily: "var(--font-serif)" }} className="font-medium italic">{o.short}</span>
                      </span>
                      {active ? (
                        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 10.5l3.5 3.5L16 5.5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="text-[11px] leading-snug text-[var(--text-muted)]">{o.when}</span>
                    <span className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                      {o.signal}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 border-t border-[var(--border-hairline)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
            <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="9" width="10" height="7" rx="1.5" />
              <path d="M7 9V7a3 3 0 0 1 6 0v2" />
            </svg>
            Outbound stays locked — Arc drafts, you approve.
          </div>
        </div>
      ) : null}
    </div>
  );
}
