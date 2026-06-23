"use server";

import { revalidatePath } from "next/cache";

import { isSharePermission, isShareVisibility } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import {
  ArcAccessError,
  assertConversationAccess,
  getShareViewer,
  setConversationVisibility,
  setProjectVisibility,
  shareConversation,
  shareProject,
  unshareConversation,
  unshareProject,
} from "@/lib/arc-chat/sharing";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ShareActionState = { ok: boolean; message: string };

function notConfigured(): ShareActionState {
  return { ok: false, message: "Supabase isn't configured yet, so sharing isn't available." };
}

export async function setConversationVisibilityAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const permission = String(formData.get("permission") ?? "view");

  if (!conversationId) return { ok: false, message: "Missing conversation." };
  if (!isShareVisibility(visibility)) return { ok: false, message: "Invalid visibility." };
  if (!isSharePermission(permission)) return { ok: false, message: "Invalid permission." };

  const client = getSupabaseAdminClient();
  try {
    await assertConversationAccess(conversationId, "collaborate", undefined, client);
    await setConversationVisibility(conversationId, visibility, permission, client);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update visibility." };
  }

  revalidatePath("/arc");
  return { ok: true, message: visibility === "workspace" ? "Visible to the workspace." : "Set to private." };
}

export async function shareConversationAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const permission = String(formData.get("permission") ?? "view");

  if (!conversationId || !userId) return { ok: false, message: "Choose a teammate to share with." };
  if (!isSharePermission(permission)) return { ok: false, message: "Invalid permission." };

  const client = getSupabaseAdminClient();
  try {
    const viewer = await getShareViewer(client);
    await assertConversationAccess(conversationId, "collaborate", viewer, client);
    await shareConversation(conversationId, userId, permission, viewer.userId, client);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't share." };
  }

  revalidatePath("/arc");
  return { ok: true, message: "Shared." };
}

export async function unshareConversationAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!conversationId || !userId) return { ok: false, message: "Missing share." };

  const client = getSupabaseAdminClient();
  try {
    await assertConversationAccess(conversationId, "collaborate", undefined, client);
    await unshareConversation(conversationId, userId, client);
  } catch (error) {
    if (error instanceof ArcAccessError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't remove access." };
  }

  revalidatePath("/arc");
  return { ok: true, message: "Access removed." };
}

// Project equivalents. Sharing a project cascades to its chats (handled by the
// access resolvers), so these only manage the project's own visibility/shares.
export async function setProjectVisibilityAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const projectId = String(formData.get("projectId") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const permission = String(formData.get("permission") ?? "view");

  if (!projectId) return { ok: false, message: "Missing project." };
  if (!isShareVisibility(visibility)) return { ok: false, message: "Invalid visibility." };
  if (!isSharePermission(permission)) return { ok: false, message: "Invalid permission." };

  try {
    await setProjectVisibility(projectId, visibility, permission);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update project." };
  }

  revalidatePath("/arc");
  return { ok: true, message: visibility === "workspace" ? "Project visible to the workspace." : "Project set to private." };
}

export async function shareProjectAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const projectId = String(formData.get("projectId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const permission = String(formData.get("permission") ?? "view");

  if (!projectId || !userId) return { ok: false, message: "Choose a teammate to share with." };
  if (!isSharePermission(permission)) return { ok: false, message: "Invalid permission." };

  const client = getSupabaseAdminClient();
  try {
    const viewer = await getShareViewer(client);
    await shareProject(projectId, userId, permission, viewer.userId, client);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't share project." };
  }

  revalidatePath("/arc");
  return { ok: true, message: "Project shared." };
}

export async function unshareProjectAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return notConfigured();

  const projectId = String(formData.get("projectId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!projectId || !userId) return { ok: false, message: "Missing share." };

  try {
    await unshareProject(projectId, userId);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't remove access." };
  }

  revalidatePath("/arc");
  return { ok: true, message: "Access removed." };
}
