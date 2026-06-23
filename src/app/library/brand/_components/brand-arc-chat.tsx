"use client";

import { ArrowUp, ExternalLink, FileText, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/app/_components/page-header";
import { cx } from "@/app/_components/theme";

import { ingestBrandChatNoteAction, uploadAndAnalyzeBrandSourcesAction } from "../actions";

const NOT_CONFIGURED_MESSAGE = "Supabase is not configured.";

type ChatRole = "operator" | "arc" | "system";
type ChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  files?: string[];
  pending?: boolean;
};

const ACCEPT = "application/pdf,image/*,image/svg+xml,.svg,.ico,.txt,.md,.doc,.docx";

let messageSeq = 0;
function nextId(prefix: string) {
  messageSeq += 1;
  return `${prefix}-${messageSeq}`;
}

/** Auto-grow a textarea between a min and max height. */
function useAutoResize(minHeight: number, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(
    (reset?: boolean) => {
      const el = ref.current;
      if (!el) return;
      el.style.height = `${minHeight}px`;
      if (reset) return;
      el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
    },
    [minHeight, maxHeight],
  );
  return { ref, resize };
}

/**
 * Brand-scoped chat with Arc. Visual shell adapted from the 21st.dev
 * "Animated AI Chat" component, restyled to the app design system. Its job is
 * to populate the brand page and the Brain: typed notes and attached documents
 * both run through the brand intake (ingestBrandChatNoteAction /
 * uploadAndAnalyzeBrandSourcesAction), which writes a source to the Library and
 * proposes brand facts into the Brain that surface in "Needs your review" —
 * nothing is used until the operator approves. After capture it refreshes the
 * page so the new proposals appear. Falls back to a labelled preview when the
 * workspace isn't connected.
 */
export function BrandArcChat({ agentName }: { agentName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "arc",
      body: `Hi — I'm ${agentName}. Tell me about the brand or drop in docs (guidelines, voice, proof, offerings) and I'll add brand facts to your brand and Brain for you to review.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [demo, setDemo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: textareaRef, resize } = useAutoResize(48, 140);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const replacePending = useCallback((id: string, body: string) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, body, pending: false } : m)));
  }, []);

  async function handleSend() {
    const text = input.trim();
    const attached = files;
    if (!text && attached.length === 0) return;

    setMessages((m) => [
      ...m,
      { id: nextId("op"), role: "operator", body: text, files: attached.map((f) => f.name) },
    ]);
    setInput("");
    setFiles([]);
    resize(true);
    setPending(true);

    const pendingId = nextId("arc");
    setMessages((m) => [...m, { id: pendingId, role: "arc", body: "", pending: true }]);

    // Everything the operator sends is captured as brand knowledge: attached
    // documents and typed notes both run through the brand intake, which writes
    // a source to the Library and proposes brand facts into the Brain for review.
    const summaries: Array<{ ok: boolean; message: string; items: string[] }> = [];
    try {
      if (attached.length > 0) {
        const fd = new FormData();
        attached.forEach((file) => fd.append("files", file));
        const res = await uploadAndAnalyzeBrandSourcesAction(null, fd);
        if (res) summaries.push(res);
      }
      if (text) {
        summaries.push(await ingestBrandChatNoteAction(text));
      }
    } catch {
      summaries.push({ ok: false, message: "error", items: ["Something went wrong saving that."] });
    }

    const notConfigured = summaries.some((s) => s.message === NOT_CONFIGURED_MESSAGE);
    let reply: string;
    if (notConfigured) {
      setDemo(true);
      reply =
        "I'm in preview mode here, so I can't save to your brand yet. Once the workspace is connected, anything you type or attach lands in your brand and Brain for review.";
    } else {
      const lines = summaries.flatMap((s) => s.items ?? []);
      const body = lines.length > 0 ? lines.map((line) => `• ${line}`).join("\n") : "• Saved as a brand source";
      reply = `Got it — added to your brand:\n${body}\n\nReview anything new under "Needs your review".`;
    }

    replacePending(pendingId, reply);
    setPending(false);
    if (!notConfigured) router.refresh();
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)]);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section aria-labelledby="brand-chat-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" id="brand-chat-heading">
            Chat with {agentName}
          </h2>
          {demo ? <span className="text-xs font-semibold text-[var(--text-muted)]">Preview</span> : null}
        </div>
        <Link className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href="/arc">
          Open full chat
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="max-h-[360px] min-h-[180px] space-y-3 overflow-y-auto p-4" ref={scrollRef}>
          {messages.map((message) => (
            <MessageBubble agentName={agentName} key={message.id} message={message} />
          ))}
        </div>

        <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                  key={`${file.name}-${index}`}
                >
                  <FileText aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span className="max-w-[12rem] truncate">{file.name}</span>
                  <button
                    aria-label={`Remove ${file.name}`}
                    className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    type="button"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <button
              aria-label="Attach documents"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <Paperclip aria-hidden className="h-4 w-4" />
            </button>
            <input accept={ACCEPT} className="sr-only" multiple onChange={(e) => onPickFiles(e.target.files)} ref={fileInput} type="file" />

            <textarea
              className="max-h-[140px] min-h-[48px] flex-1 resize-none rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              onChange={(e) => {
                setInput(e.target.value);
                resize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!pending) handleSend();
                }
              }}
              placeholder={`Tell ${agentName} about the brand, or attach docs…`}
              ref={textareaRef}
              rows={1}
              value={input}
            />

            <button
              aria-label="Send"
              className={cx(buttonClasses({ variant: "primary", size: "sm" }), "h-10 w-10 justify-center px-0")}
              disabled={pending || (!input.trim() && files.length === 0)}
              onClick={() => handleSend()}
              type="button"
            >
              {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ArrowUp aria-hidden className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 px-1 text-xs leading-5 text-[var(--text-muted)]">
            {agentName} proposes brand facts you approve — it never changes your brand on its own.
          </p>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ agentName, message }: { agentName: string; message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="mx-auto max-w-[90%] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-center text-xs leading-5 text-[var(--text-secondary)]">
        {message.body}
      </div>
    );
  }

  const isOperator = message.role === "operator";
  return (
    <div className={cx("flex", isOperator ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6",
          isOperator
            ? "rounded-br-sm bg-[var(--accent-soft)] text-[var(--text-primary)]"
            : "rounded-bl-sm border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-primary)]",
        )}
      >
        {!isOperator ? (
          <div className="mb-1 text-xs font-semibold tracking-[0.01em] text-[var(--text-muted)]">{agentName}</div>
        ) : null}
        {message.pending ? (
          <TypingDots />
        ) : (
          <p className="whitespace-pre-wrap">{message.body}</p>
        )}
        {message.files && message.files.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.files.map((name, index) => (
              <span
                className="inline-flex items-center gap-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
                key={`${name}-${index}`}
              >
                <FileText aria-hidden className="h-3 w-3" />
                <span className="max-w-[10rem] truncate">{name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-muted)]"
          key={i}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
