"use server";

import { redirect } from "next/navigation";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type WelcomeActionState = { ok: false; message: string } | null;

export async function completeInvitedAccountAction(
  _previous: WelcomeActionState,
  formData: FormData,
): Promise<WelcomeActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, message: "Those passwords don't match." };

  const supabase = await createSupabaseAuthServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?from=%2Fwelcome");

  const { error } = await supabase.auth.updateUser({
    password,
    data: fullName ? { full_name: fullName } : {},
  });
  if (error) return { ok: false, message: error.message };

  redirect("/");
}
