/**
 * Wake payloads the app POSTs to the bridge. Mirrors `MarkNotifyPayload` in the
 * app (src/lib/mark-chat/notify.ts). Duplicated, not imported, so the bridge
 * stays an independent service. Update here if the app contract changes.
 */

export type MarkMention = { type: string; id: string; label: string; href: string };

export type MarkChatMessagePayload = {
  type: "mark_chat_message";
  messageId: string;
  conversationId: string;
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
};

export type MarkPingPayload = { type: "ping"; workspaceId?: string; nonce?: string; at?: string };

export type WakePayload = MarkChatMessagePayload | MarkPingPayload | { type?: string };
