// Enrich the Big Shoulders Restoration demo Brain into a coherent, connected
// Knowledge Web: an Arc hub plus services, proof points, messaging angles,
// CTAs, campaigns, learnings and signals, wired to the personas / brand facts
// the graph already has. Turns the sparse 2-kind graph into the rich web the
// mockup shows — real rows the /brain graph reads, not fabricated UI.
//
//   node scripts/seed-brain-web.mjs
//
// Idempotent: every seeded node/edge carries source = SRC; a re-run deletes
// those first (edges before nodes) and re-inserts, so it never touches the
// real persona / brand-fact nodes and re-running is a clean replace.
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

const ORG_ID = "63b72a45-a6fc-4bf8-a6af-544910fdd844";
const SRC = "seed:brain-web";

// New nodes (key, kind, label, summary, tier, confidence).
const NODES = [
  ["web_arc", "arc", "Arc", "The marketing brain that connects everything BSR knows and orchestrates approval-gated work.", "trusted", 100],
  ["web_svc_storm", "service", "Storm & hail roof repair", "Core restoration service for storm- and hail-damaged roofs across the Chicago area.", "trusted", 96],
  ["web_svc_water", "service", "Water damage restoration", "Emergency water extraction, drying, and rebuild after floods and burst pipes.", "trusted", 95],
  ["web_svc_gutter", "service", "Gutter & siding", "Gutter, siding, and exterior repair — often bundled with roof work.", "trusted", 88],
  ["web_svc_tarp", "service", "Emergency tarping & board-up", "Same-day tarping and board-up to stop further damage before the full repair.", "trusted", 90],
  ["web_pp_142", "proof_point", "142 storm-zone roofs inspected", "Inspected 142 roofs in the Naperville storm zone this season.", "trusted", 92],
  ["web_pp_reviews", "proof_point", "4.9★ across 380 reviews", "Aggregate 4.9-star rating across 380 verified customer reviews.", "trusted", 94],
  ["web_pp_claims", "proof_point", "Insurance claims coordinated end-to-end", "We coordinate the entire insurance claim, from adjuster to payout.", "trusted", 91],
  ["web_pp_response", "proof_point", "24/7 response, under 60 minutes", "Median emergency response under 60 minutes, day or night.", "trusted", 89],
  ["web_ma_freeinspect", "messaging_angle", "Free inspection, no pressure", "Lead with a free, no-pressure inspection tied to each home's storm exposure.", "trusted", 90],
  ["web_ma_claim", "messaging_angle", "We handle the whole claim", "Reassure insured homeowners that we manage the entire insurance process.", "trusted", 88],
  ["web_ma_local", "messaging_angle", "Local crews, fast arrival", "Emphasize local, fast-arriving crews for property managers and multi-unit sites.", "trusted", 85],
  ["web_cta_inspect", "cta", "Book a free inspection", "Primary CTA for storm-response campaigns.", "trusted", 90],
  ["web_cta_call", "cta", "Call our 24/7 line", "Urgency CTA for active emergencies.", "trusted", 88],
  ["web_camp_storm", "campaign_ref", "Storm Rapid Response", "Storm-response package across email, SMS, paid social, and a landing page.", "trusted", 93],
  ["web_camp_reactivate", "campaign_ref", "Past-customer reactivation", "Reactivation sequence for past customers gone quiet.", "trusted", 84],
  ["web_camp_pm", "campaign_ref", "Property-manager outreach", "Multi-unit inspection outreach to property managers before the next storm.", "trusted", 82],
  ["web_learn_inspectfirst", "learning", "Inspection-first beats discounts", "Inspection-first messaging booked 2.4× more jobs than discount offers last spring.", "trusted", 87],
  ["web_learn_smswarm", "learning", "Warmer SMS lifts replies", "Rewriting SMS in a warmer register lifted reply rate ~18%.", "trusted", 83],
  ["web_learn_beforeafter", "learning", "Before/after creative wins", "Before/after storm-repair creative outperforms stock imagery on paid social.", "trusted", 85],
  ["web_sig_hail", "signal", "Naperville hail event · Jun 14", "NOAA-confirmed hailstorm over Naperville on June 14; 142 homes in the worst swath.", "trusted", 96],
  ["web_sig_competitor", "signal", "Competitor running storm ads", "A national competitor started running storm-response ads in the metro.", "observed", 72],
  ["web_seg_stormzone", "segment", "Storm-zone homeowners, older roof", "Arc-synthesized segment: storm-zone homeowners with a 14+ year roof.", "proposed", 67],
];

// Edges as [fromKey, toKey, relation]. Keys may be new (web_*) or existing.
const EDGES = [
  ["web_arc", "web_camp_storm", "orchestrates"], ["web_arc", "web_camp_reactivate", "orchestrates"], ["web_arc", "web_camp_pm", "orchestrates"],
  ["web_arc", "persona_homeowner_emergency", "knows"], ["web_arc", "web_pp_142", "knows"], ["web_arc", "web_sig_hail", "watches"], ["web_arc", "web_seg_stormzone", "proposed"],
  ["web_svc_storm", "persona_homeowner_emergency", "serves"], ["web_svc_storm", "persona_homeowner_rebuild", "serves"],
  ["web_svc_water", "persona_homeowner_emergency", "serves"], ["web_svc_gutter", "persona_property_manager", "serves"], ["web_svc_tarp", "persona_homeowner_emergency", "serves"],
  ["web_pp_claims", "bf_insurance", "supports"], ["web_pp_response", "bf_24_7", "supports"], ["web_pp_reviews", "web_svc_storm", "supports"], ["web_pp_142", "web_camp_storm", "supports"],
  ["web_ma_freeinspect", "persona_homeowner_preventative", "targets"], ["web_ma_freeinspect", "web_camp_storm", "used_in"],
  ["web_ma_claim", "persona_insurance_agent", "targets"], ["web_ma_claim", "web_camp_storm", "used_in"],
  ["web_ma_local", "persona_property_manager", "targets"], ["web_ma_local", "web_camp_pm", "used_in"],
  ["web_cta_inspect", "web_camp_storm", "used_in"], ["web_cta_call", "web_camp_reactivate", "used_in"],
  ["web_camp_storm", "persona_homeowner_emergency", "targets"], ["web_camp_reactivate", "persona_homeowner_preventative", "targets"], ["web_camp_pm", "persona_property_manager", "targets"],
  ["web_learn_inspectfirst", "web_camp_storm", "learned_from"], ["web_learn_smswarm", "web_camp_reactivate", "learned_from"], ["web_learn_beforeafter", "web_camp_storm", "learned_from"],
  ["web_sig_hail", "web_camp_storm", "relates_to"], ["web_sig_hail", "persona_homeowner_emergency", "relates_to"], ["web_sig_competitor", "web_camp_storm", "relates_to"],
  ["web_seg_stormzone", "persona_homeowner_emergency", "includes"], ["web_seg_stormzone", "web_camp_storm", "targeted_by"],
];

async function main() {
  // Idempotent clear (edges before nodes — edges FK the nodes).
  await sb.from("knowledge_edges").delete().eq("org_id", ORG_ID).eq("source", SRC);
  await sb.from("knowledge_nodes").delete().eq("org_id", ORG_ID).eq("source", SRC);

  // Insert new nodes, capture key → id. Outbound-affecting kinds need an
  // approver to be 'trusted' (knowledge_nodes_gated_trust_check) — this is a
  // demo seed, so it records the approval as 'seed'.
  const GATED = new Set(["brand_fact", "messaging_angle", "cta", "proof_point"]);
  const nowIso = new Date().toISOString();
  const rows = NODES.map(([k, kind, label, summary, tier, conf]) => {
    const row = { org_id: ORG_ID, kind, key: k, label, summary, trust_tier: tier, confidence: conf, source: SRC, created_by: "arc" };
    if (tier === "trusted" && GATED.has(kind)) { row.approved_by = "seed"; row.approved_at = nowIso; }
    return row;
  });
  const { data: inserted, error: nodeErr } = await sb.from("knowledge_nodes").insert(rows).select("id, key");
  if (nodeErr) throw new Error(`insert nodes: ${nodeErr.message}`);

  // Resolve every key → id (new + existing).
  const { data: all, error: allErr } = await sb.from("knowledge_nodes").select("id, key").eq("org_id", ORG_ID);
  if (allErr) throw new Error(`resolve nodes: ${allErr.message}`);
  const idByKey = new Map((all ?? []).map((r) => [r.key, r.id]));

  const edgeRows = [];
  const missing = new Set();
  for (const [fromKey, toKey, rel] of EDGES) {
    const from = idByKey.get(fromKey), to = idByKey.get(toKey);
    if (!from || !to) { if (!from) missing.add(fromKey); if (!to) missing.add(toKey); continue; }
    edgeRows.push({ org_id: ORG_ID, from_node_id: from, to_node_id: to, relation: rel, trust_tier: "trusted", source: SRC, created_by: "arc" });
  }
  const { error: edgeErr } = await sb.from("knowledge_edges").insert(edgeRows);
  if (edgeErr) throw new Error(`insert edges: ${edgeErr.message}`);

  console.log(`nodes: +${inserted.length} seeded`);
  console.log(`edges: +${edgeRows.length} seeded`);
  if (missing.size) console.warn(`skipped edges missing keys: ${[...missing].join(", ")}`);
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
