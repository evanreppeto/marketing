/**
 * Wake payloads the app POSTs to the runner. Mirrors `MarkNotifyPayload` in the
 * app (src/lib/mark-chat/notify.ts). Duplicated, not imported, so the runner
 * stays an independent service. Update here if the app contract changes.
 */

export type MarkMention = { type: string; id: string; label: string; href: string };

/** One prior turn of the conversation, injected so Arc has memory. */
export type ArcHistoryTurn = { role: "operator" | "arc"; body: string };

type ArcSkillSelection = {
  /** Optional code-defined skill that narrows tools and adds playbook instructions. */
  skillId?: string | null;
};

export type MarkChatMessagePayload = ArcSkillSelection & {
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

/**
 * Wake telling Arc to draft an approval-gated campaign package for an
 * opportunity. `message` is a full briefing used verbatim as the prompt; the
 * draft is linked back via `opportunityId` (threaded into create_campaign_draft).
 */
export type ArcOpportunityDraftPayload = ArcSkillSelection & {
  type: "arc_opportunity_draft";
  opportunityId: string;
  agentTaskId: string;
  message: string;
  leadId: string;
  operator: string;
};

export type ArcOpportunityScanPayload = ArcSkillSelection & {
  type: "arc_opportunity_scan";
  agentTaskId: string;
  message: string;
  operator: string;
};

export type ArcCampaignTaskPayload = ArcSkillSelection & {
  type: "arc_campaign_task";
  agentTaskId: string;
  campaignId: string;
  conversationId: string | null;
  message: string;
  operator: string;
  taskType: "campaign_brief_draft" | "campaign_directive" | "campaign_asset_revision";
};

export type WakePayload =
  | MarkChatMessagePayload
  | MarkPingPayload
  | ArcOpportunityDraftPayload
  | ArcOpportunityScanPayload
  | ArcCampaignTaskPayload
  | { type?: string };

/** Structured cards Arc attaches to a reply (rendered by the app from metadata.actions). */
export type ArcActionRow = { name: string; meta?: string; badge?: string; href?: string };
export type ArcActionFlag = { tone: "ok" | "warn" | "risk"; label: string };
/** Inline approval reference — ONLY valid for an existing campaign asset. */
export type ArcActionApproval = { kind: "campaign"; campaignId: string; assetId: string };

/** A record Arc referenced — renders in the "Sources Arc used" row. Same shape as MarkMention. */
export type ArcMention = MarkMention;

/** A structured question Arc poses to the operator (rendered as an interactive
 *  panel above the composer from metadata.questions). Mirrors the app's ArcQuestion. */
export type ArcQuestion = {
  id: string;
  prompt: string;
  options: string[];
  multi?: boolean;
  allowText?: boolean;
};

/** Media attached to a card (thumbnail + provenance). `url` is required. */
export type ArcMedia = {
  kind: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  poster?: string;
  caption?: string;
  alt?: string;
  href?: string;
  source?: "bsr_real" | "ai_generated" | "composite" | "stock" | "external";
  sourceId?: string;
  jobId?: string;
  model?: string;
  format?: string;
  status?: "draft" | "revision" | "approved" | "rejected";
  riskFlags?: string[];
};

export type ArcActionCard = {
  kind: "result" | "draft";
  title: string;
  href?: string;
  rows: ArcActionRow[];
  flags: ArcActionFlag[];
  preview?: string;
  approval?: ArcActionApproval;
  channel?: string;
  format?: string;
  status?: "draft" | "revision" | "approved" | "rejected";
  media?: ArcMedia;
};
