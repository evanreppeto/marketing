"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { MarkAvatar } from "@/app/mark/_components/mark-avatar";
import { priorityIcon, statusIcon } from "@/app/_components/ticket-icons";
import { formatScheduleLabel, resolveScheduledFor, type SchedulePreset } from "@/domain";

import { createTaskAction } from "./actions";
import { badgeStyle, priorityAppearance, statusAppearance } from "./task-visuals";
import { buttonClasses } from "../_components/page-header";

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "needs_approval", label: "Needs review" },
  { value: "blocked", label: "Blocked" },
] as const;

const WHEN_OPTIONS: ReadonlyArray<{ value: SchedulePreset; label: string }> = [
  { value: "now", label: "Now" },
  { value: "few_hours", label: "In a few hours" },
  { value: "tomorrow_am", label: "Tomorrow morning" },
  { value: "weekend", label: "This weekend" },
  { value: "custom", label: "Pick date & time…" },
];

type MenuKey = "status" | "priority" | "when" | null;

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("queued");
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]["value"]>("medium");
  const [whenPreset, setWhenPreset] = useState<SchedulePreset>("now");
  const [customIso, setCustomIso] = useState("");
  const [isMac] = useState(() => typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));

  function openDialog(mode: "task" | "schedule") {
    setOpen(true);
    setMenu(mode === "schedule" ? "when" : null);
  }

  function closeDialog() {
    setOpen(false);
    setMenu(null);
  }

  // Esc closes the open menu first, then the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu((current) => {
        if (current) return null;
        setOpen(false);
        return null;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // "C" opens a new task (Linear-style), unless the user is typing in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (open) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "c" && event.key !== "C") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      event.preventDefault();
      openDialog("task");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Show the right modifier glyph for the platform (⌘ on Mac, Ctrl elsewhere).
  const modKey = isMac ? "⌘" : "Ctrl";

  const statusOption = STATUS_OPTIONS.find((option) => option.value === status)!;
  const priorityOption = PRIORITY_OPTIONS.find((option) => option.value === priority)!;
  const statusVisual = statusAppearance(statusOption.value);
  const priorityVisual = priorityAppearance(priorityOption.value);
  const scheduledForValue =
    whenPreset === "now" ? "" : resolveScheduledFor(whenPreset, new Date(), customIso || null) ?? "";
  const whenLabel =
    whenPreset === "custom"
      ? scheduledForValue
        ? formatScheduleLabel(scheduledForValue, new Date())
        : "Pick a time…"
      : WHEN_OPTIONS.find((option) => option.value === whenPreset)!.label;

  return (
    <>
      <button
        className={buttonClasses({ variant: "ghost", size: "sm", className: "gap-1.5" })}
        onClick={() => openDialog("schedule")}
        type="button"
      >
        <CalendarIcon />
        Schedule
      </button>
      <button
        className={buttonClasses({ variant: "primary", size: "sm", className: "gap-1.5" })}
        onClick={() => openDialog("task")}
        type="button"
      >
        <PlusIcon />
        New task
        <kbd className="ml-1 hidden rounded border border-[var(--on-accent)]/30 px-1 text-[10px] font-bold leading-4 opacity-80 sm:inline">
          C
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--overlay)] p-4 pt-[12vh]"
          onClick={closeDialog}
        >
          <form
            action={createTaskAction}
            className="w-full max-w-lg rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]"
            onClick={(event) => event.stopPropagation()}
          >
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="priority" value={priority} />
            <input type="hidden" name="scheduledFor" value={scheduledForValue} />

            <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-5 py-4">
              <MarkAvatar size={28} />
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">New ticket</h2>
                <p className="text-xs text-[var(--text-muted)]">Assign status, priority, and timing before Mark picks it up.</p>
              </div>
            </div>

            <div className="px-5 py-4">
              <label className="block text-[13px] font-semibold text-[var(--text-secondary)]">
                What should Mark work on?
                <textarea
                  autoFocus
                  name="objective"
                  required
                  placeholder="Find plumbing partners in 606xx ZIPs and prepare approval-ready recommendations…"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
                  }}
                  className="mt-1.5 h-28 w-full resize-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--accent-border)] focus-visible:outline-none"
                />
              </label>

              <div className="relative mt-3 flex flex-wrap items-center gap-2">
                <PillButton active={menu === "status"} onClick={() => setMenu(menu === "status" ? null : "status")} style={badgeStyle(statusVisual)}>
                  <IconSlot>{statusIcon(statusOption.value)}</IconSlot>
                  {statusVisual.label}
                  <Chevron />
                </PillButton>
                <PillButton active={menu === "priority"} onClick={() => setMenu(menu === "priority" ? null : "priority")} style={badgeStyle(priorityVisual)}>
                  <IconSlot>{priorityIcon(priorityOption.value)}</IconSlot>
                  {priorityVisual.label}
                  <Chevron />
                </PillButton>
                <PillButton active={menu === "when"} onClick={() => setMenu(menu === "when" ? null : "when")}>
                  <CalendarIcon />
                  {whenLabel}
                  <Chevron />
                </PillButton>

                {menu ? <div className="fixed inset-0 z-[1]" onClick={() => setMenu(null)} /> : null}

                {menu === "status" ? (
                  <Menu>
                    {STATUS_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        selected={option.value === status}
                        style={option.value === status ? badgeStyle(statusAppearance(option.value)) : undefined}
                        onClick={() => {
                          setStatus(option.value);
                          setMenu(null);
                        }}
                      >
                        <IconSlot>{statusIcon(option.value)}</IconSlot>
                        {statusAppearance(option.value).label}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null}

                {menu === "priority" ? (
                  <Menu>
                    {PRIORITY_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        selected={option.value === priority}
                        style={option.value === priority ? badgeStyle(priorityAppearance(option.value)) : undefined}
                        onClick={() => {
                          setPriority(option.value);
                          setMenu(null);
                        }}
                      >
                        <IconSlot>{priorityIcon(option.value)}</IconSlot>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null}

                {menu === "when" ? (
                  <Menu>
                    {WHEN_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.value}
                        selected={option.value === whenPreset}
                        onClick={() => {
                          setWhenPreset(option.value);
                          if (option.value !== "custom") setMenu(null);
                        }}
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                    {whenPreset === "custom" ? (
                      <div className="border-t border-[var(--border-hairline)] p-2">
                        <input
                          type="datetime-local"
                          value={customIso}
                          onChange={(event) => setCustomIso(event.target.value)}
                          className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-2 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    ) : null}
                  </Menu>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-5 py-4">
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <kbd className="rounded border border-[var(--border-panel)] bg-[var(--surface-inset)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[var(--text-secondary)]">
                  {modKey}
                </kbd>
                <kbd className="rounded border border-[var(--border-panel)] bg-[var(--surface-inset)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[var(--text-secondary)]">
                  ↵
                </kbd>
                <span className="ml-0.5">to create</span>
              </span>
              <div className="flex gap-2">
                <button className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={closeDialog} type="button">
                  Cancel
                </button>
                <button className={buttonClasses({ variant: "primary", size: "sm" })} type="submit">
                  {whenPreset === "now" ? "Create task" : "Schedule task"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function PillButton({
  active,
  onClick,
  children,
  style,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--border-panel)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
      }`}
    >
      {children}
    </button>
  );
}

function IconSlot({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{children}</span>;
}

function Menu({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-[2] mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] py-1 shadow-[var(--elev-raised)]">
      {children}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
  style,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium ${
        selected ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
