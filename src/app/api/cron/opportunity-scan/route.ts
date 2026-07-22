import { NextResponse } from "next/server";

import { enqueueOpportunityScanTask } from "@/lib/opportunities/enqueue";
import { hasRecentOpportunityScan } from "@/lib/opportunities/recent-scan";
import { runDeterministicOpportunityScan, type OpportunityScanSummary } from "@/lib/opportunities/scan";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_HOURS = 20;

/**
 * Daily Vercel Cron entry. Two layers, both read-only:
 *  1. The deterministic detectors (cold leads, weather, competitors, next-iteration
 *     campaign follow-ups) run every pass — cheap and idempotent (upsert dedup) — so
 *     opportunities refresh on schedule without an operator clicking "Scan".
 *  2. The generative Arc scan (finds what the detectors miss) is enqueued, deduped
 *     against a scan in the last RECENT_HOURS.
 * Authorized (CRON_SECRET), enabled (OPPORTUNITY_SCAN_CRON_ENABLED=1), Supabase
 * configured. Off by default; fail-closed on auth.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (process.env.OPPORTUNITY_SCAN_CRON_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  // Refresh deterministic opportunities every scheduled pass. Best-effort — a
  // detector failure must not block the generative scan below.
  let deterministic: "ok" | "error" = "ok";
  // Carried into the response so a scheduled pass that rejects everything below
  // the confidence floor is visible in the cron log, not indistinguishable from
  // a pass that genuinely found nothing.
  let scan: OpportunityScanSummary = { added: 0, filtered: 0 };
  try {
    scan = await runDeterministicOpportunityScan();
  } catch {
    deterministic = "error";
  }

  if (await hasRecentOpportunityScan(RECENT_HOURS)) {
    return NextResponse.json({ ok: true, deterministic, scan, skipped: "recent" });
  }

  const result = await enqueueOpportunityScanTask({ operator: "Scheduled scan" });
  return NextResponse.json({ ok: result.ok, deterministic, scan, queued: result.ok, ...(result.error ? { error: result.error } : {}) });
}
