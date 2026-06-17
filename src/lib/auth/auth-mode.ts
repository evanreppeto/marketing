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

function getRequestedAuthMode(): AuthModeRequest {
  const value = (process.env.ARC_AUTH_MODE || process.env.AUTH_MODE || "").trim().toLowerCase();

  if (value === "supabase" || value === "operator" || value === "open") {
    return value;
  }

  return null;
}

export function getAuthMode(): AuthMode {
  const requestedMode = getRequestedAuthMode();

  if (requestedMode === "supabase" && isSupabaseAuthConfigured()) {
    return "supabase";
  }

  if (requestedMode === "operator" && isOperatorGateEnabled()) {
    return "operator";
  }

  return "open";
}

export function isInteractiveAuthEnabled() {
  return getAuthMode() !== "open";
}
