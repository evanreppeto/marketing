import { NextResponse } from "next/server";

import { getAuthMode, getRequestedAuthMode, isSupabaseAuthConfigured } from "@/lib/auth/auth-mode";
import { isOperatorGateEnabled } from "@/lib/auth/operator-shared";

/**
 * Read-only auth diagnostics. Returns only the resolved/requested mode and which
 * prerequisites are present — no secrets — so a deployment's effective auth mode
 * can be confirmed live (e.g. to catch a `supabase`-requested-but-`open`-resolved
 * misconfiguration without digging through dashboards).
 */
export async function GET() {
  return NextResponse.json({
    requested: getRequestedAuthMode(),
    resolved: getAuthMode(),
    supabaseConfigured: isSupabaseAuthConfigured(),
    operatorConfigured: isOperatorGateEnabled(),
  });
}
