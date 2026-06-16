"use client";

import { useState } from "react";

import { cx } from "@/app/_components/theme";
import type { ArcToolCall } from "@/lib/arc-chat/persistence";

/**
 * Tool-call traces — the structured tool runs Arc executed for a reply
 * (find_leads, score_lead, weather_lookup, …). Modeled on the ai-elements
 * `tool` component but rebuilt on Signal tokens and the chat's own typography so
 * it reads like prose, not a code dump. Renders nothing when Arc hasn't reported
 * any tools.
 */

/** snake_case / camelCase → "Sentence case". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanizeKey(k)} ${formatValue(v)}`)
      .join(", ");
  }
  return String(value);
}

/**
 * Render a tool's input as a readable line. If the runner sent JSON, surface it
 * as "Key: value · Key: value" instead of raw braces; otherwise pass prose
 * straight through.
 */
function humanizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const parts = Object.entries(obj as Record<string, unknown>).map(
          ([k, v]) => `${humanizeKey(k)}: ${formatValue(v)}`,
        );
        if (parts.length > 0) return parts.join(" · ");
      }
    } catch {
      /* not JSON — fall through to the raw string */
    }
  }
  return raw;
}

function StatusBadge({ status }: { status: ArcToolCall["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--warn-text)]">
        <svg viewBox="0 0 24 24" className="h-3 w-3 motion-safe:animate-spin" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Running
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--priority-text)]">
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l8 8M14 6l-8 8" />
        </svg>
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ok-text)]">
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5l3.5 3.5L16 5.5" />
      </svg>
      Done
    </span>
  );
}

function IoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)]">
      <div className="border-b border-[var(--border-hairline)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </div>
      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs leading-6 text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}

function ToolCallCard({ tool, defaultOpen }: { tool: ArcToolCall; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasDetail = Boolean(tool.input || tool.output);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        className={cx(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition",
          hasDetail ? "hover:bg-[var(--surface-inset)]" : "cursor-default",
        )}
      >
        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 4H5a1 1 0 0 0-1 1v3M12 4h3a1 1 0 0 1 1 1v3M8 16H5a1 1 0 0 1-1-1v-3M12 16h3a1 1 0 0 0 1-1v-3" />
          <circle cx="10" cy="10" r="2" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{humanizeKey(tool.name)}</span>
        <StatusBadge status={tool.status} />
        {hasDetail ? (
          <svg viewBox="0 0 20 20" aria-hidden className={cx("h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform", open ? "rotate-180" : "")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 8 4 4 4-4" />
          </svg>
        ) : null}
      </button>
      {open && hasDetail ? (
        <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] p-2.5">
          {tool.input ? <IoBlock label="Input" value={humanizeInput(tool.input)} /> : null}
          {tool.output ? <IoBlock label="Output" value={tool.output} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ToolTraces({ tools }: { tools: ArcToolCall[] }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5" aria-label="Tools Arc ran">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Tools Arc ran · {tools.length}
      </p>
      {tools.map((tool, i) => (
        <ToolCallCard key={`${i}-${tool.name}`} tool={tool} defaultOpen={tool.status === "running"} />
      ))}
    </div>
  );
}
