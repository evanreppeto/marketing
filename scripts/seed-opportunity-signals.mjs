// Seed the external source-signals that the new opportunity detectors read, so a
// "Scan for opportunities" run yields one weather_event + one competitor_signal
// opportunity (alongside the cold-lead ones) against the Big Shoulders
// Restoration default org.
//
//   node scripts/seed-opportunity-signals.mjs
//
//   1. weather_events (global table, no org): one active NWS-style flood warning
//      → runWeatherEventDetection emits a geo-targeted storm-response opportunity.
//   2. competitor_campaigns (org-scoped): one confirmed ServPro Meta flight with
//      several creatives → runCompetitorSignalDetection emits a defensive-flight
//      opportunity.
//
// Idempotent: the weather row is matched by external_event_id, the competitor row
// by (org_id, source, competitor_name). Re-running refreshes their timestamps so
// they stay "active" (weather ends_at in the future, competitor recently captured).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const ORG_ID = "63b72a45-a6fc-4bf8-a6af-544910fdd844"; // Big Shoulders Restoration default org

const HOUR = 3600_000;

async function seedWeatherEvent() {
  const externalId = "seed-nws-flash-flood-riverside";
  const now = Date.now();
  const row = {
    source_system: "nws",
    external_event_id: externalId,
    status: "received",
    alert_type: "Flash Flood Warning",
    severity: "Severe",
    latitude: 41.8236,
    longitude: -87.8203,
    zip_codes: ["60546", "60513", "60402"],
    radius_miles: 6.0,
    starts_at: new Date(now - 2 * HOUR).toISOString(),
    ends_at: new Date(now + 24 * HOUR).toISOString(), // still active
    raw_payload: {
      event: "Flash Flood Warning",
      areaDesc: "Riverside; Brookfield; Berwyn",
      url: "https://www.weather.gov/lot/",
      sourceUrls: ["https://www.weather.gov/lot/", "https://water.noaa.gov/"],
    },
  };

  // Idempotent by external_event_id (no unique constraint, so match-then-update).
  const { data: existing, error: readErr } = await sb
    .from("weather_events")
    .select("id")
    .eq("external_event_id", externalId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { error } = await sb.from("weather_events").update(row).eq("id", existing.id);
    if (error) throw error;
    console.log(`weather_events: refreshed active flood warning (${existing.id}).`);
  } else {
    const { error } = await sb.from("weather_events").insert(row);
    if (error) throw error;
    console.log("weather_events: inserted one active flood warning.");
  }
}

async function seedCompetitorCampaign() {
  const competitorName = "ServPro";
  const source = "meta_ad_library";
  const row = {
    org_id: ORG_ID,
    source,
    competitor_name: competitorName,
    competitor_url: "https://www.facebook.com/ads/library/",
    persona: "persona_homeowner_emergency",
    status: "confirmed",
    captured_at: new Date().toISOString(), // fresh capture
    summary: "Active Meta flight targeting Oak Park / Berwyn water-damage queries.",
    channel_mix: { meta: 1 },
    est_spend: "$4k–8k/mo",
    top_keywords: ["water damage oak park", "flood cleanup berwyn", "emergency restoration", "basement flooding"],
    ad_creatives: [
      { headline: "24/7 Water Damage Cleanup" },
      { headline: "Fast Flood Response" },
      { headline: "Insurance-Approved Restoration" },
      { headline: "Free Damage Assessment" },
      { headline: "Certified Water Mitigation" },
      { headline: "Same-Day Emergency Service" },
    ],
    raw_payload: {},
  };

  // Idempotent by (org_id, source, competitor_name).
  const { data: existing, error: readErr } = await sb
    .from("competitor_campaigns")
    .select("id")
    .eq("org_id", ORG_ID)
    .eq("source", source)
    .eq("competitor_name", competitorName)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { error } = await sb.from("competitor_campaigns").update(row).eq("id", existing.id);
    if (error) throw error;
    console.log(`competitor_campaigns: refreshed confirmed ServPro flight (${existing.id}).`);
  } else {
    const { error } = await sb.from("competitor_campaigns").insert(row);
    if (error) throw error;
    console.log("competitor_campaigns: inserted one confirmed ServPro flight.");
  }
}

async function main() {
  await seedWeatherEvent();
  await seedCompetitorCampaign();
  console.log("Done. Run a 'Scan for opportunities' to surface the weather + competitor cards.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
