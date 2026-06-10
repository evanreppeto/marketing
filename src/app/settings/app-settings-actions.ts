"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { isValidSupportEmail, normalizeWorkspaceName, saveAppSettings } from "@/lib/settings/store";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type SettingsActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: SettingsActionState = {
  ok: false,
  message: "Supabase isn't configured, so settings can't be saved.",
};

/** Save the editable General settings (workspace name + support email). */
export async function saveGeneralSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const workspaceName = normalizeWorkspaceName(String(formData.get("workspaceName") ?? ""));
  const supportEmail = String(formData.get("supportEmail") ?? "").trim();

  if (!workspaceName) return { ok: false, message: "Workspace name can't be empty." };
  if (!isValidSupportEmail(supportEmail)) {
    return { ok: false, message: "Enter a valid support email, or leave it blank." };
  }

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      workspace_name: workspaceName,
      support_email: supportEmail,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save settings." };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // refresh the document title / shell
  return { ok: true, message: "Settings saved." };
}

/** Toggle Mark's event-driven wake webhook on/off (layered over the env URL). */
export async function setMarkWebhookEnabledAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const enabled = String(formData.get("enabled") ?? "") === "true";
  try {
    await saveAppSettings(getSupabaseAdminClient(), { mark_webhook_enabled: enabled });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save settings." };
  }

  revalidatePath("/settings");
  return { ok: true, message: enabled ? "Mark webhook enabled." : "Mark webhook paused — Mark will poll the inbox." };
}

/** Save the operator-editable agent display name (empty = fall back to env default). */
export async function saveAgentNameAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const agentName = String(formData.get("agentName") ?? "").trim().slice(0, 60);

  try {
    await saveAppSettings(getSupabaseAdminClient(), { agent_name: agentName });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the agent name." };
  }

  revalidatePath("/settings");
  revalidatePath("/mark");
  revalidatePath("/", "layout"); // refresh the shell nav label
  return { ok: true, message: "Agent name saved." };
}
