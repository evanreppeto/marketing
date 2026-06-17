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

async function seedBsrBrandKit() {
  const supabase = getSupabase();

  const ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new Error(`Org not found for slug ${ORG_SLUG}`);

  const profile = {
    org_id: org.id,
    display_name: "Big Shoulders Restoration",
    industry: "home_property_services",
    tone: "reassuring",
    services: ["Water mitigation", "Documentation", "Rebuild coordination"],
    banned_phrases: [
      "insurance will cover",
      "insurance will pay",
      "insurance will approve",
      "claim will be approved",
      "guaranteed payout",
      "guaranteed coverage",
      "guaranteed approval",
      "we guarantee",
    ],
    guardrails: {
      disallowedClaims: [
        "Insurance outcome promise",
        "Claim approval promise",
        "Guaranteed insurance result",
        "Unsupported guarantee",
      ],
      complianceNotes:
        "Coverage-neutral language required. No claim approval or payout promises.",
    },
    status: "active",
    onboarding_completed_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("business_profiles")
    .upsert(profile, { onConflict: "org_id" });
  if (upErr) throw upErr;

  // audience_type values match the prod persona_definitions_audience_type_check
  // constraint: homeowner | property | insurance | real_estate | trade_partner.
  const personas = [
    ["persona_homeowner_emergency", "Homeowner — Emergency", "homeowner", 0],
    ["persona_homeowner_preventative", "Homeowner — Preventative", "homeowner", 1],
    ["persona_homeowner_rebuild", "Homeowner — Rebuild", "homeowner", 2],
    ["persona_landlord", "Landlord", "property", 3],
    ["persona_hoa_board", "HOA Board", "property", 4],
    ["persona_property_manager", "Property Manager", "property", 5],
    ["persona_insurance_agent", "Insurance Agent", "insurance", 6],
    ["persona_listing_agent", "Listing Agent", "real_estate", 7],
    ["persona_buyers_agent", "Buyer's Agent", "real_estate", 8],
    ["persona_plumbing_partner", "Plumbing Partner", "trade_partner", 9],
    ["persona_hvac_roof_electrical_partner", "HVAC/Roof/Electrical Partner", "trade_partner", 10],
    ["persona_gc_remodeler_partner", "GC / Remodeler Partner", "trade_partner", 11],
  ].map(([key, label, audience_type, sort_order]) => ({
    org_id: org.id,
    key,
    label,
    audience_type,
    sort_order,
    is_active: true,
    metadata: {},
  }));

  const { error: pErr } = await supabase
    .from("persona_definitions")
    .upsert(personas, { onConflict: "org_id,key" });
  if (pErr) throw pErr;

  console.log(`Seeded Brand Kit + ${personas.length} personas for ${ORG_SLUG}`);
}

seedBsrBrandKit()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exit(1);
  });
