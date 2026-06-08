"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

function Avatar({ role }: { role: MarkMessage["role"] }) {
  const isMark = role === "mark";
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-black",
        isMark ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
      )}
    >
      {isMark ? "M" : "You"}
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <span className="flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:200ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:400ms]" />
      </span>
      <span>Mark is thinking…</span>
    </div>
  );
}

function MessageRow({ message }: { message: MarkMessage }) {
  const isMark = message.role === "mark";
  return (
    <div className={cx("flex gap-3 px-5 py-4", isMark ? "bg-[var(--surface-inset)]/40" : "")}>
      <Avatar role={message.role} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {isMark ? "Mark" : "You"}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {isMark && message.status === "pending" ? (
          <ThinkingIndicator />
        ) : (
          <div
            className={cx(
              "whitespace-pre-wrap text-sm leading-6",
              message.status === "failed" ? "text-[var(--priority-bright)]" : "text-[var(--text-primary)]",
            )}
          >
            {message.body}
          </div>
        )}
        {message.mentions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.mentions.map((m) => (
              <Link
                key={`${m.type}:${m.id}`}
                href={m.href}
                className="inline-flex items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
              >
                @{m.label}
              </Link>
            ))}
          </div>
        ) : null}
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
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <div className="font-display text-lg font-bold text-[var(--text-primary)]">Ask Mark anything</div>
          <p className="mx-auto mt-2 max-w-[44ch] text-sm text-[var(--text-secondary)]">
            Try &quot;How is <span className="text-[var(--accent)]">@a campaign</span> doing?&quot; or &quot;Compare{" "}
            <span className="text-[var(--accent)]">@a persona</span> to last month.&quot; Type <span className="font-mono">@</span> to reference a record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-[var(--border-hairline)] overflow-y-auto">
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
