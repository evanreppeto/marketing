import { DEFAULT_ORG_SLUG, WorkspaceUnavailableError, getCurrentWorkspaceContext } from "./workspace";

/**
 * Current-organization resolution: the single chokepoint for tenant isolation.
 *
 * The app still uses a service-role Supabase client in many read models, so
 * every app-layer query must be scoped through this resolver. It prefers a real
 * authenticated workspace membership. Without a session it resolves the sole org
 * when the database has exactly one, and refuses when there are several — it no
 * longer falls back to a hardcoded "seeded internal workspace" slug, because a
 * fallback that always names the same tenant is indistinguishable from having no
 * isolation at all. See fetchDefaultOrg in ./workspace.
 */
export { DEFAULT_ORG_SLUG };

export class OrgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgUnavailableError";
  }
}

export async function getCurrentOrgId(): Promise<string> {
  try {
    return (await getCurrentWorkspaceContext()).orgId;
  } catch (error) {
    if (error instanceof WorkspaceUnavailableError) {
      throw new OrgUnavailableError(error.message);
    }
    throw error;
  }
}

/** Test-only compatibility hook retained for older tests. */
export function __resetOrgCache() {}
