import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMedia, type MarkMention, parseMedia, parseMentions } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type MarkConversation = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  pinnedAt: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type MarkMessageRole = "operator" | "mark" | "system";
export type MarkMessageStatus = "sent" | "pending" | "complete" | "failed";

export type MarkStep = { label: string; status: "running" | "done"; at: string };

export type MarkMessage = {
  id: string;
  conversationId: string;
  role: MarkMessageRole;
  body: string;
  status: MarkMessageStatus;
  agentTaskId: string | null;
  mentions: MarkMention[];
  media: MarkMedia[];
  steps: MarkStep[];
  createdAt: string;
};

type ConversationRow = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  pinned_at: string | null;
  project_id: string | null;
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

const CONVERSATION_COLUMNS =
  "id, operator, title, status, project_id, pinned_at, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, conversation_id, role, body, status, agent_task_id, mentions, metadata, created_at";

function toConversation(row: ConversationRow): MarkConversation {
  return {
    id: row.id,
    operator: row.operator,
    title: row.title,
    status: row.status,
    pinnedAt: row.pinned_at ?? null,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function parseSteps(value: unknown): MarkStep[] {
  if (!Array.isArray(value)) return [];
  const out: MarkStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    if (typeof label !== "string" || !label.trim()) continue;
    const status = (item as { status?: unknown }).status === "done" ? "done" : "running";
    const at = typeof (item as { at?: unknown }).at === "string" ? (item as { at: string }).at : "";
    out.push({ label, status, at });
  }
  return out;
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
    steps: parseSteps((row.metadata as { steps?: unknown } | null)?.steps),
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
    .order("pinned_at", { ascending: false, nullsFirst: false })
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

// --------------------------------------------------------------------------- #
// Projects (group conversations) + archive helpers
// --------------------------------------------------------------------------- #
export type MarkProject = { id: string; operator: string; name: string; createdAt: string; updatedAt: string };

type ProjectRow = { id: string; operator: string; name: string; created_at: string; updated_at: string };

const PROJECT_COLUMNS = "id, operator, name, created_at, updated_at";

function toProject(row: ProjectRow): MarkProject {
  return { id: row.id, operator: row.operator, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createProject(
  input: { operator: string; name: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkProject> {
  const { data, error } = await client
    .from("mark_projects")
    .insert({ operator: input.operator, name: input.name })
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();
  assertOk("mark_projects insert", error);
  if (!data) throw new Error("mark_projects insert returned no row");
  return toProject(data);
}

export async function listProjects(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkProject[]> {
  const { data, error } = await client
    .from("mark_projects")
    .select(PROJECT_COLUMNS)
    .eq("operator", operator)
    .order("created_at", { ascending: true });
  assertOk("mark_projects list", error);
  return ((data ?? []) as ProjectRow[]).map(toProject);
}

export async function renameProject(
  id: string,
  name: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_projects").update({ name }).eq("id", id);
  assertOk("mark_projects rename", error);
}

export async function assignConversationToProject(
  conversationId: string,
  projectId: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_conversations").update({ project_id: projectId }).eq("id", conversationId);
  assertOk("mark_conversations assign project", error);
}

export async function setConversationPinned(
  id: string,
  pinned: boolean,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("mark_conversations")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  assertOk("mark_conversations pin", error);
}

export async function deleteConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  // mark_messages cascade via the conversation_id FK (on delete cascade).
  const { error } = await client.from("mark_conversations").delete().eq("id", id);
  assertOk("mark_conversations delete", error);
}

/** Deletes the latest pending Mark bubble for a conversation (the "stop generating"
 *  backing op). Returns false (safe no-op) when there's nothing pending. */
export async function cancelPendingMarkMessage(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("mark_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "mark")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("mark_messages cancel lookup", error);
  if (!data) return false;
  const { error: delErr } = await client.from("mark_messages").delete().eq("id", data.id);
  assertOk("mark_messages cancel delete", delErr);
  return true;
}

export async function unarchiveConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("mark_conversations").update({ status: "active" }).eq("id", id);
  assertOk("mark_conversations unarchive", error);
}

export async function listArchivedConversations(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MarkConversation[]> {
  const { data, error } = await client
    .from("mark_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator", operator)
    .eq("status", "archived")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false });
  assertOk("mark_conversations archived list", error);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

// --------------------------------------------------------------------------- #
// Live activity steps (what Mark is doing, shown while a reply is pending)
// --------------------------------------------------------------------------- #
/** Pure: append a step, or flip the matching running step to done (no duplicate). */
export function mergeStep(steps: MarkStep[], step: MarkStep): MarkStep[] {
  if (step.status === "done") {
    const reverseIdx = [...steps].reverse().findIndex((s) => s.label === step.label && s.status === "running");
    if (reverseIdx !== -1) {
      const realIdx = steps.length - 1 - reverseIdx;
      return steps.map((s, i) => (i === realIdx ? step : s));
    }
  }
  return [...steps, step];
}

export async function appendMarkStep(
  input: { agentTaskId: string; label: string; status: "running" | "done"; at: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("mark_messages")
    .select("id, metadata")
    .eq("agent_task_id", input.agentTaskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
  assertOk("mark_messages step lookup", error);
  if (!data) return false;

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const next = mergeStep(parseSteps(meta.steps), {
    label: input.label,
    status: input.status,
    at: input.at,
  });
  const { error: upErr } = await client
    .from("mark_messages")
    .update({ metadata: { ...meta, steps: next } })
    .eq("id", data.id);
  assertOk("mark_messages step update", upErr);
  return true;
}
