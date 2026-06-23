"use client";

import { useState } from "react";

import type { ArcQuestion } from "@/domain";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden className={className}>
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Long sentence-style options read better stacked full-width; short ones stay as pills. */
function isStacked(question: ArcQuestion): boolean {
  return question.multi || question.options.some((o) => o.length > 24);
}

/** One full-width option row (Claude-style): left-aligned label, trailing affordance. */
function OptionRow({
  label,
  selected,
  multi,
  onClick,
}: {
  label: string;
  selected: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={multi ? selected : undefined}
      className={cx(
        "group/opt flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition",
        selected
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
          : "bg-[var(--surface-inset)] text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent)]",
      )}
    >
      {multi ? (
        <span
          aria-hidden
          className={cx(
            "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] transition",
            selected
              ? "bg-[var(--accent)] text-[var(--on-accent)]"
              : "shadow-[inset_0_0_0_1px_var(--border-strong)] text-transparent",
          )}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
            <path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
      <span className="flex-1 leading-snug">{label}</span>
      {multi ? null : (
        <ChevronRight className="shrink-0 text-[var(--text-muted)] transition group-hover/opt:translate-x-0.5 group-hover/opt:text-[var(--accent)]" />
      )}
    </button>
  );
}

/** One question: single-select (auto-send), multi-select (+ Send), and/or a free-text field. */
function QuestionCard({ question, onAnswer }: { question: ArcQuestion; onAnswer: (answer: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  function toggle(option: string) {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
  }
  function sendSelected() {
    if (selected.length > 0) onAnswer(selected.join(", "));
  }
  function sendText() {
    const t = text.trim();
    if (t) onAnswer(t);
  }

  const hasOptions = question.options.length > 0;
  const stacked = hasOptions && isStacked(question);

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
      <div className="text-sm font-medium leading-snug text-[var(--text-primary)]">{question.prompt}</div>

      {hasOptions ? (
        stacked ? (
          <div className="mt-2.5 flex flex-col gap-1.5" aria-label="Answer options">
            {question.options.map((opt) => (
              <OptionRow
                key={opt}
                label={opt}
                multi={Boolean(question.multi)}
                selected={selected.includes(opt)}
                onClick={() => (question.multi ? toggle(opt) : onAnswer(opt))}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Answer options">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(opt)}
                className="inline-flex items-center rounded-full bg-[var(--surface-inset)] px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent)]"
              >
                {opt}
              </button>
            ))}
          </div>
        )
      ) : null}

      {question.multi && hasOptions ? (
        <button
          type="button"
          onClick={sendSelected}
          disabled={selected.length === 0}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          Send{selected.length > 0 ? ` ${selected.length} selected` : ""}
          <ChevronRight />
        </button>
      ) : null}

      {question.allowText ? (
        <div className="mt-2.5 flex gap-1.5">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder="Type your own answer…"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:bg-[var(--surface-panel)]"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={!text.trim()}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent)] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Arc's pending questions, pinned above the composer. Answering auto-sends the
 *  choice as the operator's next message (the panel then clears). */
export function QuestionPanel({
  questions,
  onAnswer,
}: {
  questions: ArcQuestion[];
  onAnswer: (answer: string) => void;
}) {
  if (!questions || questions.length === 0) return null;
  return (
    <div className="mb-2 space-y-2" aria-label="Arc is asking">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} onAnswer={onAnswer} />
      ))}
    </div>
  );
}
