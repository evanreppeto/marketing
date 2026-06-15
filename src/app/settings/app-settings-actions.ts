"use server";

import { revalidatePath } from "next/cache";

import { parseMarkMode, parseMarkRoute } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import {
  appAppearanceAccent,
  appAppearanceDensity,
  DEFAULT_APP_SETTINGS,
  appAppearanceMotion,
  appApprovalStrictness,
  appAssistantResponseStyle,
  appAssistantTone,
  appWorkspaceProfile,
  isValidSupportEmail,
  normalizeBrandShortName,
  normalizeBrandUrl,
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

/** Save user/company branding consumed by the app shell, metadata, and chat UI. */
export async function saveBrandingSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const workspaceName = normalizeDisplayLabel(String(formData.get("workspaceName") ?? ""), DEFAULT_APP_SETTINGS.workspaceName, 80);
  const workspaceProfile = appWorkspaceProfile(formData.get("workspaceProfile"));
  const productLabel = normalizeDisplayLabel(String(formData.get("productLabel") ?? ""), DEFAULT_APP_SETTINGS.productLabel, 42);
  const assistantName = normalizeDisplayLabel(String(formData.get("assistantName") ?? ""), DEFAULT_APP_SETTINGS.assistantName, 32);
  const brandShortName = normalizeBrandShortName(String(formData.get("brandShortName") ?? ""));
  const clearBrandLogo = String(formData.get("clearBrandLogo") ?? "") === "1";
  const uploadedLogo = normalizeBrandUrl(String(formData.get("brandLogoUpload") ?? ""));
  const typedLogo = normalizeBrandUrl(String(formData.get("brandLogoUrl") ?? ""));
  const faviconUrl = normalizeBrandUrl(String(formData.get("brandFaviconUrl") ?? "")) || "/icon.svg";
  const brandLogoUrl = clearBrandLogo ? "" : uploadedLogo || typedLogo;

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      workspace_name: workspaceName,
      workspace_profile: workspaceProfile,
      product_label: productLabel,
      assistant_name: assistantName,
      brand_short_name: brandShortName,
      brand_logo_url: brandLogoUrl,
      brand_favicon_url: faviconUrl,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save branding." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/mark");
  return { ok: true, message: "Branding saved." };
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
  const markDefaultMode = parseMarkMode(formData.get("markDefaultMode"));
  const markDefaultRoute = parseMarkRoute(formData.get("markDefaultRoute"));

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      assistant_tone: assistantTone,
      assistant_response_style: assistantResponseStyle,
      approval_strictness: approvalStrictness,
      mark_default_mode: markDefaultMode,
      mark_default_route: markDefaultRoute,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save agent behavior." };
  }

  revalidatePath("/settings");
  revalidatePath("/mark");
  return { ok: true, message: "Agent behavior saved." };
}

/** Save defaults applied to newly-sent Mark chat messages. */
export async function saveMarkDefaultsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const markDefaultMode = parseMarkMode(formData.get("markDefaultMode"));
  const markDefaultRoute = parseMarkRoute(formData.get("markDefaultRoute"));

  try {
    await saveAppSettings(getSupabaseAdminClient(), {
      mark_default_mode: markDefaultMode,
      mark_default_route: markDefaultRoute,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save Mark defaults." };
  }

  revalidatePath("/settings");
  revalidatePath("/mark");
  return { ok: true, message: "Mark defaults saved." };
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
  revalidatePath("/mark");
  revalidatePath("/", "layout"); // refresh the shell nav label
  return { ok: true, message: "Agent name saved." };
}
