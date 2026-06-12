import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMode, type MarkRoute } from "@/domain";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

// Operator-editable app settings. Persisted in the `app_settings` key/value table;
// NEVER secrets (those stay in env). Untyped SupabaseClient param — the table isn't
// in the generated database.types yet, matching the connections/vault layers.

export type AppSettings = {
  workspaceName: string;
  supportEmail: string;
  markDefaultMode: MarkMode;
  markDefaultRoute: MarkRoute;
  appearanceAccent: AppearanceAccent;
  appearanceDensity: AppearanceDensity;
  appearanceMotion: AppearanceMotion;
};

export type AppearanceAccent = "gold" | "blue" | "red" | "steel" | "emerald";
export type AppearanceDensity = "comfortable" | "compact";
export type AppearanceMotion = "standard" | "reduced";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  workspaceName: "Big Shoulders Restoration M&P",
  supportEmail: "",
  markDefaultMode: "act",
  markDefaultRoute: "fast",
  appearanceAccent: "gold",
  appearanceDensity: "comfortable",
  appearanceMotion: "standard",
};

export const DEFAULT_SUPPORT_EMAIL = "support@bigshouldersmp.com";

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

function appMarkMode(value: unknown): MarkMode {
  return value === "ask" || value === "act" || value === "draft" ? value : DEFAULT_APP_SETTINGS.markDefaultMode;
}

function appMarkRoute(value: unknown): MarkRoute {
  return value === "fast" || value === "standard" ? value : DEFAULT_APP_SETTINGS.markDefaultRoute;
}

export function appAppearanceAccent(value: unknown): AppearanceAccent {
  return value === "gold" || value === "blue" || value === "red" || value === "steel" || value === "emerald"
    ? value
    : DEFAULT_APP_SETTINGS.appearanceAccent;
}

export function appAppearanceDensity(value: unknown): AppearanceDensity {
  return value === "comfortable" || value === "compact" ? value : DEFAULT_APP_SETTINGS.appearanceDensity;
}

export function appAppearanceMotion(value: unknown): AppearanceMotion {
  return value === "standard" || value === "reduced" ? value : DEFAULT_APP_SETTINGS.appearanceMotion;
}

export function mergeAppSettingsRows(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const str = (key: string, fallback: string) => (typeof map.get(key) === "string" ? (map.get(key) as string) : fallback);
  return {
    workspaceName: str("workspace_name", DEFAULT_APP_SETTINGS.workspaceName) || DEFAULT_APP_SETTINGS.workspaceName,
    supportEmail: str("support_email", DEFAULT_APP_SETTINGS.supportEmail),
    markDefaultMode: appMarkMode(map.get("mark_default_mode")),
    markDefaultRoute: appMarkRoute(map.get("mark_default_route")),
    appearanceAccent: appAppearanceAccent(map.get("appearance_accent")),
    appearanceDensity: appAppearanceDensity(map.get("appearance_density")),
    appearanceMotion: appAppearanceMotion(map.get("appearance_motion")),
  };
}

export function getSupportContactEmail(
  settings: Pick<AppSettings, "supportEmail">,
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    settings.supportEmail.trim() ||
    env.OPERATOR_SUPPORT_EMAIL?.trim() ||
    env.OPERATOR_EMAIL?.trim() ||
    DEFAULT_SUPPORT_EMAIL
  );
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
  return mergeAppSettingsRows((data ?? []) as SettingRow[]);
}

/** Upsert one or more settings keys. Values are stored as jsonb. */
export async function saveAppSettings(client: SupabaseClient, entries: Record<string, unknown>): Promise<void> {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  const { error } = await client.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`app_settings upsert: ${error.message}`);
}
