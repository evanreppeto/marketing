// Seeds the Marketing Brain: 12 personas as persona nodes + starter BSR brand
// facts (trusted). Idempotent on the (org_id, kind, key) natural key.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  const envText = readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

function getSupabase() {
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

const PERSONAS = [
  ["persona_homeowner_emergency", "Emergency Homeowner"],
  ["persona_homeowner_preventative", "Inspection Homeowner"],
  ["persona_homeowner_rebuild", "Rebuild Homeowner"],
  ["persona_landlord", "Landlord"],
  ["persona_hoa_board", "HOA Board Member"],
  ["persona_property_manager", "Property Manager"],
  ["persona_insurance_agent", "Insurance Agent"],
  ["persona_listing_agent", "Listing Agent"],
  ["persona_buyers_agent", "Buyer Agent"],
  ["persona_plumbing_partner", "Plumbing Partner"],
  ["persona_hvac_roof_electrical_partner", "HVAC / Roofing / Electrical Partner"],
  ["persona_gc_remodeler_partner", "GC / Remodeler Partner"],
];

const BRAND_FACTS = [
  ["bf_24_7", "We answer 24/7", "Big Shoulders Restoration answers emergency calls around the clock."],
  ["bf_iicrc", "IICRC-certified technicians", "Crews are IICRC-certified for water, fire, and mold restoration."],
  ["bf_local", "Chicago-area, locally operated", "Local crews who know Chicago building stock and weather."],
  ["bf_insurance", "We work directly with insurance", "We document the loss and coordinate with carriers to ease claims."],
];

async function main() {
  const supabase = getSupabase();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgError || !org) {
    console.error(`Could not resolve org "${ORG_SLUG}":`, orgError?.message ?? "not found");
    process.exit(1);
  }
  const orgId = org.id;

  const personaRows = PERSONAS.map(([persona, label]) => ({
    org_id: orgId,
    kind: "persona",
    key: persona,
    label,
    persona,
    trust_tier: "trusted",
    source: "seed",
    created_by: "operator",
    approved_by: "seed",
    approved_at: new Date().toISOString(),
  }));

  const brandRows = BRAND_FACTS.map(([key, label, body]) => ({
    org_id: orgId,
    kind: "brand_fact",
    key,
    label,
    body,
    trust_tier: "trusted",
    source: "seed",
    created_by: "operator",
    approved_by: "seed",
    approved_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("knowledge_nodes")
    .upsert([...personaRows, ...brandRows], { onConflict: "org_id,kind,key" });
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log(`Seeded ${personaRows.length} personas + ${brandRows.length} brand facts into the brain.`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exit(1);
});
