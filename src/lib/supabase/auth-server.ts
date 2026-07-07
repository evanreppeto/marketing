import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { getSupabaseAnonKey, getSupabaseAuthUrl, isSupabaseAuthConfigured } from "@/lib/auth/auth-mode";

import { type Database } from "./database.types";

/**
 * Records the operator's "remember me" choice so Supabase token refreshes on later
 * requests keep the same persistence. Value "0" means "this session only"; absence
 * (or any other value) means "remember me". Written by the sign-in route.
 */
export const SUPABASE_REMEMBER_COOKIE = "arc-remember";

/** Supabase SSR stores the session in `sb-<ref>-auth-token` (chunked: `.0`, `.1`, …). */
function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

function getSupabaseAuthConfig() {
  const supabaseUrl = getSupabaseAuthUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase Auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export async function createSupabaseAuthServerClient(options?: { rememberMe?: boolean }) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Honor "remember me": when the operator opted out, the Supabase auth
        // cookies are written WITHOUT an expiry so they're cleared when the browser
        // closes. An explicit option (passed at sign-in) wins; otherwise we read the
        // persisted preference so background token refreshes keep the same scope.
        const remember =
          options?.rememberMe ?? cookieStore.get(SUPABASE_REMEMBER_COOKIE)?.value !== "0";

        cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
          const finalOptions =
            !remember && isSupabaseAuthCookie(name)
              ? { ...cookieOptions, maxAge: undefined, expires: undefined }
              : cookieOptions;
          cookieStore.set(name, value, finalOptions);
        });
      },
    },
  });
}

// Memoized per request with React `cache()`: the shell layout and each page both
// resolve the current user, so without this the auth round-trip ran twice on
// every navigation. `cache()` collapses that to one call per request.
export const getSupabaseAuthenticatedUser = cache(async () => {
  // No Supabase Auth configured (local/offline preview) → no authenticated user.
  // Callers already treat null as "signed out", so degrade instead of throwing.
  if (!isSupabaseAuthConfigured()) return null;

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
});
