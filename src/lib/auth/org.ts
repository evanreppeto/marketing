import { DEFAULT_ORG_SLUG, WorkspaceUnavailableError, getCurrentWorkspaceContext } from "./workspace";

/**
 * Current-organization resolution: the single chokepoint for tenant isolation.
 *
 * The app still uses a service-role Supabase client in many read models, so
 * every app-layer query must be scoped through this resolver. It now prefers a
 * real authenticated workspace membership and falls back to the seeded internal
 * workspace while the product backend is being rolled forward.
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
