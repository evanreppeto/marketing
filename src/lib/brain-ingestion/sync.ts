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
  const resolved = await resolve(deps);
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

/** Backfill: upsert a Brain node for every CRM row in the org. Returns counts. */
export async function resyncCrmIntoBrain(deps: SyncDeps = {}): Promise<{ ok: boolean; synced: number; errors: number }> {
  const resolved = await resolve(deps);
  if (!resolved) return { ok: false, synced: 0, errors: 0 };
  const { client, orgId } = resolved;
  let synced = 0;
  let errors = 0;
  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(2000);
    if (error || !Array.isArray(data)) {
      errors++;
      continue;
    }
    for (const row of data as Array<Record<string, unknown>>) {
      const res = await syncCrmRowToBrain(table, row, { client, orgId });
      if (res.ok) synced++;
      else errors++;
    }
  }
  return { ok: true, synced, errors };
}
