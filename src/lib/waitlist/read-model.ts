import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";

import { isPlatformAdmin } from "./admin";

export type WaitlistSignupRow = {
  email: string;
  source: string;
  createdAt: string;
};

export type WaitlistView = {
  total: number;
  last7: number;
  bySource: Array<{ source: string; count: number }>;
  recent: WaitlistSignupRow[];
};

const RECENT_LIMIT = 50;

/**
 * The platform waitlist, for the Settings viewer.
 *
 * Returns null for everyone who isn't a platform admin (see ./admin) — the gate
 * runs BEFORE the query, so a non-admin's request never reads a single signup,
 * and the section simply doesn't render. Also null when Supabase isn't
 * configured (local/offline), so the UI degrades instead of throwing.
 */
export async function getWaitlistView(): Promise<WaitlistView | null> {
  const user = await getSupabaseAuthenticatedUser().catch(() => null);
  if (!isPlatformAdmin(user?.email)) return null;
  if (!isSupabaseAdminConfigured()) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("waitlist_signups")
    .select("email, source, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return null;

  const rows: WaitlistSignupRow[] = data.map((row) => ({
    email: row.email,
    source: row.source,
    createdAt: row.created_at,
  }));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.source, (counts.get(row.source) ?? 0) + 1);

  return {
    total: rows.length,
    last7: rows.filter((row) => Date.parse(row.createdAt) >= weekAgo).length,
    bySource: [...counts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    recent: rows.slice(0, RECENT_LIMIT),
  };
}
