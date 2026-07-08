"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { sendWorkspaceInviteEmail } from "@/lib/auth/send-invite-email";
import { changeWorkspaceMemberRole, listWorkspacesForUser, removeWorkspaceMember, renameWorkspace } from "@/lib/auth/workspace-admin";
import { ACTIVE_WORKSPACE_COOKIE, getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { cancelWorkspaceInvite, issueWorkspaceInviteCode } from "@/lib/auth/workspace-invites";
import { createWorkspaceForAuthenticatedUser } from "@/lib/auth/workspace-onboarding";
import {
  appAppearanceAccent,
  appAppearanceDensity,
  appAppearanceMotion,
  appImageModel,
  appVideoModel,
  appWorkspaceProfile,
  DEFAULT_APP_SETTINGS,
  isValidSupportEmail,
  normalizeDisplayLabel,
  saveAppSettings,
} from "@/lib/settings/store";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Persist the workspace's media generation config (Layer 2 model selection).
 * Operator-gated through the authenticated workspace context; scoped to the
 * caller's workspace. The payload is re-normalized via parseMediaConfig so an
 * invalid model id from the client is dropped to "auto" before it lands. Nothing
 * outbound — this only records how Arc should generate on the next run.
 */
export async function saveMediaConfigAction(config: MediaConfig): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.workspaceId) return; // no workspace yet — the (app) layout redirects to onboarding
  await saveWorkspaceMediaConfig(getSupabaseAdminClient(), {
    workspaceId: ctx.workspaceId,
    orgId: ctx.orgId,
    config: parseMediaConfig(config),
  });
  if (!result.ok) return { ok: false, error: result.message ?? "Could not create the invite." };

  // Best-effort branded email — a send hiccup must not fail the invite.
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) await sendWorkspaceInviteEmail({ code: result.code, invitedEmail: email, origin: `${proto}://${host}` });
  } catch {
    // ignore; the invite code is still valid and shown in the list
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Invite sent to ${email}.` };
}

/**
 * Switch the active workspace. Only workspaces the user actually belongs to are
 * accepted (checked against listWorkspacesForUser), then the active-workspace
 * cookie is repointed and the whole app re-tailors on the next render.
 */
export async function switchWorkspace(input: { workspaceId: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return { ok: false, error: "A workspace is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const mine = await listWorkspacesForUser();
  if (!mine.some((w) => w.workspaceId === workspaceId)) {
    return { ok: false, error: "You’re not a member of that workspace." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { ok: true, persisted: true, message: "Switched workspace." };
}

function humanizeWorkspaceError(status: string, message?: string): string {
  switch (status) {
    case "not_authenticated":
      return "Sign in to create a workspace.";
    case "invalid_input":
      return "Enter an organization and workspace name.";
    default:
      return message ?? "Could not create the workspace.";
  }
}

export async function createWorkspace(input: {
  organizationName: string;
  workspaceName: string;
  workspaceType: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const org = input.organizationName?.trim();
  const workspace = input.workspaceName?.trim();
  if (!workspace) return { ok: false, error: "A workspace name is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const result = await createWorkspaceForAuthenticatedUser({
    organizationName: org || workspace,
    workspaceName: workspace,
    workspaceType: input.workspaceType || "company",
  });
  if (!result.ok) return { ok: false, error: humanizeWorkspaceError(result.status, result.message) };

  // Pin the new workspace as active so the resolver doesn't fall back to an
  // older membership (mirrors createWorkspaceAction).
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: `Created ${workspace}.` };
}

function humanizeMemberError(status: string, message?: string): string {
  switch (status) {
    case "not_authenticated":
      return "Sign in to manage the team.";
    case "not_authorized":
      return message ?? "Only workspace owners and admins can manage the team.";
    case "invalid_input":
      return message ?? "That member could not be found.";
    default:
      return message ?? "The change could not be saved.";
  }
}

export async function changeMemberRole(input: {
  workspaceId: string;
  membershipId: string;
  role: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.membershipId?.trim()) return { ok: false, error: "A member is required." };

  // Offline/demo: no DB. Report success-but-unpersisted so the UI can update optimistically.
  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await changeWorkspaceMemberRole({
    workspaceId: input.workspaceId,
    membershipId: input.membershipId,
    role: input.role?.toLowerCase(),
  });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
  return { ok: true, persisted: true };
}

export async function removeMember(input: {
  workspaceId: string;
  membershipId: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.membershipId?.trim()) return { ok: false, error: "A member is required." };

  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await removeWorkspaceMember({ workspaceId: input.workspaceId, membershipId: input.membershipId });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
  return { ok: true, persisted: true };
}

export async function cancelInvite(input: {
  workspaceId: string;
  inviteId: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!input.inviteId?.trim()) return { ok: false, error: "An invite is required." };

  if (!isSupabaseAdminConfigured() || !input.workspaceId?.trim()) return { ok: true, persisted: false };

  const result = await cancelWorkspaceInvite({ workspaceId: input.workspaceId, inviteId: input.inviteId });
  if (!result.ok) return { ok: false, error: humanizeMemberError(result.status, result.message) };

  revalidatePath("/settings");
}

/**
 * Real writes for the app_settings-backed Settings panels (General, Appearance,
 * Runner display name). These are internal preferences — never secrets, never
 * outbound — persisted through the settings store and re-read by the root layout
 * (accent/density/motion) and by Arc (assistant name, support email). Offline
 * returns `persisted: false` so the UI can reflect the change optimistically
 * without claiming a real write. Layout revalidation lets the next render pick up
 * theme + name changes app-wide.
 */
// Settings are per-workspace (app_settings PK is (org_id, key)), so every save
// resolves the active workspace's org and scopes the write to it.
async function resolveOrgForSave(): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.orgId) return { ok: false, error: "No active workspace to save settings for." };
  return { ok: true, orgId: ctx.orgId };
}

export async function saveAppearanceSettings(input: {
  accent: string;
  density: string;
  motion: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const org = await resolveOrgForSave();
  if (!org.ok) return org;

  try {
    await saveAppSettings(getSupabaseAdminClient(), org.orgId, {
      appearance_accent: appAppearanceAccent(input.accent),
      appearance_density: appAppearanceDensity(input.density),
      appearance_motion: appAppearanceMotion(input.motion),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save appearance." };
  }

  revalidatePath("/", "layout");
  return { ok: true, persisted: true };
}

/**
 * Built-in (Gemini/Veo) generation default. This is the only media-model default
 * that's actually consumed — the /api/v1/arc/media/generate-* routes read
 * settings.imageModel/videoModel. "" = Auto (inherit the level mapping / env
 * default). The Higgsfield roster is auto-picked per task by the runner and has
 * no persisted per-category default, so it isn't written here.
 */
export async function saveMediaDefaults(input: {
  imageModel: string;
  videoModel: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const org = await resolveOrgForSave();
  if (!org.ok) return org;

  try {
    await saveAppSettings(getSupabaseAdminClient(), org.orgId, {
      image_model: appImageModel(input.imageModel),
      video_model: appVideoModel(input.videoModel),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save media defaults." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: "Saved." };
}

export async function saveRunnerDisplayName(input: { assistantName: string }): Promise<SettingsWriteResult> {
  await requireOperator();

  const name = normalizeDisplayLabel(input.assistantName ?? "", DEFAULT_APP_SETTINGS.assistantName, 32);
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const org = await resolveOrgForSave();
  if (!org.ok) return org;

  try {
    await saveAppSettings(getSupabaseAdminClient(), org.orgId, { assistant_name: name });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the display name." };
  }

  revalidatePath("/", "layout");
  return { ok: true, persisted: true, message: `Arc will show as “${name}”.` };
}

export async function saveGeneralSettings(input: {
  workspaceName?: string;
  workspaceProfile: string;
  industry: string;
  supportEmail: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  const supportEmail = (input.supportEmail ?? "").trim();
  if (!isValidSupportEmail(supportEmail)) return { ok: false, error: "Enter a valid support email, or leave it blank." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  if (!ctx.orgId) return { ok: false, error: "No active workspace to save settings for." };

  // Renaming the workspace touches the org/workspace identity rows (owner/admin
  // gated), so it runs first — if it fails we surface that before saving prefs.
  const desiredName = input.workspaceName?.trim();
  if (desiredName && ctx.workspaceId && desiredName !== ctx.orgName?.trim()) {
    const renamed = await renameWorkspace({ workspaceId: ctx.workspaceId, name: desiredName });
    if (!renamed.ok) return { ok: false, error: humanizeMemberError(renamed.status, renamed.message) };
  }

  try {
    await saveAppSettings(getSupabaseAdminClient(), ctx.orgId, {
      workspace_profile: appWorkspaceProfile(input.workspaceProfile),
      industry: normalizeDisplayLabel(input.industry ?? "", DEFAULT_APP_SETTINGS.industry, 60),
      support_email: supportEmail,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save general settings." };
  }

  revalidatePath("/", "layout");
  return { ok: true, persisted: true, message: "Saved." };
}
