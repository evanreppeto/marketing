/**
 * Pure access-decision logic for Arc chat/project sharing. No I/O.
 *
 * A resource (a conversation or a project) is private to its owner by default.
 * It can be made visible to the whole workspace, or shared with specific users,
 * each share carrying a `view` or `collaborate` permission. A chat inside a
 * shared project inherits the project's grant (cascade) — represented here as
 * `inheritedShare`. Callers in `open`/dev auth mode bypass this function
 * entirely and grant full access.
 */

export type SharePermission = "view" | "collaborate";
export type ShareVisibility = "private" | "workspace";

export const SHARE_PERMISSIONS: readonly SharePermission[] = ["view", "collaborate"] as const;
export const SHARE_VISIBILITIES: readonly ShareVisibility[] = ["private", "workspace"] as const;

export function isSharePermission(value: unknown): value is SharePermission {
  return value === "view" || value === "collaborate";
}

export function isShareVisibility(value: unknown): value is ShareVisibility {
  return value === "private" || value === "workspace";
}

/** The shareable resource's own ownership + visibility settings. */
export type ShareableResource = {
  ownerId: string | null;
  workspaceId: string | null;
  visibility: ShareVisibility;
  /** Applies only when `visibility === "workspace"`. */
  workspacePermission: SharePermission;
};

/** What the current viewer brings to the decision. */
export type ViewerGrants = {
  userId: string | null;
  /** Is the viewer an active member of the resource's workspace? */
  isWorkspaceMember: boolean;
  /** Permission from a direct share row for (resource, viewer), if any. */
  directShare: SharePermission | null;
  /** Permission inherited from a shared parent project (cascade), if any. */
  inheritedShare: SharePermission | null;
};

export type AccessDecision = { canView: boolean; permission: SharePermission | null };

export function rankPermission(permission: SharePermission | null): number {
  if (permission === "collaborate") return 2;
  if (permission === "view") return 1;
  return 0;
}

export function strongerPermission(
  a: SharePermission | null,
  b: SharePermission | null,
): SharePermission | null {
  // Tie-break: equal rank returns `a`, so in resolveResourceAccess the push order of grants decides ties.
  return rankPermission(a) >= rankPermission(b) ? a : b;
}

export function resolveResourceAccess(
  resource: ShareableResource,
  viewer: ViewerGrants,
): AccessDecision {
  const grants: (SharePermission | null)[] = [];

  if (viewer.userId && resource.ownerId && viewer.userId === resource.ownerId) {
    grants.push("collaborate");
  }
  if (resource.visibility === "workspace" && viewer.isWorkspaceMember) {
    grants.push(resource.workspacePermission);
  }
  grants.push(viewer.directShare);
  grants.push(viewer.inheritedShare);

  let best: SharePermission | null = null;
  for (const grant of grants) {
    best = strongerPermission(best, grant);
  }
  return { canView: best !== null, permission: best };
}

/**
 * Whether the viewer may compose (send) in the chat surface.
 *
 * A fresh chat — no active conversation resolved — is ALWAYS composable: the
 * viewer owns the chat they're about to create, so the /arc landing page must
 * never lock the composer. View-only applies only to an existing conversation
 * the viewer can see but lacks collaborate access to. In open/dev mode
 * (`enforce === false`) composing is always allowed.
 */
export function canComposeInThread(input: {
  enforce: boolean;
  hasActiveConversation: boolean;
  activePermission: SharePermission | null;
}): boolean {
  if (!input.enforce) return true;
  if (!input.hasActiveConversation) return true;
  return input.activePermission === "collaborate";
}

export function hasRequiredPermission(
  decision: AccessDecision,
  required: SharePermission,
): boolean {
  // `decision.canView &&` is defensive: by construction canView is true iff permission is non-null, documenting the invariant.
  return decision.canView && rankPermission(decision.permission) >= rankPermission(required);
}
