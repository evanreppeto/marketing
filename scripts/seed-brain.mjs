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

// Illustrative starter relationships so the brain reads as a connected graph:
// brand_fact -> persona via "governs" (the fact shapes how we speak to that
// persona); persona <-> persona via "relates_to" within a segment cluster.
const EDGES = [
  ["bf_24_7", "governs", "persona_homeowner_emergency"],
  ["bf_24_7", "governs", "persona_landlord"],
  ["bf_iicrc", "governs", "persona_homeowner_rebuild"],
  ["bf_iicrc", "governs", "persona_insurance_agent"],
  ["bf_local", "governs", "persona_property_manager"],
  ["bf_local", "governs", "persona_landlord"],
  ["bf_insurance", "governs", "persona_insurance_agent"],
  ["bf_insurance", "governs", "persona_homeowner_rebuild"],
  // homeowner cluster
  ["persona_homeowner_emergency", "relates_to", "persona_homeowner_preventative"],
  ["persona_homeowner_preventative", "relates_to", "persona_homeowner_rebuild"],
  ["persona_homeowner_emergency", "relates_to", "persona_homeowner_rebuild"],
  // trade-partner cluster
  ["persona_plumbing_partner", "relates_to", "persona_hvac_roof_electrical_partner"],
  ["persona_hvac_roof_electrical_partner", "relates_to", "persona_gc_remodeler_partner"],
  ["persona_plumbing_partner", "relates_to", "persona_gc_remodeler_partner"],
  // real-estate cluster
  ["persona_listing_agent", "relates_to", "persona_buyers_agent"],
  ["persona_insurance_agent", "relates_to", "persona_listing_agent"],
  // property-pro cluster
  ["persona_landlord", "relates_to", "persona_property_manager"],
  ["persona_property_manager", "relates_to", "persona_hoa_board"],
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

  // Idempotent without ON CONFLICT: the (org_id, kind, key) unique index is
  // PARTIAL (`where key is not null`), which PostgREST's on_conflict cannot
  // target. Instead clear prior seed rows (tagged source = "seed") for this org,
  // then insert fresh. Deleting the seed nodes cascades to their edges (FK
  // on delete cascade), so prior seed relationships are cleared too.
  const { error: clearError } = await supabase
    .from("knowledge_nodes")
    .delete()
    .eq("org_id", orgId)
    .eq("source", "seed");
  if (clearError) {
    console.error("Seed failed (clearing prior seed rows):", clearError.message);
    process.exit(1);
  }

  const { data: inserted, error } = await supabase
    .from("knowledge_nodes")
    .insert([...personaRows, ...brandRows])
    .select("id,key");
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  // Wire the illustrative relationships using the freshly-minted node ids.
  const idByKey = new Map((inserted ?? []).map((row) => [row.key, row.id]));
  const edgeRows = EDGES.map(([from, relation, to]) => ({
    org_id: orgId,
    from_node_id: idByKey.get(from),
    to_node_id: idByKey.get(to),
    relation,
    trust_tier: "trusted",
    source: "seed",
    created_by: "operator",
    approved_by: "seed",
    approved_at: new Date().toISOString(),
  })).filter((edge) => edge.from_node_id && edge.to_node_id);

  const { error: edgeError } = await supabase.from("knowledge_edges").insert(edgeRows);
  if (edgeError) {
    console.error("Seed failed (edges):", edgeError.message);
    process.exit(1);
  }

  console.log(
    `Seeded ${personaRows.length} personas + ${brandRows.length} brand facts + ${edgeRows.length} relationships into the brain.`,
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exit(1);
});
