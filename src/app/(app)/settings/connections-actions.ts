"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { recordConnectionTest, upsertConnection } from "@/lib/connections/persistence";
import { testResendConnection } from "@/lib/connections/resend-client";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import type { SettingsWriteResult } from "./actions";

/**
 * Operator controls for the outbound `connections` registry (Resend email). The
 * secret itself lives in RESEND_API_KEY on the deploy and never touches these
 * actions — the row stores only the enable switch, the from-address, and test
 * telemetry. `executeResendDispatch` reads that row as gate 5/6 of the send, so
 * enabling here is what unlocks a real send (the linked approval must still be
 * approved — the outbound gate is never bypassed).
 */
export async function setEmailConnectionEnabled(input: {
  enabled: boolean;
  fromEmail?: string;
}): Promise<SettingsWriteResult> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx?.orgId) return { ok: false, error: "No active org to update." };

  try {
    await upsertConnection(getSupabaseAdminClient(), ctx.orgId, "resend", {
      enabled: input.enabled,
      fromEmail: input.fromEmail ?? null,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update Resend." };
  }

  revalidatePath("/settings");
  return { ok: true, persisted: true, message: input.enabled ? "Resend enabled." : "Resend disabled." };
}

/**
 * Real provider probe: hit Resend's /domains with the configured key. Records the
 * outcome on the row (best-effort — a test before the first enable simply has no
 * row to stamp). Returns the result so the UI can show healthy / the exact error.
 */
export async function testEmailConnection(): Promise<SettingsWriteResult> {
  await requireOperator();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Resend isn't configured — set RESEND_API_KEY on the deploy." };

  const result = await testResendConnection(apiKey);

  if (isSupabaseAdminConfigured()) {
    try {
      const ctx = await getCurrentWorkspaceContext();
      if (ctx.orgId) await recordConnectionTest(getSupabaseAdminClient(), ctx.orgId, "resend", result);
    } catch {
      // Telemetry is best-effort; never fail the test on a record error.
    }
  }

  revalidatePath("/settings");
  return result.ok
    ? { ok: true, persisted: true, message: "Resend connection is healthy." }
    : { ok: false, error: `Test failed: ${result.error ?? "unknown error"}` };
}
