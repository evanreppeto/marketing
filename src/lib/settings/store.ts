import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMode, type MarkRoute } from "@/domain";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

// Operator-editable app settings. Persisted in the `app_settings` key/value table;
// NEVER secrets (those stay in env). Untyped SupabaseClient param — the table isn't
// in the generated database.types yet, matching the connections/vault layers.

export type AppSettings = {
  workspaceName: string;
  workspaceProfile: WorkspaceProfile;
  productLabel: string;
  assistantName: string;
  assistantTone: AssistantTone;
  assistantResponseStyle: AssistantResponseStyle;
  approvalStrictness: ApprovalStrictness;
  brandShortName: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
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
export type WorkspaceProfile = "individual" | "company" | "agency";
export type AssistantTone = "direct" | "friendly" | "formal" | "sales";
export type AssistantResponseStyle = "brief" | "balanced" | "detailed";
export type ApprovalStrictness = "light" | "standard" | "strict";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  workspaceName: "Big Shoulders",
  workspaceProfile: "company",
  productLabel: "Marketing",
  assistantName: "Mark",
  assistantTone: "direct",
  assistantResponseStyle: "balanced",
  approvalStrictness: "standard",
  brandShortName: "BS",
  brandLogoUrl: "",
  brandFaviconUrl: "/icon.svg",
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

/** Trim + cap display labels. Empty input falls back at save/merge time. */
export function normalizeDisplayLabel(input: string, fallback: string, max = 80): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  return (trimmed || fallback).slice(0, max);
}

/** Short brand mark used when no uploaded logo exists. */
export function normalizeBrandShortName(input: string): string {
  const cleaned = input.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (cleaned || DEFAULT_APP_SETTINGS.brandShortName).slice(0, 4);
}

/**
 * Accept only safe image-ish sources for user-facing logos: app-relative paths,
 * http(s) URLs, or small data:image payloads from the upload control.
 */
export function normalizeBrandUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value.slice(0, 1500);
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value.slice(0, 1500);
  if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value) && value.length <= 750_000) {
    return value;
  }
  return "";
}

/** Accept a valid email, or empty (support email is optional). */
export function isValidSupportEmail(input: string): boolean {
  const trimmed = input.trim();
  return trimmed === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

type SettingRow = { key: string; value: unknown };

function logAppSettingsFallback(message: string): void {
  if (
    process.env.DEBUG_APP_SETTINGS !== "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return;
  }
  console.warn(`app_settings lookup failed, using defaults: ${message}`);
}

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

export function appWorkspaceProfile(value: unknown): WorkspaceProfile {
  return value === "individual" || value === "company" || value === "agency"
    ? value
    : DEFAULT_APP_SETTINGS.workspaceProfile;
}

export function appAssistantTone(value: unknown): AssistantTone {
  return value === "direct" || value === "friendly" || value === "formal" || value === "sales"
    ? value
    : DEFAULT_APP_SETTINGS.assistantTone;
}

export function appAssistantResponseStyle(value: unknown): AssistantResponseStyle {
  return value === "brief" || value === "balanced" || value === "detailed"
    ? value
    : DEFAULT_APP_SETTINGS.assistantResponseStyle;
}

export function appApprovalStrictness(value: unknown): ApprovalStrictness {
  return value === "light" || value === "standard" || value === "strict"
    ? value
    : DEFAULT_APP_SETTINGS.approvalStrictness;
}

export function mergeAppSettingsRows(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const str = (key: string, fallback: string) => (typeof map.get(key) === "string" ? (map.get(key) as string) : fallback);
  return {
    workspaceName: normalizeDisplayLabel(str("workspace_name", ""), DEFAULT_APP_SETTINGS.workspaceName),
    workspaceProfile: appWorkspaceProfile(map.get("workspace_profile")),
    productLabel: normalizeDisplayLabel(str("product_label", ""), DEFAULT_APP_SETTINGS.productLabel, 42),
    assistantName: normalizeDisplayLabel(str("assistant_name", ""), DEFAULT_APP_SETTINGS.assistantName, 32),
    assistantTone: appAssistantTone(map.get("assistant_tone")),
    assistantResponseStyle: appAssistantResponseStyle(map.get("assistant_response_style")),
    approvalStrictness: appApprovalStrictness(map.get("approval_strictness")),
    brandShortName: normalizeBrandShortName(str("brand_short_name", DEFAULT_APP_SETTINGS.brandShortName)),
    brandLogoUrl: normalizeBrandUrl(str("brand_logo_url", DEFAULT_APP_SETTINGS.brandLogoUrl)),
    brandFaviconUrl: normalizeBrandUrl(str("brand_favicon_url", DEFAULT_APP_SETTINGS.brandFaviconUrl)) || DEFAULT_APP_SETTINGS.brandFaviconUrl,
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

  try {
    const { data, error } = await supabase.from("app_settings").select("key,value");
    if (error) {
      logAppSettingsFallback(error.message);
      return { ...DEFAULT_APP_SETTINGS };
    }
    return mergeAppSettingsRows((data ?? []) as SettingRow[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logAppSettingsFallback(message);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/** Upsert one or more settings keys. Values are stored as jsonb. */
export async function saveAppSettings(client: SupabaseClient, entries: Record<string, unknown>): Promise<void> {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  const { error } = await client.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`app_settings upsert: ${error.message}`);
}
