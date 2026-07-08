"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { createFolder } from "@/lib/media-library/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Real operator write for the Library "New folder" button. A folder is internal
 * organization (never outbound), so it persists directly through
 * requireOperator() + the org-scoped createFolder. `persisted: false` is the
 * honest offline signal so the tree can show it optimistically.
 */
export type CreateFolderResult =
  | { ok: true; persisted: boolean; id?: string }
  | { ok: false; error: string };

export async function createLibraryFolder(name: string): Promise<CreateFolderResult> {
  await requireOperator();

  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "A folder name is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const orgId = await getCurrentOrgId();
    const id = await createFolder({ orgId, name: trimmed });
    revalidatePath("/library");
    return { ok: true, persisted: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the folder." };
  }
}
