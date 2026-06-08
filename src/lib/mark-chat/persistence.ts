import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMedia, type MarkMention, parseMedia, parseMentions } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type MarkConversation = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type MarkMessageRole = "operator" | "mark" | "system";
export type MarkMessageStatus = "sent" | "pending" | "complete" | "failed";

export type MarkMessage = {
  id: string;
  conversationId: string;
  role: MarkMessageRole;
  body: string;
  status: MarkMessageStatus;
  agentTaskId: string | null;
  mentions: MarkMention[];
  media: MarkMedia[];
  createdAt: string;
};

type ConversationRow = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: MarkMessageRole;
  body: string;
  status: MarkMessageStatus;
  agent_task_id: string | null;
  mentions: unknown;
  metadata: unknown;
  created_at: string;
};

const CONVERSATION_COLUMNS = "id, operator, title, status, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, conversation_id, role, body, status, agent_task_id, mentions, metadata, created_at";

function toConversation(row: ConversationRow): MarkConversation {
  return {
    id: row.id,
    operator: row.operator,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function toMessage(row: MessageRow): MarkMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    body: row.body,
    status: row.status,
    agentTaskId: row.agent_task_id,
    mentions: parseMentions(row.mentions),
    media: parseMedia((row.metadata as { media?: unknown } | null)?.media),
    createdAt: row.created_at,
  };
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

export async function listConversations(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkConversation[]> {
  const { data, error } = await client
    .from("mark_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator", operator)
    .eq("status", "active")
    .order("last_message_at", { ascending: false });
  assertOk("mark_conversations list", error);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

export async function getConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkConversation | null> {
  const { data, error } = await client
    .from("mark_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<ConversationRow>();
  assertOk("mark_conversations get", error);
  return data ? toConversation(data) : null;
}

export async function createConversation(
  input: { operator: string; title: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkConversation> {
  const { data, error } = await client
    .from("mark_conversations")
    .insert({ operator: input.operator, title: input.title })
    .select(CONVERSATION_COLUMNS)
    .single<ConversationRow>();
  assertOk("mark_conversations insert", error);
  if (!data) throw new Error("mark_conversations insert returned no row");
  return toConversation(data);
}

export async function renameConversation(
  id: string,
  title: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_conversations").update({ title }).eq("id", id);
  assertOk("mark_conversations rename", error);
}

export async function archiveConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_conversations").update({ status: "archived" }).eq("id", id);
  assertOk("mark_conversations archive", error);
}

export async function touchConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);
  assertOk("mark_conversations touch", error);
}

export async function listMessages(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage[]> {
  const { data, error } = await client
    .from("mark_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  assertOk("mark_messages list", error);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

export async function insertOperatorMessage(
  input: { conversationId: string; body: string; mentions: MarkMention[] },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage> {
  const { data, error } = await client
    .from("mark_messages")
    .insert({
      conversation_id: input.conversationId,
      role: "operator",
      body: input.body,
      status: "sent",
      mentions: input.mentions,
    })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("mark_messages operator insert", error);
  if (!data) throw new Error("mark_messages operator insert returned no row");
  return toMessage(data);
}

export async function insertPendingMarkMessage(
  input: { conversationId: string; agentTaskId: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage> {
  const { data, error } = await client
    .from("mark_messages")
    .insert({
      conversation_id: input.conversationId,
      role: "mark",
      body: "",
      status: "pending",
      agent_task_id: input.agentTaskId,
    })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("mark_messages pending insert", error);
  if (!data) throw new Error("mark_messages pending insert returned no row");
  return toMessage(data);
}

export async function insertFailedMarkMessage(
  input: { conversationId: string; body: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage> {
  const { data, error } = await client
    .from("mark_messages")
    .insert({ conversation_id: input.conversationId, role: "mark", body: input.body, status: "failed" })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("mark_messages failed insert", error);
  if (!data) throw new Error("mark_messages failed insert returned no row");
  return toMessage(data);
}

export async function findPendingMessageByTask(
  agentTaskId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkMessage | null> {
  const { data, error } = await client
    .from("mark_messages")
    .select(MESSAGE_COLUMNS)
    .eq("agent_task_id", agentTaskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<MessageRow>();
  assertOk("mark_messages find pending", error);
  return data ? toMessage(data) : null;
}

export async function completeMarkMessage(
  input: { messageId: string; body: string; metadata?: Record<string, unknown> },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_messages")
    .update({ body: input.body, status: "complete", metadata: input.metadata ?? {} })
    .eq("id", input.messageId);
  assertOk("mark_messages complete", error);
}

export async function failMarkMessage(
  input: { messageId: string; body: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_messages")
    .update({ body: input.body, status: "failed" })
    .eq("id", input.messageId);
  assertOk("mark_messages fail", error);
}
