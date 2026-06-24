import { seedVaultNotes } from "./seed-notes";
import { getVaultNoteBySlug, listVaultNotes } from "./persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import { getCurrentOrgId } from "@/lib/auth/org";
import type { VaultNote } from "@/domain";

const NOT_CONFIGURED = "Supabase is not configured. Showing example notes — saving is disabled until env vars are set.";

export type VaultNotesModel =
  | { status: "live"; notes: VaultNote[] }
  | { status: "fallback"; notes: VaultNote[]; message: string }
  | { status: "error"; notes: VaultNote[]; message: string };

// `orgId` is the token-resolved scope for Arc API callers; operator/cookie callers
// omit it and fall back to getCurrentOrgId(). A headless runner token has no
// cookie, so without the explicit scope getCurrentOrgId() would resolve the
// DEFAULT org and leak the wrong tenant's notes.
export async function getVaultNotes(orgId?: string): Promise<VaultNotesModel> {
  if (!isSupabaseAdminConfigured()) {
    return { status: "fallback", notes: seedVaultNotes, message: NOT_CONFIGURED };
  }
  try {
    const resolvedOrgId = orgId ?? (await getCurrentOrgId());
    const notes = await listVaultNotes(getSupabaseAdminClient(), resolvedOrgId);
    return { status: "live", notes };
  } catch (error) {
    return { status: "error", notes: seedVaultNotes, message: error instanceof Error ? error.message : "Vault is unavailable." };
  }
}

export async function getVaultNote(slug: string, orgId?: string): Promise<VaultNote | null> {
  if (!isSupabaseAdminConfigured()) {
    return seedVaultNotes.find((note) => note.slug === slug) ?? null;
  }
  try {
    const resolvedOrgId = orgId ?? (await getCurrentOrgId());
    return await getVaultNoteBySlug(getSupabaseAdminClient(), slug, resolvedOrgId);
  } catch {
    return seedVaultNotes.find((note) => note.slug === slug) ?? null;
  }
}
