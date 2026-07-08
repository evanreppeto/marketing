import { cache } from "react";

import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getCurrentOrgId } from "@/lib/auth/org";

import { getAppSettings } from "./store";

/**
 * Resolved, operator-configured agent display name for server components.
 * Wrapped in React `cache()` so repeated reads within one request collapse to a
 * single app_settings query. Org is resolved best-effort (settings are
 * per-workspace); degrades to "Agent" when there's no workspace/Supabase.
 */
export const getAgentName = cache(async (): Promise<string> => {
  const orgId = await getCurrentOrgId().catch(() => null);
  const settings = await getAppSettings(orgId);
  return getAgentDisplayName(settings.assistantName);
});
