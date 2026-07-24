import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export { isSupabaseAdminConfigured };

export type WaitlistPersistResult =
  | { ok: true; status: "created" | "exists" }
  | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

// Idempotent: re-joining with an email that's already on the list succeeds
// with "exists" rather than erroring, so the form can always show success.
export async function persistWaitlistSignup(
  email: string,
  source: string,
): Promise<WaitlistPersistResult> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("waitlist_signups").insert({ email, source });
  if (!error) return { ok: true, status: "created" };
  if (error.code === UNIQUE_VIOLATION) return { ok: true, status: "exists" };
  return { ok: false, error: error.message };
}
