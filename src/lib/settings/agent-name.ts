import { cache } from "react";

import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";

import { getAppSettings } from "./store";

/**
 * Resolved, operator-configured agent display name for server components.
 * Wrapped in React `cache()` so repeated reads within one request collapse to a
 * single app_settings query. Degrades to "Agent" when Supabase is unconfigured.
 */
export const getAgentName = cache(async (): Promise<string> => {
  const settings = await getAppSettings();
  return getAgentDisplayName(settings.assistantName);
});
