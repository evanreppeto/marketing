"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";

import { addTaskEventAction, updateTaskFieldAction } from "./actions";
import type { EditableField } from "./actions";

type SaveState = "idle" | "saving" | "saved" | "failed";

type TicketEditableHeaderProps = {
  taskId: string;
  taskType: string;
  objective: string;
  description: string | null;
  status: string;
  driverLabel: string;
  latestOutputHref: string | null;
};

export function TicketEditableHeader({
  taskId,
  taskType,
  objective,
  description,
  status,
  driverLabel,
  latestOutputHref,
}: TicketEditableHeaderProps) {
  const [title, setTitle] = useState(objective);
  const [savedTitle, setSavedTitle] = useState(objective);
  const [brief, setBrief] = useState(description ?? "");
  const [savedBrief, setSavedBrief] = useState(description ?? "");
  const [titleState, setTitleState] = useState<SaveState>("idle");
  const [briefState, setBriefState] = useState<SaveState>("idle");
  const [instruction, setInstruction] = useState("");
  const [instructionMessage, setInstructionMessage] = useState<string | null>(null);
  const [continueMessage, setContinueMessage] = useState<string | null>(null);
  const [isInstructionPending, startInstructionTransition] = useTransition();
  const [isContinuePending, startContinueTransition] = useTransition();
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [title]);

  function saveTextField(field: Extract<EditableField, "objective" | "description">, value: string) {
    const nextValue = value.trim();
    const currentValue = field === "objective" ? savedTitle : savedBrief;
    const setState = field === "objective" ? setTitleState : setBriefState;
    const setSaved = field === "objective" ? setSavedTitle : setSavedBrief;

    if (nextValue === currentValue.trim()) return;

    setState("saving");
    startInstructionTransition(async () => {
      const result = await updateTaskFieldAction(taskId, { field, value: nextValue || null });
      if (result.ok) {
        setSaved(nextValue);
        setState("saved");
      } else {
        setState("failed");
      }
    });
  }

  function submitInstruction(body: string, onDone?: () => void) {
    const trimmed = body.trim();
    if (!trimmed) return;

    setInstructionMessage(null);
    startInstructionTransition(async () => {
      const result = await addTaskEventAction(taskId, { eventType: "instruction", body: trimmed });
      if (result.ok) {
        setInstructionMessage("Instruction sent.");
        onDone?.();
      } else {
        setInstructionMessage(result.message);
      }
    });
  }

  return (
    <section className="module-rise rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">{humanize(taskType)}</span>
              <StatusPill tone={statusTone(status)}>{humanize(status)}</StatusPill>
              <StatusPill tone="blue">Driver: {driverLabel}</StatusPill>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>

            <label className="mt-3 block">
              <span className="sr-only">Task objective</span>
              <textarea
                className="min-h-[96px] w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-0 py-1 font-display text-xl font-bold leading-tight text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-hairline)] focus:bg-[var(--surface-inset)] focus:px-3 focus:outline focus:outline-2 focus:outline-[var(--accent)] sm:text-2xl"
                onBlur={() => saveTextField("objective", title)}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && (event.key === "Enter" || event.key === "NumpadEnter")) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                ref={titleRef}
                rows={1}
                value={title}
              />
            </label>

            <label className="mt-2 block">
              <span className="sr-only">Task brief</span>
              <textarea
                className="min-h-[86px] w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-medium leading-6 text-[var(--text-secondary)] outline-none transition placeholder:text-[var(--text-muted)] focus:outline focus:outline-2 focus:outline-[var(--accent)]"
                onBlur={() => saveTextField("description", brief)}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="Add the operator brief Mark should follow."
                value={brief}
              />
            </label>

            <div className="mt-2 flex min-h-5 flex-wrap items-center gap-3 text-xs font-semibold text-[var(--text-muted)]" aria-live="polite">
              <SaveLabel label="Title" state={titleState} />
              <SaveLabel label="Brief" state={briefState} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
            {latestOutputHref ? (
              <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={latestOutputHref}>
                Review latest output
              </Link>
            ) : null}
            <button
              className={buttonClasses({ variant: "ghost", size: "sm" })}
              disabled={isContinuePending}
              onClick={() => {
                setContinueMessage(null);
                startContinueTransition(async () => {
                  const result = await addTaskEventAction(taskId, {
                    eventType: "instruction",
                    body: "Please continue this task. Keep outbound locked and add the next useful update here.",
                  });
                  setContinueMessage(result.ok ? "Mark was asked to continue." : result.message);
                });
              }}
              type="button"
            >
              {isContinuePending ? "Sending..." : "Ask Mark to continue"}
            </button>
            <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/board">
              Open board
            </Link>
          </div>
        </div>

        {continueMessage ? <p className="mt-3 text-xs font-semibold text-[var(--text-muted)]">{continueMessage}</p> : null}
      </div>

      <form
        className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          submitInstruction(instruction, () => setInstruction(""));
        }}
      >
        <label className="block">
          <span className="sr-only">Instruction for Mark</span>
          <input
            className="min-h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && (event.key === "Enter" || event.key === "NumpadEnter")) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Tell Mark what to do next..."
            value={instruction}
          />
        </label>
        <button className={buttonClasses({ variant: "primary", size: "md" })} disabled={isInstructionPending || instruction.trim().length < 2} type="submit">
          {isInstructionPending ? "Sending..." : "Send"}
        </button>
        {instructionMessage ? (
          <p className="text-xs font-semibold text-[var(--text-muted)] sm:col-span-2" aria-live="polite">
            {instructionMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function SaveLabel({ label, state }: { label: string; state: SaveState }) {
  if (state === "idle") return null;
  const text = state === "saving" ? "Saving" : state === "saved" ? "Saved" : "Save failed";
  const tone = state === "failed" ? "text-[var(--warn)]" : "text-[var(--text-muted)]";
  return (
    <span className={tone}>
      {label}: {text}
    </span>
  );
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" | "gray" {
  if (["completed", "approved", "passed"].includes(status)) return "green";
  if (["running", "processing"].includes(status)) return "blue";
  if (["blocked", "failed", "error"].includes(status)) return "red";
  if (["queued", "needs_approval", "pending"].includes(status)) return "amber";
  return "gray";
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
