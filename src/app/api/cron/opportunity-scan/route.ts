import { NextResponse } from "next/server";

import { enqueueOpportunityScanTask } from "@/lib/opportunities/enqueue";
import { hasRecentOpportunityScan } from "@/lib/opportunities/recent-scan";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_HOURS = 20;

/**
 * Daily Vercel Cron entry. Reuses the Slice 1 opportunity-scan enqueue when:
 * authorized (CRON_SECRET), enabled (OPPORTUNITY_SCAN_CRON_ENABLED=1), Supabase
 * configured, and no scan ran in the last RECENT_HOURS. Off by default; fail-closed.
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
  if (await hasRecentOpportunityScan(RECENT_HOURS)) {
    return NextResponse.json({ ok: true, skipped: "recent" });
  }

  const result = await enqueueOpportunityScanTask({ operator: "Scheduled scan" });
  return NextResponse.json({ ok: result.ok, queued: result.ok, ...(result.error ? { error: result.error } : {}) });
}
