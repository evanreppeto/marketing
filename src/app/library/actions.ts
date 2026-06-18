"use server";

import { revalidatePath } from "next/cache";

import { classifyKind, deriveThreadTitle, validateUpload } from "@/domain";
import { requireOperator, getOperatorActor } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import {
  createConversation,
  insertOperatorMessage,
  touchConversation,
} from "@/lib/arc-chat/persistence";
import { loadArcAttachments } from "@/lib/media-library/arc-handoff";
import {
  createFolder,
  deleteAsset,
  deleteFolder,
  insertAsset,
  moveAsset,
  renameAsset,
  renameFolder,
  setAssetTags,
  setAvailableToArc,
} from "@/lib/media-library/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

const OPERATOR = "Operator";

async function guard() {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase is not configured.");
  return getCurrentOrgId();
}

export async function createFolderAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createFolder({ orgId, name });
  revalidatePath("/library");
}

export async function renameFolderAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await renameFolder(id, name);
  revalidatePath("/library");
}

export async function deleteFolderAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteFolder(id);
  revalidatePath("/library");
}

export async function uploadAssetsAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const folderId = (String(formData.get("folderId") ?? "") || null) as string | null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const file of files) {
    const check = validateUpload({ contentType: file.type, byteSize: file.size });
    if (!check.ok) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await insertAsset({
      orgId,
      folderId,
      fileName: file.name,
      bytes,
      contentType: file.type,
      kind: classifyKind(file.type, file.name),
      byteSize: file.size,
      uploadedBy: OPERATOR,
    });
  }
  revalidatePath("/library");
}

export async function renameAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await renameAsset(id, name);
  revalidatePath("/library");
}

export async function moveAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const folderId = (String(formData.get("folderId") ?? "") || null) as string | null;
  if (id) await moveAsset(id, folderId);
  revalidatePath("/library");
}

export async function setTagsAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (id) await setAssetTags(id, tags);
  revalidatePath("/library");
}

export async function toggleAvailableToArcAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "true") === "true";
  if (id) await setAvailableToArc(id, value);
  revalidatePath("/library");
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteAsset(id);
  revalidatePath("/library");
}

/**
 * Send selected library assets to Arc as a brand-new chat conversation seeded
 * with the assets as reference attachments. Mirrors the new-conversation path of
 * sendArcMessageAction in src/app/arc/actions.ts: create conversation -> insert
 * operator message (carrying the attachments) -> touch -> enqueue the agent task.
 * Outbound stays locked; this only hands Arc reference images to work from.
 */
export async function sendAssetsToArcAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const attachments = await loadArcAttachments(orgId, ids);
  if (attachments.length === 0) return;

  const operator = getOperatorActor();
  const message = "Use these reference images.";

  const conversation = await createConversation({ operator, title: deriveThreadTitle(message) });
  const operatorMessage = await insertOperatorMessage({
    conversationId: conversation.id,
    body: message,
    mentions: [],
    attachments,
  });
  await touchConversation(conversation.id);

  await enqueueArcChatTask({
    conversationId: conversation.id,
    messageId: operatorMessage.id,
    message,
    mentions: [],
    operator,
    attachments,
  });

  revalidatePath("/arc");
}
