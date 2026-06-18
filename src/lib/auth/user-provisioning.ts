import type { User } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured, type TypedSupabaseClient } from "@/lib/supabase/server";

type PendingWorkspaceInvite = {
  id: string;
  org_id: string;
  workspace_id: string;
  role: string;
};

export type ProvisionUserResult =
  | {
      ok: true;
      status: "existing_member" | "invited_member";
      orgId: string;
      workspaceId: string;
    }
  | { ok: true; status: "profile_only"; orgId: null; workspaceId: null }
  | { ok: false; status: "not_configured" | "missing_workspace" | "missing_email" | "failed"; message: string };

function userDisplayName(user: User) {
  const metadata = user.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name ?? metadata.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function organizationRoleForWorkspaceRole(role: string) {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "member";
}

async function upsertProfile(client: TypedSupabaseClient, user: User, email: string) {
  await client.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: userDisplayName(user),
    },
    { onConflict: "id" },
  );
}

async function acceptPendingInvite(client: TypedSupabaseClient, user: User, email: string): Promise<PendingWorkspaceInvite | null> {
  const { data: invite, error } = await client
    .from("workspace_memberships")
    .select("id,org_id,workspace_id,role")
    .eq("status", "invited")
    .is("user_id", null)
    .ilike("invited_email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<PendingWorkspaceInvite>();

  if (error || !invite) return null;

  const now = new Date().toISOString();
  await client
    .from("workspace_memberships")
    .update({ user_id: user.id, status: "active", joined_at: now })
    .eq("id", invite.id);

  const orgRole = organizationRoleForWorkspaceRole(invite.role);
  const { data: orgInvite } = await client
    .from("organization_memberships")
    .select("id")
    .eq("org_id", invite.org_id)
    .eq("status", "invited")
    .is("user_id", null)
    .ilike("invited_email", email)
    .maybeSingle<{ id: string }>();

  if (orgInvite) {
    await client
      .from("organization_memberships")
      .update({ user_id: user.id, status: "active", joined_at: now })
      .eq("id", orgInvite.id);
  } else {
    const membership = {
      org_id: invite.org_id,
      user_id: user.id,
      invited_email: email,
      role: orgRole,
      status: "active",
      joined_at: now,
    };
    const { data: existingMembership } = await client
      .from("organization_memberships")
      .select("id")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>();

    if (existingMembership) {
      await client.from("organization_memberships").update(membership).eq("id", existingMembership.id);
    } else {
      await client.from("organization_memberships").insert(membership);
    }
  }

  return invite;
}

async function getActiveWorkspaceMembership(client: TypedSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("org_id,workspace_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ org_id: string; workspace_id: string }>();

  if (error) return null;
  return data ?? null;
}

export async function provisionAuthenticatedUser(user: User): Promise<ProvisionUserResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, status: "not_configured", message: "Supabase admin env vars are required to provision users." };
  }

  const email = normalizeEmail(user.email);
  if (!email) return { ok: false, status: "missing_email", message: "Supabase user is missing an email address." };

  const client = getSupabaseAdminClient();

  try {
    await upsertProfile(client, user, email);

    const activeMembership = await getActiveWorkspaceMembership(client, user.id);
    if (activeMembership) {
      return {
        ok: true,
        status: "existing_member",
        orgId: activeMembership.org_id,
        workspaceId: activeMembership.workspace_id,
      };
    }

    const invite = await acceptPendingInvite(client, user, email);
    if (invite) {
      return { ok: true, status: "invited_member", orgId: invite.org_id, workspaceId: invite.workspace_id };
    }

    return { ok: true, status: "profile_only", orgId: null, workspaceId: null };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "User provisioning failed.",
    };
  }
}
