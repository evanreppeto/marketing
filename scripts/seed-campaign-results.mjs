import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    process.env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
}

function getSupabase() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Demo metrics per channel — realistic-ish numbers for a single 30-day period.
const CHANNELS = [
  { channel: "meta_ad", impressions: 42000, clicks: 940, calls: 12, forms: 28, leads: 22, jobs: 4, won_revenue_cents: 4200000, spend_cents: 850000 },
  { channel: "google_ads", impressions: 31000, clicks: 1280, calls: 31, forms: 41, leads: 37, jobs: 7, won_revenue_cents: 7100000, spend_cents: 1200000 },
  { channel: "email", impressions: 8600, clicks: 510, calls: 6, forms: 19, leads: 14, jobs: 3, won_revenue_cents: 2600000, spend_cents: 0 },
];

async function main() {
  const supabase = getSupabase();
  // Seed results for currently-live campaigns (launch_locked = false).
  const { data: campaigns, error } = await supabase.from("campaigns").select("id,name").eq("launch_locked", false).limit(20);
  if (error) throw new Error(`campaigns lookup failed: ${error.message}`);
  if (!campaigns || campaigns.length === 0) {
    console.log("No live campaigns (launch_locked = false). Launch one first, then re-run.");
    return;
  }

  let inserted = 0;
  for (const campaign of campaigns) {
    for (const c of CHANNELS) {
      const { error: insertError } = await supabase.from("campaign_results").insert({
        campaign_id: campaign.id,
        channel: c.channel,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        impressions: c.impressions,
        clicks: c.clicks,
        calls: c.calls,
        forms: c.forms,
        leads: c.leads,
        jobs: c.jobs,
        won_revenue_cents: c.won_revenue_cents,
        spend_cents: c.spend_cents,
        metadata: { source: "seed-campaign-results" },
      });
      if (insertError) throw new Error(`campaign_results insert failed: ${insertError.message}`);
      inserted += 1;
    }
    console.log(`Seeded results for "${campaign.name}" (${campaign.id})`);
  }
  console.log(`Done — inserted ${inserted} campaign_results rows across ${campaigns.length} live campaign(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
