"use client";

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
};

export function TicketEditableHeader({
  taskId,
  taskType,
  objective,
  description,
  status,
  driverLabel,
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
    <section className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)]">{humanize(taskType)}</span>
              <span className="text-[var(--text-muted)]">/</span>
              <StatusPill tone={statusTone(status)}>{humanize(status)}</StatusPill>
              <span className="text-xs font-semibold text-[var(--text-muted)]">{driverLabel} is doing the work. Outbound is locked.</span>
            </div>

            <label className="mt-3 block">
              <span className="sr-only">Task objective</span>
              <textarea
                className="min-h-[72px] w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-0 py-1 text-xl font-semibold leading-snug text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-hairline)] focus:bg-[var(--surface-inset)] focus:px-3 focus:outline focus:outline-2 focus:outline-[var(--accent)] sm:text-2xl"
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

            {savedBrief ? (
              <details className="mt-2 max-w-[720px]" open>
                <summary className="cursor-pointer text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
                  Brief
                </summary>
                <label className="mt-2 block">
                  <span className="sr-only">Task brief</span>
                  <textarea
                    className="min-h-[72px] w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[var(--text-secondary)] outline-none transition placeholder:text-[var(--text-muted)] focus:outline focus:outline-2 focus:outline-[var(--accent)]"
                    onBlur={() => saveTextField("description", brief)}
                    onChange={(event) => setBrief(event.target.value)}
                    placeholder="Add what Mark should know."
                    value={brief}
                  />
                </label>
              </details>
            ) : null}

            <div className="mt-2 flex min-h-5 flex-wrap items-center gap-3 text-xs font-semibold text-[var(--text-muted)]" aria-live="polite">
              <SaveLabel label="Title" state={titleState} />
              <SaveLabel label="Brief" state={briefState} />
            </div>
          </div>

        </div>
      </div>

      <form
        className="border-t border-[var(--border-hairline)] px-4 py-3 sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          submitInstruction(instruction, () => setInstruction(""));
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="block">
            <span className="sr-only">Instruction for Mark</span>
            <input
              className="min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              id="mark-instruction"
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && (event.key === "Enter" || event.key === "NumpadEnter")) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Add instruction for Mark"
              value={instruction}
            />
          </label>
          <button className={buttonClasses({ variant: "primary", size: "md" })} disabled={isInstructionPending || instruction.trim().length < 2} type="submit">
            {isInstructionPending ? "Adding..." : "Add"}
          </button>
          <button
            className={buttonClasses({ variant: "ghost", size: "md" })}
            disabled={isContinuePending}
            onClick={() => {
              setContinueMessage(null);
              startContinueTransition(async () => {
                const result = await addTaskEventAction(taskId, {
                  eventType: "instruction",
                  body: "Please continue this task. Keep outbound locked and add the next useful update here.",
                });
                setContinueMessage(result.ok ? "Mark was asked for the next step." : result.message);
              });
            }}
            type="button"
          >
            {isContinuePending ? "Sending..." : "Ask for next step"}
          </button>
        </div>
        {instructionMessage ? (
          <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]" aria-live="polite">
            {instructionMessage}
          </p>
        ) : null}
        {continueMessage ? <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">{continueMessage}</p> : null}
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
