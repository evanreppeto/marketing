"use server";

import { revalidatePath } from "next/cache";

import { classifyKind, deriveThreadTitle, validateUpload } from "@/domain";
import { getOperatorActor, getOperatorIntegrationKey, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { enqueueArcChatTask } from "@/lib/arc-chat/enqueue";
import {
  getGoogleDriveFileMetadata,
  listGoogleDriveFolderFileIds,
  parseGoogleDriveFileIds,
  parseGoogleDriveFolderIds,
} from "@/lib/google-drive/drive-client";
import { recordGoogleDriveImportResult, resolveGoogleDriveAccessToken } from "@/lib/google-drive/connection";
import {
  deleteGoogleDriveSource,
  getGoogleDriveSource,
  recordGoogleDriveSourceSync,
  saveGoogleDriveSource,
} from "@/lib/google-drive/sources";
import { learnBrandKnowledgeFromAsset } from "@/lib/brand-knowledge/brain-sync";
import {
  createConversation,
  insertOperatorMessage,
  insertPendingArcMessage,
  touchConversation,
} from "@/lib/arc-chat/persistence";
import { importGoogleDriveFiles } from "@/lib/media-library/google-drive-import";
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

async function guard() {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) throw new Error("Supabase is not configured.");
  return getCurrentOrgId();
}

export type GoogleDriveImportActionState = { ok: boolean; message: string } | null;

async function saveSelectedDriveSources(input: {
  orgId: string;
  connectedBy: string;
  accessToken: string;
  driveFolderIds: string[];
  libraryFolderId: string | null;
}): Promise<number> {
  let saved = 0;
  for (const driveFolderId of input.driveFolderIds) {
    let driveFolderName: string | null = null;
    try {
      const metadata = await getGoogleDriveFileMetadata({ fileId: driveFolderId, accessToken: input.accessToken });
      driveFolderName = metadata.name;
    } catch {
      driveFolderName = null;
    }
    await saveGoogleDriveSource({
      orgId: input.orgId,
      connectedBy: input.connectedBy,
      driveFolderId,
      driveFolderName,
      libraryFolderId: input.libraryFolderId,
    });
    saved += 1;
  }
  return saved;
}

async function importDriveFolderSource(input: {
  orgId: string;
  connectedBy: string;
  accessToken: string;
  sourceId: string;
  driveFolderId: string;
  libraryFolderId: string | null;
}): Promise<void> {
  let discoveredFileIds: string[] = [];
  try {
    const folderFiles = await listGoogleDriveFolderFileIds({
      folderIds: [input.driveFolderId],
      accessToken: input.accessToken,
      maxFiles: 100,
      maxFolders: 25,
    });
    discoveredFileIds = folderFiles.fileIds;

    if (discoveredFileIds.length === 0) {
      const detail = folderFiles.errors[0] ?? "No importable Drive files were found.";
      await recordGoogleDriveSourceSync({
        id: input.sourceId,
        orgId: input.orgId,
        connectedBy: input.connectedBy,
        importedCount: 0,
        fileIds: [],
        ok: false,
        error: detail,
      });
      return;
    }

    const result = await importGoogleDriveFiles({
      orgId: input.orgId,
      folderId: input.libraryFolderId,
      fileIds: discoveredFileIds,
      uploadedBy: input.connectedBy,
      accessToken: input.accessToken,
      afterInsert: (asset) => learnBrandKnowledgeFromAsset(asset, { orgId: input.orgId }).then(() => undefined),
    });
    const syncError = [...folderFiles.errors, ...result.errors][0] ?? null;
    await recordGoogleDriveSourceSync({
      id: input.sourceId,
      orgId: input.orgId,
      connectedBy: input.connectedBy,
      importedCount: result.imported,
      fileIds: discoveredFileIds,
      ok: result.errors.length === 0 && folderFiles.errors.length === 0,
      error: syncError,
    });
    await recordGoogleDriveImportResult({
      orgId: input.orgId,
      connectedBy: input.connectedBy,
      ok: result.errors.length === 0,
      error: result.errors[0] ?? folderFiles.errors[0] ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive source sync failed.";
    await recordGoogleDriveSourceSync({
      id: input.sourceId,
      orgId: input.orgId,
      connectedBy: input.connectedBy,
      importedCount: 0,
      fileIds: discoveredFileIds,
      ok: false,
      error: message,
    }).catch(() => undefined);
    await recordGoogleDriveImportResult({ orgId: input.orgId, connectedBy: input.connectedBy, ok: false, error: message }).catch(
      () => undefined,
    );
  }
}

export async function createFolderAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = (String(formData.get("parentId") ?? "") || null) as string | null;
  if (name) await createFolder({ orgId, name, parentId });
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
    const kind = classifyKind(file.type, file.name);
    const assetId = await insertAsset({
      orgId,
      folderId,
      fileName: file.name,
      bytes,
      contentType: file.type,
      kind,
      byteSize: file.size,
      uploadedBy: await getOperatorActor(),
    });
    await learnBrandKnowledgeFromAsset({
      id: assetId,
      fileName: file.name,
      kind,
      source: "uploaded",
      tags: [],
      availableToArc: true,
      contentType: file.type,
      fileBytes: bytes,
    }, { orgId });
  }
  revalidatePath("/library");
  revalidatePath("/library/brand");
  revalidatePath("/brain");
}

export async function importFromGoogleDriveAction(
  _previous: GoogleDriveImportActionState,
  formData: FormData,
): Promise<GoogleDriveImportActionState> {
  const orgId = await guard();
  const folderId = (String(formData.get("folderId") ?? "") || null) as string | null;
  const raw = String(formData.get("driveFiles") ?? "");
  const rawFolders = String(formData.get("driveFolders") ?? "");
  const shouldSaveSource = String(formData.get("saveDriveSource") ?? "") === "true";
  const fileIds = parseGoogleDriveFileIds(raw);
  const driveFolderIds = parseGoogleDriveFolderIds(rawFolders);
  if (fileIds.length === 0 && driveFolderIds.length === 0) {
    return { ok: false, message: "Paste at least one Google Drive file or folder link." };
  }

  try {
    const operator = await getOperatorIntegrationKey();
    const accessToken = await resolveGoogleDriveAccessToken({ orgId, connectedBy: operator });
    let importFileIds = fileIds;
    let folderSummary = "";
    let folderWarnings: string[] = [];

    if (driveFolderIds.length > 0) {
      const folderFiles = await listGoogleDriveFolderFileIds({
        folderIds: driveFolderIds,
        accessToken,
        maxFiles: 100,
        maxFolders: 25,
      });
      importFileIds = [...new Set([...fileIds, ...folderFiles.fileIds])];
      folderSummary = ` from ${folderFiles.scannedFolders} Drive folder${folderFiles.scannedFolders === 1 ? "" : "s"}`;
      folderWarnings = [
        folderFiles.truncated ? "Import was capped at 100 files." : null,
        folderFiles.skippedFolders > 0 ? `${folderFiles.skippedFolders} folder${folderFiles.skippedFolders === 1 ? "" : "s"} skipped.` : null,
        ...folderFiles.errors,
      ].filter((value): value is string => Boolean(value));
    }

    const savedSources = shouldSaveSource && driveFolderIds.length > 0
      ? await saveSelectedDriveSources({
          orgId,
          connectedBy: operator,
          accessToken,
          driveFolderIds,
          libraryFolderId: folderId,
        })
      : 0;

    if (importFileIds.length === 0) {
      const detail = folderWarnings[0] ? ` ${folderWarnings[0]}` : "";
      return { ok: false, message: `No importable Drive files were found.${detail}` };
    }

    const result = await importGoogleDriveFiles({
      orgId,
      folderId,
      fileIds: importFileIds,
      uploadedBy: operator,
      accessToken,
      afterInsert: (asset) => learnBrandKnowledgeFromAsset(asset, { orgId }).then(() => undefined),
    });
    await recordGoogleDriveImportResult({
      orgId,
      connectedBy: operator,
      ok: result.errors.length === 0,
      error: result.errors[0] ?? null,
    });
    revalidatePath("/library");
    revalidatePath("/library/brand");
    revalidatePath("/brain");
    if (result.imported === 0) {
      return { ok: false, message: result.errors[0] ?? "No Drive files were imported." };
    }
    const skipped = result.skipped > 0 ? ` ${result.skipped} skipped.` : "";
    const warning = folderWarnings[0] ? ` ${folderWarnings[0]}` : "";
    const sourceNote = savedSources > 0 ? ` Saved ${savedSources} Drive source${savedSources === 1 ? "" : "s"}.` : "";
    return {
      ok: true,
      message: `Imported ${result.imported} Drive file${result.imported === 1 ? "" : "s"}${folderSummary}.${skipped}${warning}${sourceNote}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive import failed.";
    await recordGoogleDriveImportResult({ orgId, connectedBy: await getOperatorIntegrationKey(), ok: false, error: message }).catch(() => undefined);
    return { ok: false, message };
  }
}

export async function syncGoogleDriveSourceAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const sourceId = String(formData.get("sourceId") ?? "");
  if (!sourceId) return;

  const connectedBy = await getOperatorIntegrationKey();
  const source = await getGoogleDriveSource({ id: sourceId, orgId, connectedBy });
  if (!source) return;
  try {
    const accessToken = await resolveGoogleDriveAccessToken({ orgId, connectedBy });
    await importDriveFolderSource({
      orgId,
      connectedBy,
      accessToken,
      sourceId: source.id,
      driveFolderId: source.driveFolderId,
      libraryFolderId: source.libraryFolderId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive source sync failed.";
    await recordGoogleDriveSourceSync({
      id: source.id,
      orgId,
      connectedBy,
      importedCount: 0,
      fileIds: [],
      ok: false,
      error: message,
    }).catch(() => undefined);
  }
  revalidatePath("/library");
  revalidatePath("/library/brand");
  revalidatePath("/brain");
}

export async function deleteGoogleDriveSourceAction(formData: FormData): Promise<void> {
  const orgId = await guard();
  const id = String(formData.get("sourceId") ?? "");
  if (!id) return;
  await deleteGoogleDriveSource({ id, orgId, connectedBy: await getOperatorIntegrationKey() });
  revalidatePath("/library");
  revalidatePath("/library/brand");
  revalidatePath("/brain");
}

export async function renameAssetAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (id && name) await renameAsset(id, name);
  revalidatePath("/library");
  revalidatePath("/library/brand");
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
  revalidatePath("/library/brand");
}

export async function toggleAvailableToArcAction(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "true") === "true";
  if (id) await setAvailableToArc(id, value);
  revalidatePath("/library");
  revalidatePath("/library/brand");
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

  const operator = await getOperatorActor();
  const message = "Use these reference images.";

  const conversation = await createConversation({ operator, title: deriveThreadTitle(message) });
  const operatorMessage = await insertOperatorMessage({
    conversationId: conversation.id,
    body: message,
    mentions: [],
    attachments,
  });
  await touchConversation(conversation.id);

  const agentTaskId = await enqueueArcChatTask({
    conversationId: conversation.id,
    messageId: operatorMessage.id,
    message,
    mentions: [],
    operator,
    attachments,
  });
  // Drop the pending Arc bubble keyed to the task id. Without it the reply
  // callback (POST /api/v1/arc/messages) can't findPendingMessageByTask and
  // 404s before persisting, so Arc's reply never lands. This mirrors
  // sendArcMessageAction's post-enqueue insertPendingArcMessage step. We omit
  // the best-effort webhook wake (a latency optimization in the chat path); the
  // inbox poll picks the queued task up regardless, and skipping it avoids the
  // extra outbound surface. Outbound stays locked.
  await insertPendingArcMessage({ conversationId: conversation.id, agentTaskId });

  revalidatePath("/arc");
}
