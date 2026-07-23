"use client";

// The two full-conversation renderers — LiveConversation (server-backed messages)
// and DemoConversation (the offline preview) — plus the new-chat launcher. Both
// compose the shared primitives from ./arc-messages; the container (arc-view.tsx)
// renders these.

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { ArrowRight, Bookmark, Brain, ClipboardCheck, Copy, CornerUpLeft, MessageSquareText, PencilLine, RotateCcw, ShieldCheck, Target, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { ArcActionCard, ArcAssetStatus, ArcMode, ArcRoute } from "@/domain";
import type { ArcMessage, ArcStep } from "@/lib/arc-chat/persistence";
import { buildArcRunContract, type ArcRunContract } from "@/lib/arc-chat/run-contract";
import { buildArcRunProfile } from "@/lib/arc-chat/run-profile";

import { MARKDOWN_COMPONENTS, REHYPE_HIGHLIGHT_PLUGINS, REMARK_PLUGINS } from "./arc-markdown";
import {
  ArcDraftCard,
  AssistantMessage,
  copyMessageText,
  DraftPackageCard,
  DraftReceiptCard,
  MessageActions,
  operatorMessageBefore,
  OperatorMessage,
  RecallRow,
  RunTrace,
  SourcesRow,
  useMessageContextMenu,
  type MessageMenuItem,
} from "./arc-messages";
import { saveArcMessageAction, saveArcMessageToBrainAction } from "../actions";
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
  { icon: ShieldCheck, label: "Review approvals", prompt: "What's waiting for my approval right now?" },
];

const DEFAULT_FEATURED_WORK = {
  id: "check-signals",
  title: "Check today’s strongest signals",
  urgency: "medium" as const,
  prompt: "What new signals or opportunities should I know about today?",
};

export type OptimisticArcTurn = {
  body: string;
  mode: ArcMode;
  route: ArcRoute;
  contextScopes: string[];
};

function ReviewableWork({ children }: { children: ReactNode }) {
  return (
    <section className="arc-response-output" aria-label="Reviewable work">
      <div className="arc-response-output-label">
        <span><ClipboardCheck size={13} />Created by Arc</span>
        <b>Ready for review</b>
      </div>
      {children}
    </section>
  );
}

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
  const featuredWork = waiting?.items?.[0] ?? DEFAULT_FEATURED_WORK;
  const hasWaitingStatus = Boolean(waiting && (waiting.approvals > 0 || waiting.opportunities > 0));

  return (
    <div className="arc-launcher">
      <h2>{greeting}, {greetName}</h2>
      <p>Start with the work Arc recommends, or choose a focused task below.</p>
      {hasWaitingStatus && waiting ? (
        <div className="arc-launcher-status" aria-label="Workspace status">
          <span>Today</span>
          <div>
            {waiting.approvals > 0 ? (
              <Link href="/campaigns" className="arc-launcher-status-item is-warn">
                <ClipboardCheck size={14} />
                <b>{waiting.approvals}</b> {waiting.approvals === 1 ? "approval" : "approvals"}
              </Link>
            ) : null}
            {waiting.opportunities > 0 ? (
              <Link href="/opportunities" className="arc-launcher-status-item">
                <Zap size={14} />
                <b>{waiting.opportunities}</b> {waiting.opportunities === 1 ? "opportunity" : "opportunities"}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="arc-launcher-focus">
        <span>Recommended next</span>
        <button type="button" onClick={() => pick(featuredWork.prompt)} title={featuredWork.prompt}>
          <i className={`arc-nudge-dot is-${featuredWork.urgency}`} aria-hidden />
          <span><b>{featuredWork.title}</b><small>{featuredWork.prompt}</small></span>
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>
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
  optimisticTurn,
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
  optimisticTurn?: OptimisticArcTurn | null;
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
  const { openMenu, menuElement } = useMessageContextMenu();

  if (messages.length === 0 && !optimisticTurn) {
    return <ArcLauncher greetName={operatorName} waiting={waiting} onPick={onSuggestion} />;
  }

  // While a reply is in flight, hide edit/regenerate — the turn is already running.
  const awaitingReply = Boolean(optimisticTurn) || messages.some((message) => message.status === "pending" || (message.role === "arc" && !message.body.trim()));
  const lastIndex = messages.length - 1;

  const arcMenuItems = (message: ArcMessage, index: number): MessageMenuItem[] => {
    const sourcePrompt = operatorMessageBefore(messages, index);
    const items: MessageMenuItem[] = [
      { kind: "item", label: "Copy message", icon: <Copy size={14} />, onSelect: () => copyMessageText(message.body) },
      { kind: "separator" },
      { kind: "item", label: "Save to library", icon: <Bookmark size={14} />, onSelect: async () => { const result = await saveArcMessageAction(message.id); return result.ok ? "Saved to your Arc library" : result.error; } },
      { kind: "item", label: "Save to Brain", icon: <Brain size={14} />, onSelect: async () => { const result = await saveArcMessageToBrainAction(message.id); return result.ok ? "Remembered in the Brain" : result.error; } },
    ];
    if (index === lastIndex && !awaitingReply) {
      items.push({ kind: "separator" }, { kind: "item", label: "Regenerate response", icon: <RotateCcw size={14} />, onSelect: () => onRegenerate(message.id) });
    } else if (sourcePrompt) {
      items.push({ kind: "separator" }, { kind: "item", label: "Ask this again", icon: <RotateCcw size={14} />, disabled: awaitingReply, hint: awaitingReply ? "Run in progress" : undefined, onSelect: () => { onSuggestion(sourcePrompt.body); return "Added to the composer"; } });
    }
    return items;
  };

  const operatorMenuItems = (message: ArcMessage, startEdit: (() => void) | null): MessageMenuItem[] => [
    { kind: "item", label: "Copy message", icon: <Copy size={14} />, onSelect: () => copyMessageText(message.body) },
    { kind: "separator" },
    { kind: "item", label: "Edit & resend", icon: <PencilLine size={14} />, disabled: !startEdit, hint: startEdit ? undefined : "Run in progress", onSelect: () => startEdit?.() },
    { kind: "item", label: "Use as new message", icon: <CornerUpLeft size={14} />, onSelect: () => { onSuggestion(message.body); return "Added to the composer"; } },
  ];

  return (
    <>
      {messages.map((message, index) => {
        if (message.role === "operator") return <OperatorMessage key={message.id} body={message.body} timeIso={message.createdAt} attachments={message.attachments} onEdit={awaitingReply ? undefined : (newBody) => onEdit(message.id, newBody)} onContextMenu={(event, helpers) => openMenu(event, operatorMenuItems(message, helpers.startEdit))} />;
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
          <AssistantMessage key={message.id} timeIso={message.createdAt} active={pending} onContextMenu={pending ? undefined : (event) => openMenu(event, arcMenuItems(message, index))}>
            <RunTrace pending={pending} liveText={pending ? message.body : null} reasoning={message.reasoning} steps={message.steps} toolCalls={message.toolCalls} contract={contract} thoughtSeconds={thoughtSeconds} onStop={pending && message.agentTaskId ? () => onCancelRun(message.agentTaskId as string, message.conversationId) : undefined} stopping={stoppingTaskId === message.agentTaskId} outcome={message.status === "failed" ? (message.body.startsWith("Stopped by you") ? "canceled" : "failed") : "complete"} />
            {!pending ? <div className="arc-markdown"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_HIGHLIGHT_PLUGINS} components={MARKDOWN_COMPONENTS}>{message.body}</ReactMarkdown></div> : null}
            {!pending && (message.mentions.length || message.recall?.length) ? (
              <div className="arc-response-evidence">
                {message.mentions.length ? <SourcesRow mentions={message.mentions} /> : null}
                {message.recall?.length ? <RecallRow recall={message.recall} /> : null}
              </div>
            ) : null}
            {!pending && message.actions.length ? (() => {
              const approvalCards = message.actions.filter((card) => card.approval);
              const otherCards = message.actions.filter((card) => !card.approval);
              return (
                <>
                  {otherCards.length ? <div className="arc-action-list">{otherCards.map((card, index) => <ArcDraftCard card={card} key={`${card.title}-${index}`} />)}</div> : null}
                  {approvalCards.length ? (
                    <ReviewableWork>
                      {approvalCards.length === 1 ? <DraftReceiptCard card={approvalCards[0]!} status={assetStatuses[approvalCards[0]!.approval?.assetId ?? ""] ?? approvalCards[0]!.status ?? null} onReview={() => onReview(approvalCards)} /> : null}
                      {approvalCards.length >= 2 ? <DraftPackageCard cards={approvalCards} statuses={assetStatuses} onReview={() => onReview(approvalCards)} /> : null}
                    </ReviewableWork>
                  ) : null}
                </>
              );
            })() : null}
            {!pending && message.suggestions.length ? <div className="arc-suggestions">{message.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div> : null}
            {!pending ? <MessageActions message={message} onRegenerate={!awaitingReply && index === lastIndex ? () => onRegenerate(message.id) : undefined} /> : null}
          </AssistantMessage>
        );
      })}
      {optimisticTurn ? (
        <>
          <OperatorMessage body={optimisticTurn.body} />
          <AssistantMessage active>
            <RunTrace
              pending
              contract={buildArcRunContract({
                mode: optimisticTurn.mode,
                route: optimisticTurn.route,
                contextScopes: optimisticTurn.contextScopes,
              })}
            />
          </AssistantMessage>
        </>
      ) : null}
      {menuElement}
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
  const { openMenu, menuElement } = useMessageContextMenu();

  // Same menu as the live conversation, with backend-writing items visibly
  // disabled instead of silently absent — the preview should show the feature.
  const demoArcItems = (body: string, sourcePrompt?: string): MessageMenuItem[] => {
    const items: MessageMenuItem[] = [
      { kind: "item", label: "Copy message", icon: <Copy size={14} />, onSelect: () => copyMessageText(body) },
      { kind: "separator" },
      { kind: "item", label: "Save to library", icon: <Bookmark size={14} />, disabled: true, hint: "Preview only", onSelect: () => null },
      { kind: "item", label: "Save to Brain", icon: <Brain size={14} />, disabled: true, hint: "Preview only", onSelect: () => null },
    ];
    if (sourcePrompt) {
      items.push({ kind: "separator" }, { kind: "item", label: "Ask this again", icon: <RotateCcw size={14} />, disabled: pending, hint: pending ? "Run in progress" : undefined, onSelect: () => onEditResend(sourcePrompt) });
    }
    return items;
  };
  const demoOperatorItems = (body: string, startEdit: (() => void) | null): MessageMenuItem[] => [
    { kind: "item", label: "Copy message", icon: <Copy size={14} />, onSelect: () => copyMessageText(body) },
    { kind: "separator" },
    { kind: "item", label: "Edit & resend", icon: <PencilLine size={14} />, disabled: !startEdit, hint: startEdit ? undefined : "Run in progress", onSelect: () => startEdit?.() },
    { kind: "item", label: "Resend", icon: <CornerUpLeft size={14} />, disabled: pending, hint: pending ? "Run in progress" : undefined, onSelect: () => onEditResend(body) },
  ];
  const operatorMenu = (body: string) => (event: React.MouseEvent, helpers: { startEdit: (() => void) | null }) =>
    openMenu(event, demoOperatorItems(body, helpers.startEdit));

  return (
    <>
      {includeSeed ? (
        <>
          <div className="arc-day"><span>July 14, 2026</span></div>
          <OperatorMessage time="9:34 AM" body="Here’s a reference photo from our last storm job — match this look in the creative." attachments={DEMO_ATTACHMENTS} onEdit={editable} onContextMenu={operatorMenu("Here’s a reference photo from our last storm job — match this look in the creative.")} />
          <OperatorMessage time="9:35 AM" body="Which homeowners should we reach first after the Naperville hailstorm?" onEdit={editable} onContextMenu={operatorMenu("Which homeowners should we reach first after the Naperville hailstorm?")} />
          <AssistantMessage time="9:38 AM" onContextMenu={(event) => openMenu(event, demoArcItems("142 homes took the heaviest hail and still haven’t booked an inspection.", "Which homeowners should we reach first after the Naperville hailstorm?"))}>
            <div className="arc-answer">
              <h2>142 homes took the heaviest hail and still haven’t booked an inspection.</h2>
              <p>That’s 23% of the storm zone and about $1.4M in estimated restoration work. The clearest urgency signals across them:</p>
              <ul><li>Sit in the <b>worst-hit hail swath</b>, with no inspection on file — <b>3.1× more likely</b> to have hidden damage</li><li>No inspection booked in the six days since the storm</li><li>Roof age 8+ years or prior claim history</li></ul>
            </div>
            <RunTrace pending={false} thoughtSeconds={8} reasoning="I combined the storm footprint with property condition and recent CRM activity, then favored an inspection-first message because it performed better than discount-led outreach." steps={DEMO_STEPS} toolCalls={DEMO_TOOLS} contract={buildArcRunContract({ mode: "act", route: "standard", contextScopes: ["workspace", "crm", "campaigns"], toolCount: DEMO_TOOLS.length, agentTaskId: "DEMO-142-HOMES" })} />
            <div className="arc-response-evidence">
              <SourcesRow mentions={DEMO_SOURCES} />
              <RecallRow recall={DEMO_RECALL} />
            </div>
          </AssistantMessage>
          <AssistantMessage time="9:40 AM" onContextMenu={(event) => openMenu(event, demoArcItems(DEMO_BREAKDOWN_MD))}>
            <div className="arc-markdown"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_HIGHLIGHT_PLUGINS} components={MARKDOWN_COMPONENTS}>{DEMO_BREAKDOWN_MD}</ReactMarkdown></div>
          </AssistantMessage>
          <AssistantMessage time="9:42 AM" onContextMenu={(event) => openMenu(event, demoArcItems("I built the Storm Rapid Response package for the 142 highest-urgency homes."))}>
            <div className="arc-answer"><p>I built the Storm Rapid Response package for the 142 highest-urgency homes.</p></div>
            <ReviewableWork><DraftPackageCard cards={DEMO_PACKAGE_CARDS} statuses={packageStatuses} onReview={() => onReview(DEMO_PACKAGE_CARDS)} /></ReviewableWork>
          </AssistantMessage>
          <OperatorMessage time="9:44 AM" body="Looks good. Draft the email." onEdit={editable} onContextMenu={operatorMenu("Looks good. Draft the email.")} />
          <AssistantMessage time="9:45 AM" onContextMenu={(event) => openMenu(event, demoArcItems("The inspection email for the 64 insured, fresh-damage homes is ready for review."))}>
            <div className="arc-answer"><p>The inspection email for the 64 insured, fresh-damage homes is ready for review.</p></div>
            <ReviewableWork><DraftReceiptCard card={DEMO_DRAFT_CARD} status={packageStatuses[DEMO_DRAFT_CARD.approval?.assetId ?? ""] ?? DEMO_DRAFT_CARD.status ?? null} onReview={() => onReview([DEMO_DRAFT_CARD])} /></ReviewableWork>
          </AssistantMessage>
        </>
      ) : null}
      {turns.map((turn, index) => {
        if (turn.role === "operator") return <OperatorMessage key={turn.id} body={turn.body} onEdit={editable} onContextMenu={operatorMenu(turn.body)} />;
        const operatorTurn = [...turns.slice(0, index)].reverse().find((candidate) => candidate.role === "operator");
        const turnContract = buildArcRunContract({ mode: turn.mode, route: "fast", contextScopes: ["workspace", "brand", "crm", "campaigns"], agentTaskId: turn.id });
        const turnProfile = buildArcRunProfile({ request: operatorTurn?.body, mode: turn.mode, command: turn.command, sources: turnContract.readScopes });
        const completedSteps: ArcStep[] = turn.outcome === "canceled"
          ? [{ label: "Stopped before remaining work was applied", status: "done", at: "now", kind: "think" }]
          : turnProfile.phases.map((phase) => ({ label: phase.label, detail: [phase.detail], status: "done", at: "now", kind: phase.kind }));
        return (
          <AssistantMessage key={turn.id} time="now" onContextMenu={(event) => openMenu(event, demoArcItems(turn.body, operatorTurn?.body))}>
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
      {menuElement}
    </>
  );
}


/** One conversation row with an inline options menu (pin / rename / archive /
 *  delete). The row itself opens the conversation; the ⋯ button reveals the menu. */
