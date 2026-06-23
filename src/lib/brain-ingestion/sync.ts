import {
  buildEdgesForCampaign,
  buildEdgesForCrmRow,
  buildNodeInputForCampaign,
  buildNodeInputForCrmRow,
  type CrmEdgeSpec,
  type CrmIngestTable,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { upsertReferenceEdge, upsertReferenceNode, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const CRM_INGEST_TABLES: CrmIngestTable[] = ["companies", "contacts", "leads", "properties", "jobs", "outcomes"];

type SyncDeps = { client?: TypedSupabaseClient; orgId?: string };

async function resolve(deps: SyncDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

/**
 * `campaigns.org_id` exists at runtime (migration 20260619113000) but is missing
 * from the stale generated types, so a direct `.eq("org_id", …)` fails tsc. Cast
 * to scope by org, mirroring the campaigns read-model's applyOrgScope.
 */
function eqOrg<T>(query: T, orgId: string): T {
  return (query as unknown as { eq(column: string, value: string): T }).eq("org_id", orgId);
}

/**
 * Resolve a batch of (kind,key)-addressed edge specs to node ids in one query and
 * idempotently upsert each edge. Ends whose node doesn't exist yet are skipped —
 * a backfill's second pass (after all nodes exist) is the completeness backstop.
 * Shared by CRM-row and campaign linking. Best-effort; never throws.
 */
async function linkEdgeSpecs(specs: CrmEdgeSpec[], deps: SyncDeps): Promise<{ linked: number; skipped: number }> {
  if (specs.length === 0) return { linked: 0, skipped: 0 };

  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { linked: 0, skipped: specs.length }; }
  if (!resolved) return { linked: 0, skipped: specs.length };
  const { client, orgId } = resolved;

  const keys = Array.from(new Set(specs.flatMap((s) => [s.fromKey, s.toKey])));
  const { data, error } = await client.from("knowledge_nodes").select("id,key").eq("org_id", orgId).in("key", keys);
  if (error || !Array.isArray(data)) return { linked: 0, skipped: specs.length };

  const idByKey = new Map<string, string>();
  for (const r of data as Array<{ id: string; key: string }>) idByKey.set(r.key, r.id);

  let linked = 0;
  let skipped = 0;
  for (const s of specs) {
    const from = idByKey.get(s.fromKey);
    const to = idByKey.get(s.toKey);
    if (!from || !to || from === to) { skipped++; continue; }
    const res = await upsertReferenceEdge(from, to, s.relation, { client, orgId });
    if (res.ok) linked++; else skipped++;
  }
  return { linked, skipped };
}

/** Upsert a Brain node from an already-read CRM row. Used by backfill + lead ingest. */
export async function syncCrmRowToBrain(
  table: CrmIngestTable,
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<WriteResult> {
  return upsertReferenceNode(buildNodeInputForCrmRow(table, row), deps);
}

/**
 * Link a CRM row's node to its related nodes (FK parents via belongs_to, persona
 * via targets). Resolves the (kind,key) ends to node ids in one query, then
 * idempotently upserts each edge. Targets that don't have a node yet are skipped
 * — the backfill's second pass (after all nodes exist) is the completeness
 * backstop. Best-effort by design; never throws.
 */
export async function syncCrmRowEdges(
  table: CrmIngestTable,
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<{ linked: number; skipped: number }> {
  return linkEdgeSpecs(buildEdgesForCrmRow(table, row), deps);
}

// --- Campaigns → Brain (slice 4) ------------------------------------------

/** Upsert a Brain node from an already-read `campaigns` row. */
export async function syncCampaignToBrain(row: Record<string, unknown>, deps: SyncDeps = {}): Promise<WriteResult> {
  return upsertReferenceNode(buildNodeInputForCampaign(row), deps);
}

/** Link a campaign's node to its persona (targets) and CRM records (relates_to). */
export async function syncCampaignEdges(
  row: Record<string, unknown>,
  deps: SyncDeps = {},
): Promise<{ linked: number; skipped: number }> {
  return linkEdgeSpecs(buildEdgesForCampaign(row), deps);
}

/**
 * Read a campaign (org-scoped) by id, upsert its Brain node, then link its edges
 * (best-effort). Call this after creating/updating a campaign so it mirrors in.
 */
export async function syncCampaignRecordToBrain(campaignId: string, deps: SyncDeps = {}): Promise<WriteResult> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "org unavailable" }; }
  if (!resolved) return { ok: false, error: "Supabase is not configured." };
  const { client, orgId } = resolved;
  const { data, error } = await eqOrg(client.from("campaigns").select("*").eq("id", campaignId), orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `campaign ${campaignId} not found.` };
  const nodeResult = await syncCampaignToBrain(data, { client, orgId });
  await syncCampaignEdges(data, { client, orgId }).catch(() => undefined);
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
  const nodeResult = await syncCrmRowToBrain(table, data, { client, orgId });
  // Best-effort linking: a missing parent or edge hiccup must never fail the node write.
  await syncCrmRowEdges(table, data, { client, orgId }).catch(() => undefined);
  return nodeResult;
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
): Promise<{ ok: boolean; synced: number; linked: number; errors: number; truncated: boolean }> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { ok: false, synced: 0, linked: 0, errors: 0, truncated: false }; }
  if (!resolved) return { ok: false, synced: 0, linked: 0, errors: 0, truncated: false };
  const { client, orgId } = resolved;

  let synced = 0;
  let linked = 0;
  let errors = 0;
  let truncated = false;
  let tableReadFailed = false;

  // Pass 1: upsert a node for every row, keeping the rows for the edge pass.
  const pulled: Array<{ table: CrmIngestTable; rows: Array<Record<string, unknown>> }> = [];
  for (const table of CRM_INGEST_TABLES) {
    const { data, error } = await client.from(table).select("*").eq("org_id", orgId).limit(RESYNC_TABLE_LIMIT);
    if (error || !Array.isArray(data)) { tableReadFailed = true; continue; }
    if (data.length >= RESYNC_TABLE_LIMIT) truncated = true;
    const rows = data as Array<Record<string, unknown>>;
    pulled.push({ table, rows });
    for (const row of rows) {
      if (typeof row.id !== "string") { errors++; continue; }
      const res = await syncCrmRowToBrain(table, row, { client, orgId });
      if (res.ok) synced++; else errors++;
    }
  }

  // Pass 2: link edges now that every referenced node exists.
  for (const { table, rows } of pulled) {
    for (const row of rows) {
      if (typeof row.id !== "string") continue;
      const res = await syncCrmRowEdges(table, row, { client, orgId }).catch(() => ({ linked: 0, skipped: 0 }));
      linked += res.linked;
    }
  }

  return { ok: !tableReadFailed, synced, linked, errors, truncated };
}

/**
 * Backfill: mirror every campaign in the org into the Brain (node pass, then edge
 * pass so persona/CRM targets exist before linking). Same shape as the CRM
 * backfill so the operator action can sum them.
 */
export async function resyncCampaignsIntoBrain(
  deps: SyncDeps = {},
): Promise<{ ok: boolean; synced: number; linked: number; errors: number; truncated: boolean }> {
  let resolved;
  try { resolved = await resolve(deps); }
  catch { return { ok: false, synced: 0, linked: 0, errors: 0, truncated: false }; }
  if (!resolved) return { ok: false, synced: 0, linked: 0, errors: 0, truncated: false };
  const { client, orgId } = resolved;

  const { data, error } = await eqOrg(client.from("campaigns").select("*"), orgId).limit(RESYNC_TABLE_LIMIT);
  if (error || !Array.isArray(data)) return { ok: false, synced: 0, linked: 0, errors: 0, truncated: false };
  const rows = data as Array<Record<string, unknown>>;
  const truncated = rows.length >= RESYNC_TABLE_LIMIT;

  let synced = 0;
  let linked = 0;
  let errors = 0;
  for (const row of rows) {
    if (typeof row.id !== "string") { errors++; continue; }
    const res = await syncCampaignToBrain(row, { client, orgId });
    if (res.ok) synced++; else errors++;
  }
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    const res = await syncCampaignEdges(row, { client, orgId }).catch(() => ({ linked: 0, skipped: 0 }));
    linked += res.linked;
  }

  return { ok: true, synced, linked, errors, truncated };
}
