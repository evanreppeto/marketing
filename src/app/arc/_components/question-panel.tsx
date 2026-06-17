"use client";

import { useState } from "react";

import type { ArcQuestion } from "@/domain";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition";

/** One question: single-select chips (auto-send), multi-select chips + Send, and/or a free-text field. */
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

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
      <div className="text-sm font-medium text-[var(--text-primary)]">{question.prompt}</div>

      {hasOptions ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Answer options">
          {question.options.map((opt) =>
            question.multi ? (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                aria-pressed={selected.includes(opt)}
                className={cx(
                  CHIP_BASE,
                  selected.includes(opt)
                    ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:text-[var(--text-primary)]",
                )}
              >
                <span aria-hidden className="text-[var(--accent)]">
                  {selected.includes(opt) ? "✓" : "+"}
                </span>
                {opt}
              </button>
            ) : (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(opt)}
                className={cx(
                  CHIP_BASE,
                  "text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent)]",
                )}
              >
                {opt}
              </button>
            ),
          )}
        </div>
      ) : null}

      {question.multi && hasOptions ? (
        <button
          type="button"
          onClick={sendSelected}
          disabled={selected.length === 0}
          className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)] transition disabled:opacity-40"
        >
          Send{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      ) : null}

      {question.allowText ? (
        <div className="mt-2 flex gap-1.5">
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
            className="min-w-0 flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={!text.trim()}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
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
