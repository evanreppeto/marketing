"use client";

// The two full-conversation renderers — LiveConversation (server-backed messages)
// and DemoConversation (the offline preview) — plus the new-chat launcher. Both
// compose the shared primitives from ./arc-messages; the container (arc-view.tsx)
// renders these.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, MessageSquareText, ShieldCheck, Target, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { ArcActionCard, ArcAssetStatus } from "@/domain";
import type { ArcMessage, ArcStep } from "@/lib/arc-chat/persistence";
import { buildArcRunContract, type ArcRunContract } from "@/lib/arc-chat/run-contract";
import { buildArcRunProfile } from "@/lib/arc-chat/run-profile";

import { MARKDOWN_COMPONENTS, REHYPE_HIGHLIGHT_PLUGINS, REMARK_PLUGINS } from "./arc-markdown";
import {
  ArcDraftCard,
  AssistantMessage,
  DraftPackageCard,
  DraftReceiptCard,
  MessageActions,
  operatorMessageBefore,
  OperatorMessage,
  RecallRow,
  RunTrace,
  SourcesRow,
} from "./arc-messages";
import {
  buildDemoLiveWork,
  DEMO_ATTACHMENTS,
  DEMO_BREAKDOWN_MD,
  DEMO_DRAFT_CARD,
  DEMO_PACKAGE_CARDS,
  DEMO_RECALL,
  DEMO_SOURCES,
  DEMO_STEPS,
  DEMO_TOOLS,
} from "./arc-demo-data";
import type { ArcWaiting, DemoTurn } from "./arc-view.types";

export const LAUNCHER_SHORTCUTS: Array<{ icon: typeof Target; label: string; prompt: string }> = [
  { icon: Target, label: "Find priority leads", prompt: "Which homeowners should we reach first right now, and why?" },
  { icon: MessageSquareText, label: "Draft a campaign", prompt: "Draft a multi-channel campaign for our highest-priority segment." },
  { icon: Zap, label: "Check today's signals", prompt: "What new signals or opportunities should I know about today?" },
  { icon: ShieldCheck, label: "Review approvals", prompt: "What's waiting for my approval right now?" },
];

/** The new-conversation "work launcher": a time-of-day greeting and tappable
 *  workflow starters that prefill the composer, so a blank chat proposes work
 *  instead of a bare prompt. */
export function ArcLauncher({ greetName, waiting, onPick }: { greetName: string; waiting?: ArcWaiting | null; onPick: (prompt: string) => void }) {
  // Neutral on the server, resolved to the local time-of-day after mount — keeps
  // SSR/client markup identical (no hydration mismatch) and greets by the reader's
  // own clock, not the server's.
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const hour = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the browser clock is exactly what this effect is for
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const pick = (prompt: string) => {
    onPick(prompt);
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(".arc-composer textarea");
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(prompt.length, prompt.length);
      }
    });
  };

  return (
    <div className="arc-launcher">
      <h2>{greeting}, {greetName}</h2>
      <p>Ask me to find an audience, draft a campaign, or check a signal. I’ll show the work and keep every draft ready for your review.</p>
      {waiting && (waiting.approvals > 0 || waiting.opportunities > 0) ? (
        <div className="arc-launcher-waiting">
          <span className="arc-launcher-waiting-label">Waiting on you</span>
          <div className="arc-launcher-waiting-row">
            {waiting.approvals > 0 ? (
              <Link href="/campaigns" className="arc-launcher-waiting-item is-warn">
                <ClipboardCheck size={14} />
                <b>{waiting.approvals}</b> {waiting.approvals === 1 ? "approval" : "approvals"}
                <ArrowRight size={13} />
              </Link>
            ) : null}
            <Link href="/opportunities" className="arc-launcher-waiting-item">
              <Zap size={14} />
              <b>{waiting.opportunities}</b> {waiting.opportunities === 1 ? "opportunity" : "opportunities"}
              <ArrowRight size={13} />
            </Link>
          </div>
          {waiting.items && waiting.items.length > 0 ? (
            <div className="arc-launcher-nudges">
              {waiting.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="arc-launcher-nudge"
                  onClick={() => pick(item.prompt)}
                  title={item.prompt}
                >
                  <span className={`arc-nudge-dot is-${item.urgency}`} aria-hidden />
                  <span className="arc-nudge-title">{item.title}</span>
                  <ArrowRight size={13} className="arc-nudge-go" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="arc-launcher-grid">
        {LAUNCHER_SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <button type="button" key={shortcut.label} onClick={() => pick(shortcut.prompt)}>
              <span className="arc-launcher-icon"><Icon size={16} /></span>
              <b>{shortcut.label}</b>
              <small>{shortcut.prompt}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LiveConversation({
  messages,
  operatorName,
  waiting,
  assetStatuses,
  onSuggestion,
  onReview,
  onEdit,
  onRegenerate,
  onCancelRun,
  stoppingTaskId,
}: {
  messages: ArcMessage[];
  operatorName: string;
  waiting?: ArcWaiting | null;
  assetStatuses: Record<string, ArcAssetStatus>;
  onSuggestion: (value: string) => void;
  onReview: (cards: ArcActionCard[]) => void;
  onEdit: (messageId: string, newBody: string) => void;
  onRegenerate: (replyMessageId: string) => void;
  onCancelRun: (taskId: string, conversationId: string) => void;
  stoppingTaskId: string | null;
}) {
  if (messages.length === 0) {
    return <ArcLauncher greetName={operatorName} waiting={waiting} onPick={onSuggestion} />;
  }

  // While a reply is in flight, hide edit/regenerate — the turn is already running.
  const awaitingReply = messages.some((message) => message.status === "pending" || (message.role === "arc" && !message.body.trim()));
  const lastIndex = messages.length - 1;

  return (
    <>
      {messages.map((message, index) => {
        if (message.role === "operator") return <OperatorMessage key={message.id} body={message.body} timeIso={message.createdAt} attachments={message.attachments} onEdit={awaitingReply ? undefined : (newBody) => onEdit(message.id, newBody)} />;
        const pending = message.status === "pending" || (message.role === "arc" && !message.body.trim());
        const operatorMessage = operatorMessageBefore(messages, index);
        // Runner-measured wall-clock. Message rows are inserted before the run,
        // so subtracting their created_at values reported 0s for real work.
        const thoughtSeconds = !pending && message.runDurationMs != null ? message.runDurationMs / 1000 : undefined;
        const contract = buildArcRunContract({
          mode: operatorMessage?.mode,
          route: operatorMessage?.route,
          contextScopes: operatorMessage?.contextScopes,
          actionCount: message.actions.length,
          toolCount: message.toolCalls?.length ?? 0,
          agentTaskId: message.agentTaskId,
        });
        return (
          <AssistantMessage key={message.id} timeIso={message.createdAt} active={pending}>
            <RunTrace pending={pending} liveText={pending ? message.body : null} reasoning={message.reasoning} steps={message.steps} toolCalls={message.toolCalls} contract={contract} thoughtSeconds={thoughtSeconds} onStop={pending && message.agentTaskId ? () => onCancelRun(message.agentTaskId as string, message.conversationId) : undefined} stopping={stoppingTaskId === message.agentTaskId} outcome={message.status === "failed" ? (message.body.startsWith("Stopped by you") ? "canceled" : "failed") : "complete"} />
            {!pending ? <div className="arc-markdown"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_HIGHLIGHT_PLUGINS} components={MARKDOWN_COMPONENTS}>{message.body}</ReactMarkdown></div> : null}
            {!pending && message.mentions.length ? <SourcesRow mentions={message.mentions} /> : null}
            {!pending && message.recall?.length ? <RecallRow recall={message.recall} /> : null}
            {!pending && message.actions.length ? (() => {
              const approvalCards = message.actions.filter((card) => card.approval);
              const otherCards = message.actions.filter((card) => !card.approval);
              return (
                <>
                  {otherCards.length ? <div className="arc-action-list">{otherCards.map((card, index) => <ArcDraftCard card={card} key={`${card.title}-${index}`} />)}</div> : null}
                  {approvalCards.length === 1 ? <DraftReceiptCard card={approvalCards[0]!} status={assetStatuses[approvalCards[0]!.approval?.assetId ?? ""] ?? approvalCards[0]!.status ?? null} onReview={() => onReview(approvalCards)} /> : null}
                  {approvalCards.length >= 2 ? <DraftPackageCard cards={approvalCards} statuses={assetStatuses} onReview={() => onReview(approvalCards)} /> : null}
                </>
              );
            })() : null}
            {!pending && message.suggestions.length ? <div className="arc-suggestions">{message.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div> : null}
            {!pending ? <MessageActions message={message} onRegenerate={!awaitingReply && index === lastIndex ? () => onRegenerate(message.id) : undefined} /> : null}
          </AssistantMessage>
        );
      })}
    </>
  );
}

export function DemoConversation({
  turns,
  pending,
  includeSeed,
  packageStatuses,
  pendingContract,
  onReview,
  onEditResend,
  onStop,
}: {
  turns: DemoTurn[];
  pending: boolean;
  includeSeed: boolean;
  packageStatuses: Record<string, ArcAssetStatus>;
  pendingContract: ArcRunContract;
  onReview: (cards: ArcActionCard[]) => void;
  onEditResend: (body: string) => void;
  onStop: () => void;
}) {
  const pendingTurn = [...turns].reverse().find((turn) => turn.role === "operator");
  const demoLiveWork = buildDemoLiveWork(pendingTurn?.body);
  const editable = pending ? undefined : onEditResend;

  return (
    <>
      {includeSeed ? (
        <>
          <div className="arc-day"><span>July 14, 2026</span></div>
          <OperatorMessage time="9:34 AM" body="Here’s a reference photo from our last storm job — match this look in the creative." attachments={DEMO_ATTACHMENTS} onEdit={editable} />
          <OperatorMessage time="9:35 AM" body="Which homeowners should we reach first after the Naperville hailstorm?" onEdit={editable} />
          <AssistantMessage time="9:38 AM">
            <div className="arc-answer">
              <h2>142 homes took the heaviest hail and still haven’t booked an inspection.</h2>
              <p>That’s 23% of the storm zone and about $1.4M in estimated restoration work. The clearest urgency signals across them:</p>
              <ul><li>Sit in the <b>worst-hit hail swath</b>, with no inspection on file — <b>3.1× more likely</b> to have hidden damage</li><li>No inspection booked in the six days since the storm</li><li>Roof age 8+ years or prior claim history</li></ul>
            </div>
            <RunTrace pending={false} thoughtSeconds={8} reasoning="I combined the storm footprint with property condition and recent CRM activity, then favored an inspection-first message because it performed better than discount-led outreach." steps={DEMO_STEPS} toolCalls={DEMO_TOOLS} contract={buildArcRunContract({ mode: "ask", route: "standard", contextScopes: ["workspace", "crm", "campaigns"], toolCount: DEMO_TOOLS.length, agentTaskId: "DEMO-142-HOMES" })} />
            <SourcesRow mentions={DEMO_SOURCES} />
            <RecallRow recall={DEMO_RECALL} />
          </AssistantMessage>
          <AssistantMessage time="9:40 AM">
            <div className="arc-markdown"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_HIGHLIGHT_PLUGINS} components={MARKDOWN_COMPONENTS}>{DEMO_BREAKDOWN_MD}</ReactMarkdown></div>
          </AssistantMessage>
          <AssistantMessage time="9:42 AM">
            <div className="arc-answer"><p>I built the Storm Rapid Response package for the 142 highest-urgency homes.</p></div>
            <DraftPackageCard cards={DEMO_PACKAGE_CARDS} statuses={packageStatuses} onReview={() => onReview(DEMO_PACKAGE_CARDS)} />
          </AssistantMessage>
          <OperatorMessage time="9:44 AM" body="Looks good. Draft the email." onEdit={editable} />
          <AssistantMessage time="9:45 AM">
            <div className="arc-answer"><p>The inspection email for the 64 insured, fresh-damage homes is ready for review.</p></div>
            <DraftReceiptCard card={DEMO_DRAFT_CARD} status={packageStatuses[DEMO_DRAFT_CARD.approval?.assetId ?? ""] ?? DEMO_DRAFT_CARD.status ?? null} onReview={() => onReview([DEMO_DRAFT_CARD])} />
          </AssistantMessage>
        </>
      ) : null}
      {turns.map((turn, index) => {
        if (turn.role === "operator") return <OperatorMessage key={turn.id} body={turn.body} onEdit={editable} />;
        const operatorTurn = [...turns.slice(0, index)].reverse().find((candidate) => candidate.role === "operator");
        const turnContract = buildArcRunContract({ mode: turn.mode, route: "fast", contextScopes: ["workspace", "brand", "crm", "campaigns"], agentTaskId: turn.id });
        const turnProfile = buildArcRunProfile({ request: operatorTurn?.body, mode: turn.mode, command: turn.command, sources: turnContract.readScopes });
        const completedSteps: ArcStep[] = turn.outcome === "canceled"
          ? [{ label: "Stopped before remaining work was applied", status: "done", at: "now", kind: "think" }]
          : turnProfile.phases.map((phase) => ({ label: phase.label, detail: [phase.detail], status: "done", at: "now", kind: phase.kind }));
        return (
          <AssistantMessage key={turn.id} time="now">
            <RunTrace
              pending={false}
              thoughtSeconds={turn.outcome === "canceled" ? undefined : 5}
              outcome={turn.outcome ?? "complete"}
              reasoning={turn.outcome === "canceled" ? "The run ended at your request. Completed work remains visible, and no external action was taken." : turnProfile.completedSummary}
              steps={completedSteps}
              contract={turnContract}
            />
            <div className="arc-answer"><p>{turn.body}</p></div>
          </AssistantMessage>
        );
      })}
      {pending ? <AssistantMessage active><RunTrace pending reasoning={demoLiveWork.commentary} demoRows={demoLiveWork.rows} contract={pendingContract} onStop={onStop} /></AssistantMessage> : null}
    </>
  );
}


/** One conversation row with an inline options menu (pin / rename / archive /
 *  delete). The row itself opens the conversation; the ⋯ button reveals the menu. */
