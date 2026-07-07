import { cache } from "react";

import { createServerClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getAuthMode, getSupabaseAnonKey, getSupabaseAuthUrl } from "./auth-mode";
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

type QueryClient = SupabaseClient;

export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";
export const DEFAULT_WORKSPACE_KEY = process.env.DEFAULT_WORKSPACE_KEY ?? "default";

/** Cookie that pins which of a user's workspaces is active (set by the workspace switcher). */
export const ACTIVE_WORKSPACE_COOKIE = "signal_active_workspace";

export type WorkspaceRole = "owner" | "admin" | "marketer" | "reviewer" | "member" | "viewer";

export type WorkspaceContext = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  workspaceId: string | null;
  workspaceKey: string;
  workspaceSlug: string;
  workspaceName: string;
  role: WorkspaceRole | null;
  userId: string | null;
  source: "membership" | "default-org" | "legacy-org";
};

type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

type WorkspaceRow = {
  id: string;
  org_id: string;
  key: string;
  slug: string;
  name: string;
};

type WorkspaceMembershipRow = {
  org_id: string;
  workspace_id: string;
  role: WorkspaceRole;
};

export class WorkspaceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceUnavailableError";
  }
}

async function getSupabaseSessionUserId(): Promise<string | null> {
  if (getAuthMode() !== "supabase") return null;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(getSupabaseAuthUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Session refresh writes are handled by proxy.ts; workspace resolution is read-only.
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchOrgById(client: QueryClient, orgId: string): Promise<OrgRow | null> {
  const { data, error } = await client
    .from("organizations")
    .select("id,slug,name")
    .eq("id", orgId)
    .maybeSingle<OrgRow>();
  if (error) throw new WorkspaceUnavailableError(error.message);
  return data ?? null;
}

async function fetchDefaultOrg(client: QueryClient): Promise<OrgRow> {
  const { data, error } = await client
    .from("organizations")
    .select("id,slug,name")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle<OrgRow>();
  if (error) throw new WorkspaceUnavailableError(error.message);
  if (!data) throw new WorkspaceUnavailableError(`No organization found for slug "${DEFAULT_ORG_SLUG}".`);
  return data;
}

async function fetchWorkspaceById(client: QueryClient, workspaceId: string): Promise<WorkspaceRow | null> {
  const { data, error } = await client
    .from("workspaces")
    .select("id,org_id,key,slug,name")
    .eq("id", workspaceId)
    .eq("status", "active")
    .maybeSingle<WorkspaceRow>();
  if (error) throw new WorkspaceUnavailableError(error.message);
  return data ?? null;
}

async function fetchDefaultWorkspace(client: QueryClient, org: OrgRow): Promise<WorkspaceContext> {
  const { data, error } = await client
    .from("workspaces")
    .select("id,org_id,key,slug,name")
    .eq("org_id", org.id)
    .eq("key", DEFAULT_WORKSPACE_KEY)
    .eq("status", "active")
    .maybeSingle<WorkspaceRow>();

  if (error) {
    return {
      orgId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      workspaceId: null,
      workspaceKey: DEFAULT_WORKSPACE_KEY,
      workspaceSlug: org.slug,
      workspaceName: org.name,
      role: null,
      userId: null,
      source: "legacy-org",
    };
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    workspaceId: data?.id ?? null,
    workspaceKey: data?.key ?? DEFAULT_WORKSPACE_KEY,
    workspaceSlug: data?.slug ?? org.slug,
    workspaceName: data?.name ?? org.name,
    role: null,
    userId: null,
    source: data ? "default-org" : "legacy-org",
  };
}

async function fetchFirstMembership(client: QueryClient, userId: string): Promise<WorkspaceMembershipRow | null> {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("org_id,workspace_id,role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<WorkspaceMembershipRow>();
  if (error) throw new WorkspaceUnavailableError(error.message);
  return data ?? null;
}

/** A specific active membership for this user — used to honor the active-workspace cookie. */
async function fetchMembershipForWorkspace(
  client: QueryClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembershipRow | null> {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("org_id,workspace_id,role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle<WorkspaceMembershipRow>();
  if (error) throw new WorkspaceUnavailableError(error.message);
  return data ?? null;
}

export async function resolveWorkspaceContextForUser(
  client: QueryClient,
  userId: string | null,
  preferredWorkspaceId?: string | null,
): Promise<WorkspaceContext> {
  if (userId) {
    const membership =
      (preferredWorkspaceId ? await fetchMembershipForWorkspace(client, userId, preferredWorkspaceId) : null) ??
      (await fetchFirstMembership(client, userId));
    if (membership) {
      const [workspace, org] = await Promise.all([
        fetchWorkspaceById(client, membership.workspace_id),
        fetchOrgById(client, membership.org_id),
      ]);

      if (workspace && org) {
        return {
          orgId: org.id,
          orgSlug: org.slug,
          orgName: org.name,
          workspaceId: workspace.id,
          workspaceKey: workspace.key,
          workspaceSlug: workspace.slug,
          workspaceName: workspace.name,
          role: membership.role,
          userId,
          source: "membership",
        };
      }
    }

    throw new WorkspaceUnavailableError("No active workspace membership is available for this user.");
  }

  const org = await fetchDefaultOrg(client);
  return fetchDefaultWorkspace(client, org);
}

async function getPreferredWorkspaceId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Synthetic workspace for offline/local preview. When Supabase isn't configured
 * there's no membership to resolve, but the read-models already fall back to
 * ARC_DEMO_DATA bundles — this lets the signed-in shell render on top of them
 * instead of bouncing every page to /login. The synthetic ids never reach a
 * real query (no admin client exists to run one), so their exact value is inert.
 */
function buildDemoWorkspaceContext(): WorkspaceContext {
  const name = titleCaseSlug(DEFAULT_ORG_SLUG);
  return {
    orgId: "demo-org",
    orgSlug: DEFAULT_ORG_SLUG,
    orgName: name,
    workspaceId: "demo-workspace",
    workspaceKey: DEFAULT_WORKSPACE_KEY,
    workspaceSlug: DEFAULT_ORG_SLUG,
    workspaceName: name,
    role: "owner",
    userId: null,
    source: "default-org",
  };
}

export const getCurrentWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  if (!isSupabaseAdminConfigured()) {
    // Offline/local preview: no Supabase means no real membership to resolve, so
    // fall back to a synthetic demo workspace and let the app render against the
    // ARC_DEMO_DATA read-model fallbacks. Doubly gated (unconfigured + demo flag)
    // — this never fires in any deploy that has Supabase configured.
    if (isDemoDataEnabled()) return buildDemoWorkspaceContext();
    throw new WorkspaceUnavailableError("Supabase is not configured, so no workspace is available.");
  }

  const userId = await getSupabaseSessionUserId();
  const preferredWorkspaceId = await getPreferredWorkspaceId(userId);
  return resolveWorkspaceContextForUser(getSupabaseAdminClient(), userId, preferredWorkspaceId);
});

export async function getCurrentWorkspaceKey(): Promise<string> {
  return (await getCurrentWorkspaceContext()).workspaceKey;
}
