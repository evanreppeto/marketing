"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { archiveVaultNote, setVaultNoteStatus, upsertVaultNote } from "@/lib/vault/persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import type { NoteStatus, VaultNote } from "@/domain";

const VALID_STATUSES: NoteStatus[] = ["Draft", "Needs review", "Published"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function saveNoteAction(formData: FormData): Promise<void> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  const title = String(formData.get("title") ?? "").trim();
  const folder = String(formData.get("folder") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const author = String(formData.get("author") ?? "Operator").trim() || "Operator";
  const statusRaw = String(formData.get("status") ?? "Draft");
  const status: NoteStatus = (VALID_STATUSES as string[]).includes(statusRaw) ? (statusRaw as NoteStatus) : "Draft";
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const existingSlug = String(formData.get("slug") ?? "").trim();
  const slug = existingSlug || slugify(title);

  if (!title || !folder || !slug) {
    redirect("/notebook?action=invalid");
  }

  const note: VaultNote = { slug, title, folder, tags, author, status, updated: "", body };
  await upsertVaultNote(getSupabaseAdminClient(), note);

  revalidatePath("/notebook");
  revalidatePath(`/notebook/${slug}`);
  redirect(`/notebook/${slug}?action=saved`);
}

export async function publishNoteAction(formData: FormData): Promise<void> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/notebook?action=invalid");

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  await setVaultNoteStatus(getSupabaseAdminClient(), slug, "Published");
  revalidatePath("/notebook");
  revalidatePath(`/notebook/${slug}`);
  redirect(`/notebook/${slug}?action=published`);
}

export async function archiveNoteAction(formData: FormData): Promise<void> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/notebook?action=invalid");

  if (!isSupabaseAdminConfigured()) {
    redirect("/notebook?action=not-configured");
  }

  await archiveVaultNote(getSupabaseAdminClient(), slug);
  revalidatePath("/notebook");
  redirect("/notebook?action=archived");
}
