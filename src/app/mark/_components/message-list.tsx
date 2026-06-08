"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

function MarkAvatar() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-display text-xs font-black text-[var(--on-accent)]"
    >
      M
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <span className="flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 motion-safe:animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 motion-safe:animate-pulse rounded-full bg-[var(--accent)] [animation-delay:200ms]" />
        <span className="h-1.5 w-1.5 motion-safe:animate-pulse rounded-full bg-[var(--accent)] [animation-delay:400ms]" />
      </span>
      <span>Mark is thinking…</span>
    </div>
  );
}

function MentionChips({ mentions, align }: { mentions: MarkMessage["mentions"]; align?: "end" }) {
  if (mentions.length === 0) return null;
  return (
    <div className={cx("mt-2 flex flex-wrap gap-1.5", align === "end" ? "justify-end" : "")}>
      {mentions.map((m) => (
        <Link
          key={`${m.type}:${m.id}`}
          href={m.href}
          className="inline-flex items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
        >
          @{m.label}
        </Link>
      ))}
    </div>
  );
}

function Message({ message }: { message: MarkMessage }) {
  // Operator: right-aligned bubble (ChatGPT-style).
  if (message.role === "operator") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--surface-inset)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)]">
          {message.body}
        </div>
        <MentionChips mentions={message.mentions} align="end" />
      </div>
    );
  }

  // Mark / system: full-width, avatar + plain text.
  return (
    <div className="flex gap-3">
      <MarkAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.status === "pending" ? (
          <ThinkingIndicator />
        ) : (
          <div
            className={cx(
              "whitespace-pre-wrap text-sm leading-7",
              message.status === "failed" ? "text-[var(--priority-bright)]" : "text-[var(--text-primary)]",
            )}
          >
            {message.body}
          </div>
        )}
        <MentionChips mentions={message.mentions} />
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: MarkMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
        <div className="text-center">
          <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-[var(--text-primary)]">
            What can Mark help with?
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-sm leading-6 text-[var(--text-secondary)]">
            Ask about a campaign, a lead, or a persona. Type{" "}
            <span className="font-mono text-[var(--accent)]">@</span> to reference a record. Mark recommends; outbound
            stays locked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
