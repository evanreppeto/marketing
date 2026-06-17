import { type SupabaseClient } from "@supabase/supabase-js";

import { type ArcActionCard, type ArcMedia, type ArcMention, type ArcMode, type ArcQuestion, type ArcRoute, parseActions, parseMedia, parseMentions, parseQuestions } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type ArcConversation = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  pinnedAt: string | null;
  projectId: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type ArcMessageRole = "operator" | "arc" | "system";
export type ArcMessageStatus = "sent" | "pending" | "complete" | "failed";

export type ArcStep = { label: string; status: "running" | "done"; at: string; detail?: string[] };

/**
 * A structured tool invocation Arc ran while producing a reply (e.g. find_leads,
 * score_lead, weather_lookup). RUNNER CONTRACT: the agent writes these to
 * `arc_messages.metadata.toolCalls` as `[{ name, status, input?, output? }]`.
 * `input`/`output` are pre-rendered strings (JSON or text) so the app stays
 * agnostic to each tool's shape. Absent on rows the runner hasn't populated.
 */
export type ArcToolCall = {
  name: string;
  status: "running" | "complete" | "error";
  input?: string;
  output?: string;
};

/** An operator-uploaded reference image (lives in GCS; `url` is a signed read URL). */
export type ArcAttachment = { url: string; objectPath: string; contentType: string; name: string };

export type ArcMessage = {
  id: string;
  conversationId: string;
  role: ArcMessageRole;
  body: string;
  status: ArcMessageStatus;
  agentTaskId: string | null;
  mentions: ArcMention[];
  media: ArcMedia[];
  steps: ArcStep[];
  /** Arc's narrative thinking for this reply (agent-provided). Optional: absent
   *  on rows/optimistic messages the runner hasn't populated. */
  reasoning?: string | null;
  /** Structured tool runs Arc executed for this reply (agent-provided). */
  toolCalls?: ArcToolCall[];
  feedback: "up" | "down" | null;
  actions: ArcActionCard[];
  /** Proactive follow-up prompts Arc offers after a reply (agent-provided). */
  suggestions: string[];
  /** Structured questions Arc poses for the operator (agent-provided), rendered
   *  as an interactive panel above the composer. Absent on rows without them. */
  questions?: ArcQuestion[];
  /** Operator-uploaded reference images attached to this message. */
  attachments: ArcAttachment[];
  /** The mode/route this turn was sent with (operator messages); lets Regenerate
   *  reuse the original settings instead of a default. Absent on older rows. */
  mode?: ArcMode;
  route?: ArcRoute;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  operator: string;
  title: string;
  status: "active" | "archived";
  pinned_at: string | null;
  project_id: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ArcMessageRole;
  body: string;
  status: ArcMessageStatus;
  agent_task_id: string | null;
  mentions: unknown;
  metadata: unknown;
  created_at: string;
};

const CONVERSATION_COLUMNS =
  "id, operator, title, status, project_id, campaign_id, pinned_at, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, conversation_id, role, body, status, agent_task_id, mentions, metadata, created_at";

function toConversation(row: ConversationRow): ArcConversation {
  return {
    id: row.id,
    operator: row.operator,
    title: row.title,
    status: row.status,
    pinnedAt: row.pinned_at ?? null,
    projectId: row.project_id ?? null,
    campaignId: row.campaign_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function parseSteps(value: unknown): ArcStep[] {
  if (!Array.isArray(value)) return [];
  const out: ArcStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    if (typeof label !== "string" || !label.trim()) continue;
    const status = (item as { status?: unknown }).status === "done" ? "done" : "running";
    const at = typeof (item as { at?: unknown }).at === "string" ? (item as { at: string }).at : "";
    const rawDetail = (item as { detail?: unknown }).detail;
    const detail = Array.isArray(rawDetail)
      ? rawDetail.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
      : undefined;
    out.push({ label, status, at, detail: detail && detail.length > 0 ? detail : undefined });
  }
  return out;
}

function parseReasoning(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseToolCalls(value: unknown): ArcToolCall[] {
  if (!Array.isArray(value)) return [];
  const out: ArcToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name.trim()) continue;
    const status = o.status === "complete" ? "complete" : o.status === "error" ? "error" : "running";
    out.push({
      name: o.name,
      status,
      input: typeof o.input === "string" ? o.input : undefined,
      output: typeof o.output === "string" ? o.output : undefined,
    });
  }
  return out.slice(0, 12);
}

function parseSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4);
}

function parseAttachments(value: unknown): ArcAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: ArcAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.url === "string" && typeof o.objectPath === "string") {
      out.push({
        url: o.url,
        objectPath: o.objectPath,
        contentType: typeof o.contentType === "string" ? o.contentType : "image/*",
        name: typeof o.name === "string" ? o.name : "image",
      });
    }
  }
  return out.slice(0, 8);
}

/** Parse the composer's serialized attachments payload (a JSON string), safely. */
export function parseArcAttachmentsJson(raw: string): ArcAttachment[] {
  try {
    return parseAttachments(JSON.parse(raw));
  } catch {
    return [];
  }
}

function toMessage(row: MessageRow): ArcMessage {
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
    reasoning: parseReasoning((row.metadata as { reasoning?: unknown } | null)?.reasoning),
    toolCalls: parseToolCalls((row.metadata as { toolCalls?: unknown } | null)?.toolCalls),
    feedback:
      (row.metadata as { feedback?: unknown } | null)?.feedback === "up"
        ? "up"
        : (row.metadata as { feedback?: unknown } | null)?.feedback === "down"
          ? "down"
          : null,
    actions: parseActions((row.metadata as { actions?: unknown } | null)?.actions),
    suggestions: parseSuggestions((row.metadata as { suggestions?: unknown } | null)?.suggestions),
    questions: parseQuestions((row.metadata as { questions?: unknown } | null)?.questions),
    attachments: parseAttachments((row.metadata as { attachments?: unknown } | null)?.attachments),
    mode: parseOptionalMode((row.metadata as { mode?: unknown } | null)?.mode),
    route: parseOptionalRoute((row.metadata as { route?: unknown } | null)?.route),
    createdAt: row.created_at,
  };
}

/** Strict optional parsers — unlike domain's parseArcMode/Route these return
 *  undefined (not a default) when absent, so non-operator rows stay clean. */
function parseOptionalMode(value: unknown): ArcMode | undefined {
  return value === "ask" || value === "act" || value === "draft" ? value : undefined;
}
function parseOptionalRoute(value: unknown): ArcRoute | undefined {
  return value === "fast" || value === "standard" ? value : undefined;
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

export async function listConversations(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcConversation[]> {
  const { data, error } = await client
    .from("arc_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator", operator)
    .eq("status", "active")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false });
  assertOk("arc_conversations list", error);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

/**
 * Conversation ids that currently have an Arc run in flight (queued or running)
 * — powers the cross-thread "Arc is working…" indicators in the sidebar. Reads
 * the agent_tasks queue by the arc-chat source link; cheap distinct scan.
 */
export async function listActiveArcRunConversationIds(
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<string[]> {
  const { data, error } = await client
    .from("agent_tasks")
    .select("source_id")
    .eq("task_type", "arc_chat_message")
    .eq("source_type", "arc_conversation")
    .in("status", ["queued", "running"]);
  assertOk("agent_tasks active arc runs", error);
  const ids = new Set<string>();
  for (const row of (data ?? []) as { source_id: string | null }[]) {
    if (row.source_id) ids.add(row.source_id);
  }
  return [...ids];
}

export type ArcRunStatus =
  | "queued"
  | "running"
  | "blocked"
  | "needs_approval"
  | "completed"
  | "failed"
  | "canceled";

export type ArcRun = {
  taskId: string;
  conversationId: string | null;
  title: string | null;
  status: ArcRunStatus;
  objective: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type ArcRunRow = {
  id: string;
  status: ArcRunStatus;
  objective: string | null;
  source_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

/**
 * Recent Arc chat runs across all conversations (newest activity first) — feeds
 * the global Runs view. Reads the agent_tasks queue and resolves each run's
 * conversation title in a second batched lookup.
 */
export async function listRecentArcRuns(
  limit = 30,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcRun[]> {
  const { data, error } = await client
    .from("agent_tasks")
    .select("id, status, objective, source_id, created_at, started_at, completed_at")
    .eq("task_type", "arc_chat_message")
    .eq("source_type", "arc_conversation")
    .order("updated_at", { ascending: false })
    .limit(limit);
  assertOk("agent_tasks recent arc runs", error);
  const rows = (data ?? []) as ArcRunRow[];

  const convIds = [...new Set(rows.map((r) => r.source_id).filter((id): id is string => Boolean(id)))];
  const titles = new Map<string, string>();
  if (convIds.length > 0) {
    const { data: convs, error: convErr } = await client
      .from("arc_conversations")
      .select("id, title")
      .in("id", convIds);
    assertOk("arc_conversations run titles", convErr);
    for (const c of (convs ?? []) as { id: string; title: string }[]) titles.set(c.id, c.title);
  }

  return rows.map((r) => ({
    taskId: r.id,
    conversationId: r.source_id,
    title: r.source_id ? titles.get(r.source_id) ?? null : null,
    status: r.status,
    objective: r.objective,
    createdAt: r.created_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

export async function getConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcConversation | null> {
  const { data, error } = await client
    .from("arc_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<ConversationRow>();
  assertOk("arc_conversations get", error);
  return data ? toConversation(data) : null;
}

export async function createConversation(
  input: { operator: string; title: string; projectId?: string | null },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcConversation> {
  const { data, error } = await client
    .from("arc_conversations")
    .insert({ operator: input.operator, title: input.title, project_id: input.projectId ?? null })
    .select(CONVERSATION_COLUMNS)
    .single<ConversationRow>();
  assertOk("arc_conversations insert", error);
  if (!data) throw new Error("arc_conversations insert returned no row");
  return toConversation(data);
}

export async function renameConversation(
  id: string,
  title: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ title }).eq("id", id);
  assertOk("arc_conversations rename", error);
}

export async function archiveConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ status: "archived" }).eq("id", id);
  assertOk("arc_conversations archive", error);
}

export async function touchConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);
  assertOk("arc_conversations touch", error);
}

export async function listMessages(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage[]> {
  const { data, error } = await client
    .from("arc_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  assertOk("arc_messages list", error);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

/**
 * Every asset-bearing Arc message from the OTHER active conversations in a
 * project — the source for the Studio's project-wide Assets library. The active
 * conversation is excluded (its messages already arrive live), and messages
 * without action cards are dropped so the payload stays small.
 */
export async function listProjectAssetMessages(
  projectId: string,
  operator: string,
  options: { excludeConversationId?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage[]> {
  const { data: convRows, error: convErr } = await client
    .from("arc_conversations")
    .select("id")
    .eq("operator", operator)
    .eq("project_id", projectId)
    .eq("status", "active");
  assertOk("arc_conversations project list", convErr);

  const ids = ((convRows ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => id !== options.excludeConversationId);
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("arc_messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", ids)
    .eq("role", "arc")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  assertOk("arc_messages project assets list", error);

  return ((data ?? []) as MessageRow[]).map(toMessage).filter((m) => m.actions.length > 0);
}

export async function insertOperatorMessage(
  input: {
    conversationId: string;
    body: string;
    mentions: ArcMention[];
    attachments?: ArcAttachment[];
    mode?: ArcMode;
    route?: ArcRoute;
  },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage> {
  const metadata: Record<string, unknown> = {};
  if (input.attachments && input.attachments.length > 0) metadata.attachments = input.attachments;
  if (input.mode) metadata.mode = input.mode;
  if (input.route) metadata.route = input.route;
  const { data, error } = await client
    .from("arc_messages")
    .insert({
      conversation_id: input.conversationId,
      role: "operator",
      body: input.body,
      status: "sent",
      mentions: input.mentions,
      metadata,
    })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("arc_messages operator insert", error);
  if (!data) throw new Error("arc_messages operator insert returned no row");
  return toMessage(data);
}

export async function insertPendingArcMessage(
  input: { conversationId: string; agentTaskId: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage> {
  const { data, error } = await client
    .from("arc_messages")
    .insert({
      conversation_id: input.conversationId,
      role: "arc",
      body: "",
      status: "pending",
      agent_task_id: input.agentTaskId,
    })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("arc_messages pending insert", error);
  if (!data) throw new Error("arc_messages pending insert returned no row");
  return toMessage(data);
}

export async function insertFailedArcMessage(
  input: { conversationId: string; body: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage> {
  const { data, error } = await client
    .from("arc_messages")
    .insert({ conversation_id: input.conversationId, role: "arc", body: input.body, status: "failed" })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  assertOk("arc_messages failed insert", error);
  if (!data) throw new Error("arc_messages failed insert returned no row");
  return toMessage(data);
}

export async function findPendingMessageByTask(
  agentTaskId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMessage | null> {
  const { data, error } = await client
    .from("arc_messages")
    .select(MESSAGE_COLUMNS)
    .eq("agent_task_id", agentTaskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<MessageRow>();
  assertOk("arc_messages find pending", error);
  return data ? toMessage(data) : null;
}

export async function completeArcMessage(
  input: { messageId: string; body: string; metadata?: Record<string, unknown>; mentions?: ArcMention[] },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const update: Record<string, unknown> = {
    body: input.body,
    status: "complete",
    metadata: input.metadata ?? {},
  };
  // Only set mentions when provided so callers that omit it don't clobber the column.
  if (input.mentions !== undefined) update.mentions = input.mentions;
  const { error } = await client.from("arc_messages").update(update).eq("id", input.messageId);
  assertOk("arc_messages complete", error);
}

export async function failArcMessage(
  input: { messageId: string; body: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_messages")
    .update({ body: input.body, status: "failed" })
    .eq("id", input.messageId);
  assertOk("arc_messages fail", error);
}

// --------------------------------------------------------------------------- #
// Projects (group conversations) + archive helpers
// --------------------------------------------------------------------------- #
export type ArcProject = { id: string; operator: string; name: string; createdAt: string; updatedAt: string };

type ProjectRow = { id: string; operator: string; name: string; created_at: string; updated_at: string };

const PROJECT_COLUMNS = "id, operator, name, created_at, updated_at";

function toProject(row: ProjectRow): ArcProject {
  return { id: row.id, operator: row.operator, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createProject(
  input: { operator: string; name: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcProject> {
  const { data, error } = await client
    .from("arc_projects")
    .insert({ operator: input.operator, name: input.name })
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();
  assertOk("arc_projects insert", error);
  if (!data) throw new Error("arc_projects insert returned no row");
  return toProject(data);
}

export async function listProjects(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcProject[]> {
  const { data, error } = await client
    .from("arc_projects")
    .select(PROJECT_COLUMNS)
    .eq("operator", operator)
    .order("created_at", { ascending: true });
  assertOk("arc_projects list", error);
  return ((data ?? []) as ProjectRow[]).map(toProject);
}

export async function renameProject(
  id: string,
  name: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_projects").update({ name }).eq("id", id);
  assertOk("arc_projects rename", error);
}

export async function assignConversationToProject(
  conversationId: string,
  projectId: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ project_id: projectId }).eq("id", conversationId);
  assertOk("arc_conversations assign project", error);
}

export async function assignConversationToCampaign(
  conversationId: string,
  campaignId: string | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ campaign_id: campaignId }).eq("id", conversationId);
  assertOk("arc_conversations assign campaign", error);
}

export async function setConversationPinned(
  id: string,
  pinned: boolean,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client
    .from("arc_conversations")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  assertOk("arc_conversations pin", error);
}

export async function deleteConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  // arc_messages cascade via the conversation_id FK (on delete cascade).
  const { error } = await client.from("arc_conversations").delete().eq("id", id);
  assertOk("arc_conversations delete", error);
}

/** Deletes the latest pending Arc bubble for a conversation (the "stop generating"
 *  backing op). Returns false (safe no-op) when there's nothing pending. */
export async function cancelPendingArcMessage(
  conversationId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "arc")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("arc_messages cancel lookup", error);
  if (!data) return false;
  const { error: delErr } = await client.from("arc_messages").delete().eq("id", data.id);
  assertOk("arc_messages cancel delete", delErr);
  return true;
}

export async function unarchiveConversation(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("arc_conversations").update({ status: "active" }).eq("id", id);
  assertOk("arc_conversations unarchive", error);
}

export async function listArchivedConversations(
  operator: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcConversation[]> {
  const { data, error } = await client
    .from("arc_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator", operator)
    .eq("status", "archived")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false });
  assertOk("arc_conversations archived list", error);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

// --------------------------------------------------------------------------- #
// Live activity steps (what Arc is doing, shown while a reply is pending)
// --------------------------------------------------------------------------- #
/** Pure: append a step, or flip the matching running step to done (no duplicate). */
export function mergeStep(steps: ArcStep[], step: ArcStep): ArcStep[] {
  if (step.status === "done") {
    const reverseIdx = [...steps].reverse().findIndex((s) => s.label === step.label && s.status === "running");
    if (reverseIdx !== -1) {
      const realIdx = steps.length - 1 - reverseIdx;
      return steps.map((s, i) => (i === realIdx ? step : s));
    }
  }
  return [...steps, step];
}

export async function appendArcStep(
  input: { agentTaskId: string; label: string; status: "running" | "done"; at: string },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id, metadata")
    .eq("agent_task_id", input.agentTaskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
  assertOk("arc_messages step lookup", error);
  if (!data) return false;

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const next = mergeStep(parseSteps(meta.steps), {
    label: input.label,
    status: input.status,
    at: input.at,
  });
  const { error: upErr } = await client
    .from("arc_messages")
    .update({ metadata: { ...meta, steps: next } })
    .eq("id", data.id);
  assertOk("arc_messages step update", upErr);
  return true;
}

export async function setArcMessageFeedback(
  messageId: string,
  value: "up" | "down" | null,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id, metadata")
    .eq("id", messageId)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
  assertOk("arc_messages feedback lookup", error);
  if (!data) return;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const { error: upErr } = await client
    .from("arc_messages")
    .update({ metadata: { ...meta, feedback: value } })
    .eq("id", messageId);
  assertOk("arc_messages feedback update", upErr);
}

/**
 * Update the body of an operator message in place (for the edit-and-resend
 * flow). Guarded to `role = "operator"` so an arc/system row can never be
 * rewritten, and records a light edit audit in metadata. Returns false when no
 * matching operator row exists.
 */
export async function updateOperatorMessageBody(
  messageId: string,
  body: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("arc_messages")
    .select("id, role, metadata")
    .eq("id", messageId)
    .maybeSingle<{ id: string; role: string; metadata: Record<string, unknown> | null }>();
  assertOk("arc_messages edit lookup", error);
  if (!data || data.role !== "operator") return false;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const editCount = typeof meta.editCount === "number" ? meta.editCount : 0;
  const { error: upErr } = await client
    .from("arc_messages")
    .update({ body, metadata: { ...meta, editedAt: new Date().toISOString(), editCount: editCount + 1 } })
    .eq("id", messageId)
    .eq("role", "operator");
  assertOk("arc_messages edit update", upErr);
  return true;
}
