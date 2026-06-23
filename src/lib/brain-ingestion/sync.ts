import { buildNodeInputForCrmRow, type CrmIngestTable } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { upsertReferenceNode, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const CRM_INGEST_TABLES: CrmIngestTable[] = ["companies", "contacts", "leads", "properties", "jobs", "outcomes"];

type SyncDeps = { client?: TypedSupabaseClient; orgId?: string };

async function resolve(deps: SyncDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

/** Upsert a Brain node from an already-read CRM row. Used by backfill + lead ingest. */
export async function syncCrmRowToBrain(
  table: CrmIngestTable,
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<WriteResult> {
  return upsertReferenceNode(buildNodeInputForCrmRow(table, row), deps);
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
): Promise<{ ok: boolean; synced: number; errors: number; truncated: boolean }> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { ok: false, synced: 0, errors: 0, truncated: false }; }
  if (!resolved) return { ok: false, synced: 0, errors: 0, truncated: false };
  const { client, orgId } = resolved;

  let synced = 0;
  let errors = 0;
  let truncated = false;
  let tableReadFailed = false;

  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(RESYNC_TABLE_LIMIT);
    if (error || !Array.isArray(data)) { tableReadFailed = true; continue; }
    if (data.length >= RESYNC_TABLE_LIMIT) truncated = true;
    for (const row of data as Array<Record<string, unknown>>) {
      if (typeof row.id !== "string") { errors++; continue; }
      const res = await syncCrmRowToBrain(table, row, { client, orgId });
      if (res.ok) synced++; else errors++;
    }
  }
  return { ok: !tableReadFailed, synced, errors, truncated };
}
