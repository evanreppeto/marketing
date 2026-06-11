import { type SupabaseClient } from "@supabase/supabase-js";

import type { CampaignDriver } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type AgentTaskRow = {
  id: string;
  status: string | null;
  priority: string | null;
  objective: string | null;
  task_type: string | null;
  scheduled_for: string | null;
  due_at: string | null;
  metadata: unknown;
  updated_at: string | null;
};

export type CampaignTask = {
  id: string;
  fullId: string;
  objective: string;
  status: string;
  priority: string;
  driver: CampaignDriver;
  href: string;
};

function titleize(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pure: map an agent_tasks row to the campaign Work-lane card shape. A task in
 *  `needs_approval` is the operator's to act on; everything else is Mark's. */
export function toCampaignTask(row: AgentTaskRow): CampaignTask {
  const status = row.status ?? "queued";
  return {
    id: row.id.slice(0, 8),
    fullId: row.id,
    objective: row.objective ?? "Untitled task",
    status,
    priority: titleize(row.priority, "Medium"),
    driver: status === "needs_approval" ? "operator" : "agent",
    href: `/agent-operations/tasks/${row.id}`,
  };
}

export type CampaignThread = {
  id: string;
  title: string;
  updatedAt: string | null;
  href: string;
};

/** I/O: every board task linked to this campaign, newest first. */
export async function getCampaignTasks(
  campaignId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CampaignTask[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const { data, error } = await client
    .from("agent_tasks")
    .select("id, status, priority, objective, task_type, scheduled_for, due_at, metadata, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .returns<AgentTaskRow[]>();
  if (error) throw new Error(`campaign tasks query failed: ${error.message}`);
  return (data ?? []).map(toCampaignTask);
}

/** I/O: Mark conversations linked to this campaign, newest first.
 *  The /mark page opens a conversation via the `?c=` query param. */
export async function getCampaignThreads(
  campaignId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CampaignThread[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const { data, error } = await client
    .from("mark_conversations")
    .select("id, title, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .returns<Array<{ id: string; title: string | null; updated_at: string | null }>>();
  if (error) throw new Error(`campaign threads query failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled thread",
    updatedAt: r.updated_at,
    href: `/mark?c=${r.id}`,
  }));
}
