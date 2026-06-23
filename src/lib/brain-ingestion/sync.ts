import { buildNodeInputForCrmRow, buildEdgeIntentsForCrmRow, type CrmIngestTable } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { upsertReferenceNode, createEdgeIfAbsent, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const CRM_INGEST_TABLES: CrmIngestTable[] = ["companies", "contacts", "leads", "properties", "jobs", "outcomes"];

type SyncDeps = { client?: TypedSupabaseClient; orgId?: string };

async function resolve(deps: SyncDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

/** Resolve a CRM record's node id by ref (org-scoped). Null if not ingested yet. */
async function resolveNodeIdByRef(
  client: TypedSupabaseClient, orgId: string, refTable: string, refId: string,
): Promise<string | null> {
  const { data } = await client
    .from("knowledge_nodes").select("id")
    .eq("org_id", orgId).eq("ref_table", refTable).eq("ref_id", refId)
    .limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/** Create child->parent edges from a row's FK intents. Skips intents whose target node is missing. */
export async function syncEdgesForCrmRow(
  table: CrmIngestTable, fromNodeId: string, row: Record<string, unknown>, deps: SyncDeps = {},
): Promise<{ created: number; skipped: number }> {
  let resolved;
  try { resolved = await resolve(deps); } catch { resolved = null; }
  if (!resolved) return { created: 0, skipped: 0 };
  const { client, orgId } = resolved;
  let created = 0, skipped = 0;
  for (const intent of buildEdgeIntentsForCrmRow(table, row)) {
    const toNodeId = await resolveNodeIdByRef(client, orgId, intent.toTable, intent.toId);
    if (!toNodeId) { skipped++; continue; }
    const res = await createEdgeIfAbsent({ fromNodeId, toNodeId, relation: intent.relation }, { client, orgId });
    if (res.ok) created++; else skipped++;
  }
  return { created, skipped };
}

/** Upsert a Brain node from an already-read CRM row. Used by backfill + lead ingest. */
export async function syncCrmRowToBrain(
  table: CrmIngestTable,
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<WriteResult> {
  const nodeResult = await upsertReferenceNode(buildNodeInputForCrmRow(table, row), deps);
  if (nodeResult.ok) {
    try { await syncEdgesForCrmRow(table, nodeResult.id, row, deps); } catch { /* ignore */ }
  }
  return nodeResult;
}

/** Read a CRM record (org-scoped, raw row) by id, then upsert its Brain node. */
export async function syncRecordToBrain(table: CrmIngestTable, recordId: string, deps: SyncDeps = {}): Promise<WriteResult> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "org unavailable" }; }
  if (!resolved) return { ok: false, error: "Supabase is not configured." };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("id", recordId)
    .eq("org_id", orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `${table} ${recordId} not found.` };
  return syncCrmRowToBrain(table, data, { client, orgId });
}

/** Max rows pulled per CRM table in one backfill pass. Hitting it sets `truncated`. */
const RESYNC_TABLE_LIMIT = 2000;

/**
 * Backfill: upsert a Brain node for every CRM row in the org. Returns counts.
 * `truncated` is true if any table had more rows than RESYNC_TABLE_LIMIT (so the
 * caller can tell the operator to re-run). `ok` is false if any table failed to read.
 */
export async function resyncCrmIntoBrain(
  deps: SyncDeps = {},
): Promise<{ ok: boolean; syncedNodes: number; syncedEdges: number; errors: number; truncated: boolean }> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { ok: false, syncedNodes: 0, syncedEdges: 0, errors: 0, truncated: false }; }
  if (!resolved) return { ok: false, syncedNodes: 0, syncedEdges: 0, errors: 0, truncated: false };
  const { client, orgId } = resolved;

  let syncedNodes = 0, syncedEdges = 0, errors = 0, truncated = false, tableReadFailed = false;
  const rowsByTable: Partial<Record<CrmIngestTable, Array<Record<string, unknown>>>> = {};

  // Pass 1: nodes (so every edge endpoint exists).
  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(RESYNC_TABLE_LIMIT);
    if (error || !Array.isArray(data)) { tableReadFailed = true; continue; }
    if (data.length >= RESYNC_TABLE_LIMIT) truncated = true;
    const rows = data as Array<Record<string, unknown>>;
    rowsByTable[table] = rows;
    for (const row of rows) {
      if (typeof row.id !== "string") { errors++; continue; }
      const res = await upsertReferenceNode(buildNodeInputForCrmRow(table, row), { client, orgId });
      if (res.ok) syncedNodes++; else errors++;
    }
  }

  // Pass 2: edges (endpoints now exist).
  for (const table of CRM_INGEST_TABLES) {
    for (const row of rowsByTable[table] ?? []) {
      if (typeof row.id !== "string") continue;
      const fromNodeId = await resolveNodeIdByRef(client, orgId, table, row.id);
      if (!fromNodeId) continue;
      const r = await syncEdgesForCrmRow(table, fromNodeId, row, { client, orgId });
      syncedEdges += r.created;
    }
  }

  return { ok: !tableReadFailed, syncedNodes, syncedEdges, errors, truncated };
}
