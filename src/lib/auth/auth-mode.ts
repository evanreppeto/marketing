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

  // Explicit opt-out. The public demo / preview keeps every page open by setting
  // ARC_AUTH_MODE=open. This is also the instant "unlock" if a deploy's auth
  // backend ever misbehaves.
  if (requestedMode === "open") return "open";

  // Explicit legacy operator gate (shared OPERATOR_* credentials).
  if (requestedMode === "operator") {
    if (isOperatorGateEnabled()) return "operator";
    warnFallbackOnce("operator", "OPERATOR_ACCESS_TOKEN is missing");
    return "open";
  }

  // Secure by default: require Supabase sign-in whenever Supabase Auth is
  // configured — whether requested explicitly (ARC_AUTH_MODE=supabase) or left
  // unset. Wiring up a real auth backend shouldn't leave the app publicly open by
  // accident. When Supabase isn't configured we fall back to "open" so local dev
  // and CI stay usable and a misconfigured deploy can't lock everyone out.
  if (isSupabaseAuthConfigured()) return "supabase";
  if (requestedMode === "supabase") {
    warnFallbackOnce("supabase", "Supabase URL/anon key are missing");
  }

  return "open";
}

export function isInteractiveAuthEnabled() {
  return getAuthMode() !== "open";
}

// Pre-pricing gate: self-serve sign-up is closed in supabase mode (production)
// until pricing ships — the landing waitlist is the front door instead. Invited
// teammates still join via /accept-invite. Set ARC_SELF_SERVE_SIGNUP=1 to
// reopen /sign-up without a code change.
export function isSelfServeSignupOpen(): boolean {
  return getAuthMode() !== "supabase" || process.env.ARC_SELF_SERVE_SIGNUP === "1";
}
