"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";

import { cx } from "@/app/_components/theme";
import type { MentionType } from "@/domain";

/** Human label per mention type — drives the section headers in the @-menu. */
export const MENTION_TYPE_LABEL: Record<MentionType, string> = {
  lead: "Leads",
  company: "Companies",
  contact: "Contacts",
  property: "Properties",
  job: "Jobs",
  outcome: "Outcomes",
  persona: "Personas",
  campaign: "Campaigns",
  vault: "Vault notes",
};

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Line icon per mention type, so each row reads at a glance. */
export function MentionIcon({ type }: { type: MentionType }) {
  switch (type) {
    case "lead":
      return <Glyph><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2" /></Glyph>;
    case "company":
      return <Glyph><path d="M4 16V5l5-1.5V16" /><path d="M9 8.5h6V16H4" /><path d="M12 11h.01M12 13.5h.01" /></Glyph>;
    case "contact":
      return <Glyph><circle cx="10" cy="7" r="2.6" /><path d="M5 16a5 5 0 0 1 10 0" /></Glyph>;
    case "property":
      return <Glyph><path d="M4 9.5 10 5l6 4.5" /><path d="M5.5 8.8V16h9V8.8" /></Glyph>;
    case "job":
      return <Glyph><rect x="4" y="7" width="12" height="8.5" rx="1.2" /><path d="M8 7V5.5h4V7" /></Glyph>;
    case "outcome":
      return <Glyph><path d="M5.5 4v12" /><path d="M5.5 5h8l-1.6 2.5L13.5 10h-8" /></Glyph>;
    case "persona":
      return <Glyph><circle cx="7.5" cy="8" r="2.2" /><circle cx="13" cy="8.5" r="1.7" /><path d="M3.8 15a4 4 0 0 1 7.4 0" /><path d="M12 15a3.4 3.4 0 0 1 4.3-2.3" /></Glyph>;
    case "campaign":
      return <Glyph><path d="M4 8v4l9 4V4z" /><path d="M4 8H3v4h1" /></Glyph>;
    case "vault":
      return <Glyph><path d="M5 4h8l2 2v10H5z" /><path d="M8 8.5h4M8 11.5h4" /></Glyph>;
    default:
      return <Glyph><circle cx="10" cy="10" r="6" /></Glyph>;
  }
}

/** Line icon per slash command. */
export function SlashIcon({ cmd }: { cmd: string }) {
  switch (cmd) {
    case "/find-leads":
      return <Glyph><circle cx="9" cy="9" r="5" /><path d="m13 13 3 3" /></Glyph>;
    case "/opportunities":
      return <Glyph><path d="m3.5 11.5 2-6.5h9l2 6.5" /><path d="M3.5 11.5H7l1 1.5h4l1-1.5h3.5v4h-13z" /></Glyph>;
    case "/score":
      return <Glyph><path d="M4.5 14a5.5 5.5 0 1 1 11 0" /><path d="m10 14 2.5-3" /></Glyph>;
    case "/persona":
      return <Glyph><rect x="4" y="4.5" width="12" height="11" rx="2" /><circle cx="10" cy="9" r="1.9" /><path d="M6.8 14a3.4 3.4 0 0 1 6.4 0" /></Glyph>;
    case "/draft-campaign":
      return <Glyph><path d="M4 13.5V16h2.5l8-8L12 5.5z" /><path d="m11 6.5 2.5 2.5" /></Glyph>;
    case "/draft-email":
      return <Glyph><rect x="3.5" y="5" width="13" height="10" rx="1.5" /><path d="m4 6.5 6 4.5 6-4.5" /></Glyph>;
    case "/follow-up":
      return <Glyph><path d="M4 9.5h7a3.5 3.5 0 0 1 0 7H8" /><path d="m7 6.5-3 3 3 3" /></Glyph>;
    case "/assets":
      return <Glyph><rect x="3.5" y="4.5" width="13" height="11" rx="1.5" /><circle cx="7.5" cy="8" r="1.1" /><path d="m4 14 4-3.5 3 2 3-3 2 2" /></Glyph>;
    case "/performance":
      return <Glyph><path d="M4 5v11h12" /><path d="m6.5 12 2.5-2.5 2.5 1.5 3-4" /></Glyph>;
    case "/signals":
      return <Glyph><path d="M6.5 12.5a2.8 2.8 0 0 1 .4-5.5 3.6 3.6 0 0 1 6.8 1.1 2.3 2.3 0 0 1-.2 4.4" /><path d="m9.5 11-1.3 2.4h2L8.8 16" /></Glyph>;
    case "/whats-pending":
      return <Glyph><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.5" /></Glyph>;
    case "/summarize":
      return <Glyph><path d="M5 6h10M5 10h10M5 14h6" /></Glyph>;
    default:
      return <Glyph><path d="M8 4 6 16M14 4l-2 12M4 8h12M3.5 12h12" /></Glyph>;
  }
}

export type MenuRow = {
  key: string;
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Section header shown when this row's group differs from the previous row's. */
  group?: string;
};

function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border-strong)] bg-[var(--surface-inset)] px-1 py-px font-sans text-[10px] font-semibold text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

/**
 * Shared autocomplete surface for the composer's @-mention and /-command menus.
 * Renders a labelled listbox with section headers, a highlighted active row
 * (driven by keyboard nav in the composer), and a footer hint bar. The parent
 * owns `activeIndex` so arrow keys typed in the textarea move the selection.
 */
export function AutocompleteMenu({
  listId,
  rows,
  activeIndex,
  onActiveChange,
  onSelect,
}: {
  listId: string;
  rows: MenuRow[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onSelect: (index: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[24rem] max-w-full overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] shadow-[var(--elev-raised)]">
      <ul role="listbox" id={listId} className="max-h-64 overflow-y-auto p-1">
        {rows.map((r, i) => {
          const showHeader = r.group && r.group !== rows[i - 1]?.group;
          const active = i === activeIndex;
          return (
            <Fragment key={r.key}>
              {showHeader ? (
                <li aria-hidden className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {r.group}
                </li>
              ) : null}
              <li>
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  type="button"
                  onMouseMove={() => onActiveChange(i)}
                  onClick={() => onSelect(i)}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition",
                    active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-inset)]",
                  )}
                >
                  <span className={cx("shrink-0", active ? "text-[var(--accent-strong)]" : "text-[var(--text-muted)]")}>{r.icon}</span>
                  <span
                    className={cx(
                      "truncate text-[13px] font-medium",
                      r.meta ? "shrink-0" : "min-w-0 flex-1",
                      active ? "text-[var(--accent-contrast)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    {r.title}
                  </span>
                  {r.meta ? <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">{r.meta}</span> : null}
                  {r.trailing ? <span className="shrink-0">{r.trailing}</span> : null}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><KeyCap>↑↓</KeyCap> Navigate</span>
        <span className="flex items-center gap-1"><KeyCap>↵</KeyCap> Select</span>
        <span className="flex items-center gap-1"><KeyCap>esc</KeyCap> Dismiss</span>
      </div>
    </div>
  );
}
