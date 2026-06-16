/**
 * Wake payloads the app POSTs to the runner. Mirrors `MarkNotifyPayload` in the
 * app (src/lib/mark-chat/notify.ts). Duplicated, not imported, so the runner
 * stays an independent service. Update here if the app contract changes.
 */

export type MarkMention = { type: string; id: string; label: string; href: string };

/** One prior turn of the conversation, injected so Arc has memory. */
export type ArcHistoryTurn = { role: "operator" | "arc"; body: string };

export type MarkChatMessagePayload = {
  type: "arc_chat_message";
  messageId: string;
  conversationId: string;
  /** The conversation's project, if any — enables project-scoped context. */
  projectId: string | null;
  /** The conversation's linked campaign, if any — grounds the chat. */
  campaignId: string | null;
  /** The queued agent_task Arc settles when it posts its reply back. */
  agentTaskId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
  route: "fast" | "standard";
  mode: "ask" | "act" | "draft";
  assistantTone?: string;
  assistantResponseStyle?: string;
  approvalStrictness?: string;
  command?: string | null;
  attachments?: unknown[];
  /** Bounded prior turns (oldest → newest), excluding the current message. */
  history?: ArcHistoryTurn[];
};

export type MarkPingPayload = { type: "ping"; workspaceId?: string; nonce?: string; at?: string };

export type WakePayload = MarkChatMessagePayload | MarkPingPayload | { type?: string };
