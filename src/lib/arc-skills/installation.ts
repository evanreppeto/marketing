import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";

import { ARC_SKILL_LIBRARY } from "./catalog";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export const ARC_INSTALLED_SKILLS_SETTING = "arc_installed_skill_keys";

const LIBRARY_KEYS = new Set(ARC_SKILL_LIBRARY.map((skill) => skill.key));

export function parseInstalledArcSkillKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key): key is string => typeof key === "string" && LIBRARY_KEYS.has(key)))];
}

export async function getInstalledArcSkillKeys(
  orgId: string | null | undefined,
  client?: SupabaseClient,
): Promise<string[]> {
  if (!orgId) return [];
  const supabase = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("org_id", orgId)
    .eq("key", ARC_INSTALLED_SKILLS_SETTING)
    .maybeSingle();

  if (error) return [];
  return parseInstalledArcSkillKeys((data as { value?: unknown } | null)?.value);
}
