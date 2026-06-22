import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor } from "@/lib/auth/operator";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type GoogleDriveSourceStatus = "active" | "paused" | "error";

export type GoogleDriveSourceRow = {
  id: string;
  org_id: string;
  connected_by: string;
  library_folder_id: string | null;
  drive_folder_id: string;
  drive_folder_name: string | null;
  status: GoogleDriveSourceStatus;
  last_synced_at: string | null;
  last_error: string | null;
  last_imported_count: number;
  last_seen_file_ids: string[];
  created_at: string;
  updated_at: string;
};

export type GoogleDriveSourceView = {
  id: string;
  driveFolderId: string;
  driveFolderName: string | null;
  libraryFolderId: string | null;
  status: GoogleDriveSourceStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastImportedCount: number;
};

type DbError = { message: string };
type DbResult<T> = Promise<{ data: T | null; error: DbError | null }>;

type SourceSelectChain = {
  eq(column: string, value: string): SourceSelectChain;
  order(column: string, options?: { ascending?: boolean }): DbResult<unknown[]>;
  maybeSingle(): DbResult<unknown>;
};

type SourceMutationChain = {
  eq(column: string, value: string): SourceMutationChain & Promise<{ error: DbError | null }>;
};

type SourceTable = {
  select(columns: string): SourceSelectChain;
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): Promise<{ error: DbError | null }>;
  update(values: Record<string, unknown>): SourceMutationChain;
  delete(): SourceMutationChain;
};

type UntypedSupabaseClient = {
  from(table: string): SourceTable;
};

function sourceTable(client: SupabaseClient): SourceTable {
  return (client as unknown as UntypedSupabaseClient).from("google_drive_sources");
}

function toView(row: GoogleDriveSourceRow): GoogleDriveSourceView {
  return {
    id: row.id,
    driveFolderId: row.drive_folder_id,
    driveFolderName: row.drive_folder_name,
    libraryFolderId: row.library_folder_id,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    lastImportedCount: row.last_imported_count,
  };
}

export async function saveGoogleDriveSource(input: {
  orgId: string;
  connectedBy: string;
  driveFolderId: string;
  driveFolderName?: string | null;
  libraryFolderId?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const client = input.client ?? getSupabaseAdminClient();
  const { error } = await sourceTable(client).upsert(
    {
      org_id: input.orgId,
      connected_by: input.connectedBy,
      drive_folder_id: input.driveFolderId,
      drive_folder_name: input.driveFolderName ?? null,
      library_folder_id: input.libraryFolderId ?? null,
      status: "active",
      last_error: null,
    },
    { onConflict: "org_id,connected_by,drive_folder_id" },
  );
  if (error) throw new Error(`google_drive_sources upsert failed: ${error.message}`);
}

export async function listGoogleDriveSources(input: {
  orgId: string;
  connectedBy: string;
  client?: SupabaseClient;
}): Promise<GoogleDriveSourceView[]> {
  const client = input.client ?? getSupabaseAdminClient();
  const { data, error } = await sourceTable(client)
    .select("*")
    .eq("org_id", input.orgId)
    .eq("connected_by", input.connectedBy)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`google_drive_sources lookup failed: ${error.message}`);
  return ((data ?? []) as GoogleDriveSourceRow[]).map(toView);
}

export async function listGoogleDriveSourcesForCurrentOperator(): Promise<GoogleDriveSourceView[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const orgId = await getCurrentOrgId();
  return listGoogleDriveSources({ orgId, connectedBy: await getOperatorActor() });
}

export async function getGoogleDriveSource(input: {
  id: string;
  orgId: string;
  connectedBy: string;
  client?: SupabaseClient;
}): Promise<GoogleDriveSourceView | null> {
  const client = input.client ?? getSupabaseAdminClient();
  const { data, error } = await sourceTable(client)
    .select("*")
    .eq("id", input.id)
    .eq("org_id", input.orgId)
    .eq("connected_by", input.connectedBy)
    .maybeSingle();
  if (error) throw new Error(`google_drive_sources source lookup failed: ${error.message}`);
  return data ? toView(data as GoogleDriveSourceRow) : null;
}

export async function recordGoogleDriveSourceSync(input: {
  id: string;
  orgId: string;
  connectedBy: string;
  importedCount: number;
  fileIds: string[];
  ok: boolean;
  error?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const client = input.client ?? getSupabaseAdminClient();
  const { error } = await sourceTable(client)
    .update({
      status: input.ok ? "active" : "error",
      last_synced_at: new Date().toISOString(),
      last_imported_count: input.importedCount,
      last_seen_file_ids: input.fileIds,
      last_error: input.ok ? null : (input.error ?? "Google Drive source sync failed."),
    })
    .eq("id", input.id)
    .eq("org_id", input.orgId)
    .eq("connected_by", input.connectedBy);
  if (error) throw new Error(`google_drive_sources sync update failed: ${error.message}`);
}

export async function deleteGoogleDriveSource(input: {
  id: string;
  orgId: string;
  connectedBy: string;
  client?: SupabaseClient;
}): Promise<void> {
  const client = input.client ?? getSupabaseAdminClient();
  const { error } = await sourceTable(client)
    .delete()
    .eq("id", input.id)
    .eq("org_id", input.orgId)
    .eq("connected_by", input.connectedBy);
  if (error) throw new Error(`google_drive_sources delete failed: ${error.message}`);
}
