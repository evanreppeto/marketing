/**
 * Wake payloads the app POSTs to the bridge. Mirrors `ArcNotifyPayload` in the
 * app (src/lib/arc-chat/notify.ts). Duplicated, not imported, so the bridge
 * stays an independent service. Update here if the app contract changes.
 */

export type ArcMention = { type: string; id: string; label: string; href: string };

export type ArcChatMessagePayload = {
  type: "arc_chat_message";
  messageId: string;
  conversationId: string;
  agentTaskId: string;
  message: string;
  mentions: ArcMention[];
  operator: string;
  route: "fast" | "standard";
  mode: "ask" | "act" | "draft";
  assistantTone?: string;
  assistantResponseStyle?: string;
  approvalStrictness?: string;
  command?: string | null;
  attachments?: unknown[];
};

export type ArcPingPayload = { type: "ping"; workspaceId?: string; nonce?: string; at?: string };

export type WakePayload = ArcChatMessagePayload | ArcPingPayload | { type?: string };
