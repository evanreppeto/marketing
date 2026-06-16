"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { ArcAvatar } from "@/app/arc/_components/arc-avatar";
import { Button, StatusPill } from "@/app/_components/page-header";
import type { PersonaState } from "@/components/ai-elements/persona";
import type { CampaignWorkspaceReasoning, ArcMessage } from "@/lib/campaigns/read-model";

import { sendArcMessageAction } from "../actions";
import { statusTone } from "./status-tone";

const SUGGESTIONS = [
  "Draft 2 more Instagram ads for property managers.",
  "Make the partner intro email shorter and add a referral CTA.",
  "Add a follow-up SMS for non-responders.",
  "Why did you choose this audience?",
];

/**
 * The campaign's two-way conversation with Arc. Operator turns are durable
 * directives queued for Arc; Arc's turns are the work he produced. Messages
 * persist — Arc works asynchronously and his replies appear here as outputs.
 */
export function ArcConversation({
  campaignId,
  conversation,
  reasoning,
}: {
  campaignId: string;
  conversation: ArcMessage[];
  reasoning: CampaignWorkspaceReasoning;
}) {
  const agentName = useAgentName();
  return (
    <div className="module-rise grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <header className="flex items-center gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <ArcAvatar size={40} state="idle" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-[-0.02em] text-[var(--text-primary)]">{agentName}</h2>
              <StatusPill tone="blue">Drafts only</StatusPill>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
              Ask {agentName} to build, revise, or explain. Messages are queued — outbound stays locked.
            </p>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {conversation.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-6 text-sm leading-6 text-[var(--text-muted)]">
              No messages yet. Ask {agentName} to draft more pieces, revise an existing one, or explain its choices — your message is queued for it and its reply lands here.
            </div>
          ) : (
            conversation.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </div>

        <Composer campaignId={campaignId} />
      </section>

      <ArcPlan reasoning={reasoning} />
    </div>
  );
}
function MessageBubble({ message }: { message: ArcMessage }) {
  if (message.role === "operator") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md border border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] px-4 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{message.body}</p>
        </div>
        <div className="mt-1 flex items-center gap-2 pr-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <span>{message.author}</span>
          <span aria-hidden>·</span>
          <span>{message.at}</span>
          {message.status ? <StatusPill tone={statusTone(message.status)}>{message.status}</StatusPill> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <ArcAvatar size={28} state={campaignAvatarState(message.status)} />
      <div className="min-w-0 max-w-[90%]">
        <div className="rounded-2xl rounded-tl-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-4 py-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{message.kind}</span>
            {message.status ? <StatusPill tone={statusTone(message.status)}>{message.status}</StatusPill> : null}
          </div>
          {message.title ? <div className="text-sm font-bold text-[var(--text-primary)]">{message.title}</div> : null}
          <p className="mt-1 line-clamp-[12] whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{message.body}</p>
        </div>
        <div className="mt-1 pl-1 text-[11px] font-semibold text-[var(--text-muted)]">
          {message.author} · {message.at}
        </div>
      </div>
    </div>
  );
}

function campaignAvatarState(status: ArcMessage["status"]): PersonaState {
  if (status === "queued" || status === "running" || status === "pending") {
    return "thinking";
  }
  if (status === "failed" || status === "blocked") {
    return "asleep";
  }
  return "speaking";
}

function Composer({ campaignId }: { campaignId: string }) {
  const agentName = useAgentName();
  const [state, formAction, isPending] = useActionState(sendArcMessageAction, null);
  const [draft, setDraft] = useState("");
  const [seenState, setSeenState] = useState(state);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clear the box once a send succeeds — adjust state during render (the React
  // pattern) rather than in an effect, which keeps cascading renders out.
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setDraft("");
  }

  useEffect(() => {
    if (state?.ok) textareaRef.current?.focus();
  }, [state]);

  return (
    <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setDraft(suggestion);
              textareaRef.current?.focus();
            }}
            className="rounded-full border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="campaignId" value={campaignId} />
        <textarea
          ref={textareaRef}
          name="message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder={`Tell ${agentName} what to build, revise, or explain…`}
          className="w-full resize-y rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2.5 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${state && !state.ok ? "text-[oklch(0.86_0.09_26)]" : "text-[var(--text-muted)]"}`}>
            {state ? state.message : `${agentName} works asynchronously — replies appear in the thread.`}
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={isPending || draft.trim().length === 0}>
            {isPending ? "Sending…" : `Send to ${agentName}`}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ArcPlan({ reasoning }: { reasoning: CampaignWorkspaceReasoning }) {
  const agentName = useAgentName();
  const hasGuardrails = reasoning.guardrailFlags.length > 0;
  const hasTools = reasoning.toolsUsed.length > 0;

  return (
    <aside className="space-y-3">
      <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
        <span className="signal-eyebrow">{agentName}&rsquo;s plan</span>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{reasoning.whyBuilt}</p>
        {reasoning.recommendedAction ? (
          <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Recommended next step</div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{reasoning.recommendedAction}</p>
          </div>
        ) : null}
      </div>

      {hasGuardrails ? (
        <div className="rounded-xl border border-[oklch(0.76_0.14_18/0.32)] bg-[oklch(0.5_0.14_18/0.1)] p-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.86_0.1_26)]">Guardrails</span>
            <StatusPill tone="red">{reasoning.guardrailFlags.length}</StatusPill>
          </div>
          <ul className="mt-2 space-y-1.5">
            {reasoning.guardrailFlags.map((flag) => (
              <li key={flag} className="text-sm leading-5 text-[var(--text-secondary)]">{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasTools ? (
        <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
          <span className="signal-eyebrow">Tools {agentName} used</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasoning.toolsUsed.map((tool) => (
              <span key={tool} className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                {tool}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
