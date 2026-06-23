import { isOperatorGateEnabled } from "./operator-shared";

export type AuthMode = "supabase" | "operator" | "open";
type AuthModeRequest = AuthMode | null;

export function getSupabaseAuthUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_MARKETING_SUPABASE_URL ||
    process.env.MARKETING_SUPABASE_URL ||
    ""
  );
}

export function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_MARKETING_SUPABASE_ANON_KEY ||
    process.env.MARKETING_SUPABASE_ANON_KEY ||
    ""
  );
}

export function isSupabaseAuthConfigured() {
  return Boolean(getSupabaseAuthUrl() && getSupabaseAnonKey());
}

export function getRequestedAuthMode(): AuthModeRequest {
  const value = (process.env.ARC_AUTH_MODE || process.env.AUTH_MODE || "").trim().toLowerCase();

  if (value === "supabase" || value === "operator" || value === "open") {
    return value;
  }

  return null;
}

const warnedFallbacks = new Set<string>();

function warnFallbackOnce(requestedMode: "supabase" | "operator", reason: string) {
  if (warnedFallbacks.has(requestedMode)) return;
  warnedFallbacks.add(requestedMode);
  console.warn(
    `[auth] ARC_AUTH_MODE=${requestedMode} requested but ${reason} — falling back to "open" (login disabled, all pages public). Set the missing config to enable sign-in.`,
  );
}

export function getAuthMode(): AuthMode {
  const requestedMode = getRequestedAuthMode();

  if (requestedMode === "supabase") {
    if (isSupabaseAuthConfigured()) return "supabase";
    warnFallbackOnce("supabase", "Supabase URL/anon key are missing");
  }

  if (requestedMode === "operator") {
    if (isOperatorGateEnabled()) return "operator";
    warnFallbackOnce("operator", "OPERATOR_ACCESS_TOKEN is missing");
  }

  return "open";
}

export function isInteractiveAuthEnabled() {
  return getAuthMode() !== "open";
}
