import { type SupabaseClient } from "@supabase/supabase-js";

import { type NoteStatus, type VaultNote } from "@/domain";

export type VaultNoteRow = {
  slug: string;
  title: string;
  folder: string;
  tags: string[] | null;
  author: string;
  status: string; // db enum: draft | needs_review | published | archived
  body: string | null;
  updated_at: string | null;
};

const STATUS_FROM_DB: Record<string, NoteStatus> = {
  draft: "Draft",
  needs_review: "Needs review",
  published: "Published",
};

const STATUS_TO_DB: Record<NoteStatus, string> = {
  Draft: "draft",
  "Needs review": "needs_review",
  Published: "published",
};

export function rowToVaultNote(row: VaultNoteRow): VaultNote {
  return {
    slug: row.slug,
    title: row.title,
    folder: row.folder,
    tags: row.tags ?? [],
    author: row.author,
    status: STATUS_FROM_DB[row.status] ?? "Draft",
    updated: row.updated_at ? row.updated_at.slice(0, 10) : "—",
    body: row.body ?? "",
  };
}

export function vaultNoteToRow(note: VaultNote) {
  return {
    slug: note.slug,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    author: note.author,
    status: STATUS_TO_DB[note.status],
    body: note.body,
  };
}

const SELECT = "slug,title,folder,tags,author,status,body,updated_at";

export async function listVaultNotes(supabase: SupabaseClient): Promise<VaultNote[]> {
  const { data, error } = await supabase
    .from("vault_notes")
    .select(SELECT)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`vault_notes list failed: ${error.message}`);
  return ((data ?? []) as VaultNoteRow[]).map(rowToVaultNote);
}

export async function getVaultNoteBySlug(supabase: SupabaseClient, slug: string): Promise<VaultNote | null> {
  const { data, error } = await supabase
    .from("vault_notes")
    .select(SELECT)
    .eq("slug", slug)
    .neq("status", "archived")
    .maybeSingle<VaultNoteRow>();
  if (error) throw new Error(`vault_notes get failed: ${error.message}`);
  return data ? rowToVaultNote(data) : null;
}

export async function upsertVaultNote(supabase: SupabaseClient, note: VaultNote): Promise<void> {
  const { error } = await supabase.from("vault_notes").upsert(vaultNoteToRow(note), { onConflict: "slug" });
  if (error) throw new Error(`vault_notes upsert failed: ${error.message}`);
}

export async function setVaultNoteStatus(supabase: SupabaseClient, slug: string, status: NoteStatus): Promise<void> {
  const { error } = await supabase.from("vault_notes").update({ status: STATUS_TO_DB[status] }).eq("slug", slug);
  if (error) throw new Error(`vault_notes status update failed: ${error.message}`);
}

// Soft-delete: archived notes are excluded from all reads.
export async function archiveVaultNote(supabase: SupabaseClient, slug: string): Promise<void> {
  const { error } = await supabase.from("vault_notes").update({ status: "archived" }).eq("slug", slug);
  if (error) throw new Error(`vault_notes archive failed: ${error.message}`);
}
