import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

// Operator-editable app settings. Persisted in the `app_settings` key/value table;
// NEVER secrets (those stay in env). Untyped SupabaseClient param — the table isn't
// in the generated database.types yet, matching the connections/vault layers.

export type AppSettings = {
  workspaceName: string;
  supportEmail: string;
  markWebhookEnabled: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  workspaceName: "Big Shoulders Restoration M&P",
  supportEmail: "",
  markWebhookEnabled: true,
};

/** Trim + cap a workspace name. Empty input falls back to the default at save time. */
export function normalizeWorkspaceName(input: string): string {
  return input.trim().slice(0, 80);
}

/** Accept a valid email, or empty (support email is optional). */
export function isValidSupportEmail(input: string): boolean {
  const trimmed = input.trim();
  return trimmed === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

type SettingRow = { key: string; value: unknown };

function mergeRows(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const str = (key: string, fallback: string) => (typeof map.get(key) === "string" ? (map.get(key) as string) : fallback);
  const bool = (key: string, fallback: boolean) => (typeof map.get(key) === "boolean" ? (map.get(key) as boolean) : fallback);
  return {
    workspaceName: str("workspace_name", DEFAULT_APP_SETTINGS.workspaceName) || DEFAULT_APP_SETTINGS.workspaceName,
    supportEmail: str("support_email", DEFAULT_APP_SETTINGS.supportEmail),
    markWebhookEnabled: bool("mark_webhook_enabled", DEFAULT_APP_SETTINGS.markWebhookEnabled),
  };
}

/**
 * Read app settings, merged over defaults. Degrades gracefully to defaults when
 * Supabase isn't configured or the table hasn't been migrated yet — never throws.
 */
export async function getAppSettings(client?: SupabaseClient): Promise<AppSettings> {
  const supabase: SupabaseClient | null = client ?? (isSupabaseAdminConfigured() ? getSupabaseAdminClient() : null);
  if (!supabase) return { ...DEFAULT_APP_SETTINGS };

  const { data, error } = await supabase.from("app_settings").select("key,value");
  if (error) {
    console.warn(`app_settings lookup failed, using defaults: ${error.message}`);
    return { ...DEFAULT_APP_SETTINGS };
  }
  return mergeRows((data ?? []) as SettingRow[]);
}

/** Upsert one or more settings keys. Values are stored as jsonb. */
export async function saveAppSettings(client: SupabaseClient, entries: Record<string, unknown>): Promise<void> {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  const { error } = await client.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`app_settings upsert: ${error.message}`);
}
