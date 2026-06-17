"use server";

import { revalidatePath } from "next/cache";

import { parseArcMode, parseArcRoute } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { getAgentName } from "@/lib/settings/agent-name";
import {
  appAppearanceAccent,
  appAppearanceDensity,
  appAppearanceMotion,
  appApprovalStrictness,
  appAssistantResponseStyle,
  appAssistantTone,
  appWorkspaceProfile,
  isValidSupportEmail,
  normalizeDisplayLabel,
  normalizeWorkspaceName,
  saveAppSettings,
} from "@/lib/settings/store";
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
  revalidatePath("/forgot-password");
  revalidatePath("/login");
  revalidatePath("/", "layout"); // refresh the document title / shell
  return { ok: true, message: "Settings saved." };
}

/** Save app-level workspace & product settings (identity now lives in Brand Kit). */
export async function saveBrandingSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const workspaceProfile = appWorkspaceProfile(formData.get("workspaceProfile"));
  const productLabel = normalizeDisplayLabel(String(formData.get("productLabel") ?? ""), "Marketing", 42);
  const assistantName = normalizeDisplayLabel(String(formData.get("assistantName") ?? ""), "Agent", 32);

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      workspace_profile: workspaceProfile,
      product_label: productLabel,
      assistant_name: assistantName,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save workspace & product settings." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Workspace & product saved." };
}

/** Save operator-facing agent behavior preferences consumed by new chat tasks. */
export async function saveAgentBehaviorSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const assistantTone = appAssistantTone(formData.get("assistantTone"));
  const assistantResponseStyle = appAssistantResponseStyle(formData.get("assistantResponseStyle"));
  const approvalStrictness = appApprovalStrictness(formData.get("approvalStrictness"));
  const markDefaultMode = parseArcMode(formData.get("markDefaultMode"));
  const markDefaultRoute = parseArcRoute(formData.get("markDefaultRoute"));

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      assistant_tone: assistantTone,
      assistant_response_style: assistantResponseStyle,
      approval_strictness: approvalStrictness,
      arc_default_mode: markDefaultMode,
      arc_default_route: markDefaultRoute,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save agent behavior." };
  }

  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Agent behavior saved." };
}

/** Save defaults applied to newly-sent Arc chat messages. */
export async function saveArcDefaultsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const markDefaultMode = parseArcMode(formData.get("markDefaultMode"));
  const markDefaultRoute = parseArcRoute(formData.get("markDefaultRoute"));
  const agentName = await getAgentName();

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      arc_default_mode: markDefaultMode,
      arc_default_route: markDefaultRoute,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `Couldn't save ${agentName} defaults.` };
  }

  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: `${agentName} defaults saved.` };
}

/** Save global UI appearance preferences consumed by RootLayout + globals.css. */
export async function saveAppearanceSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const appearanceAccent = appAppearanceAccent(formData.get("appearanceAccent"));
  const appearanceDensity = appAppearanceDensity(formData.get("appearanceDensity"));
  const appearanceMotion = appAppearanceMotion(formData.get("appearanceMotion"));

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      appearance_accent: appearanceAccent,
      appearance_density: appearanceDensity,
      appearance_motion: appearanceMotion,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save appearance settings." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true, message: "Appearance saved." };
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
  revalidatePath("/arc");
  revalidatePath("/", "layout"); // refresh the shell nav label
  return { ok: true, message: "Agent name saved." };
}
