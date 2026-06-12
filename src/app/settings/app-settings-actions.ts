"use server";

import { revalidatePath } from "next/cache";

import { parseMarkMode, parseMarkRoute } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import {
  appAppearanceAccent,
  appAppearanceDensity,
  appAppearanceMotion,
  isValidSupportEmail,
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
