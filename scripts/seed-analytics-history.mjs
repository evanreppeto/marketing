// Seed a coherent ~60-day CRM history (leads, jobs, won outcomes) for the Big
// Shoulders Restoration demo org, so the Analytics screen has real, wired data
// to render a Trend chart, period-over-period KPI deltas, a funnel, and
// revenue/leads breakdowns — instead of the sparse handful of rows. Recent
// 30 days are weighted heavier than the prior 30 so deltas read positive.
//
//   node scripts/seed-analytics-history.mjs
//
// Idempotent: every row is tagged metadata.seed_batch = SEED_BATCH; a re-run
// deletes just those rows first, so it never touches real/other-seed data and
// re-running produces the same dataset (deterministic PRNG, no wall-clock in
// the distributions beyond "now" as the anchor).
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
const SEED_BATCH = "analytics-history-v1";
const NOW = Date.now();
const DAY = 86400000;

const N_LEADS = 190;
const N_JOBS = 56;
const N_OUTCOMES = 60;

// deterministic PRNG so re-runs are identical
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0xa11ce);

function weightedPick(pairs, r) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [value, w] of pairs) {
    if ((x -= w) < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

// Bias day offset toward recent (smaller offset) so the last 30d out-weigh the
// prior 30d — but only gently, so period deltas read as believable growth
// (~+15%) rather than an implausible spike.
function recentBiasedDayOffset(r) {
  return Math.floor(60 * Math.pow(r, 1.12)); // 0..59, mildly denser near 0
}
function iso(daysAgo, r) {
  // spread within the day by a fractional part so buckets aren't all at midnight
  return new Date(NOW - daysAgo * DAY - Math.floor(r * DAY)).toISOString();
}

const PERSONAS = [
  ["persona_homeowner_emergency", 5],
  ["persona_homeowner_preventative", 3],
  ["persona_property_manager", 3],
  ["persona_plumbing_partner", 3],
  ["persona_insurance_agent", 2],
  ["persona_homeowner_rebuild", 2],
  ["persona_hvac_roof_electrical_partner", 2],
  ["persona_landlord", 1],
];
const SOURCES = [
  ["Website", 5],
  ["Google Ads", 4],
  ["Referral", 4],
  ["Facebook", 3],
  ["Storm canvassing", 2],
  ["Nextdoor", 2],
];
const LEAD_STATUS = [
  ["qualified", 5],
  ["new", 4],
  ["validated", 3],
  ["converted", 4],
  ["lost", 2],
];

async function fetchRefs() {
  const [{ data: companies }, { data: contacts }] = await Promise.all([
    sb.from("companies").select("id").eq("org_id", ORG_ID).limit(60),
    sb.from("contacts").select("id").eq("org_id", ORG_ID).limit(60),
  ]);
  const companyIds = (companies ?? []).map((r) => r.id);
  const contactIds = (contacts ?? []).map((r) => r.id);
  if (!companyIds.length && !contactIds.length) throw new Error("No companies or contacts to attach history to — seed the CRM first.");
  return { companyIds, contactIds };
}
const pick = (arr, i) => (arr.length ? arr[i % arr.length] : null);

function buildLeads(refs) {
  const rows = [];
  for (let i = 0; i < N_LEADS; i++) {
    const d = recentBiasedDayOffset(rnd());
    const at = iso(d, rnd());
    rows.push({
      org_id: ORG_ID,
      persona: weightedPick(PERSONAS, rnd()),
      source: weightedPick(SOURCES, rnd()),
      company_id: pick(refs.companyIds, i),
      contact_id: pick(refs.contactIds, i + 3),
      lead_score: 42 + Math.floor(rnd() * 54), // 42..95
      status: weightedPick(LEAD_STATUS, rnd()),
      created_at: at,
      received_at: at,
      updated_at: at,
      metadata: { seed_batch: SEED_BATCH },
    });
  }
  return rows;
}

function buildJobs(refs) {
  const rows = [];
  for (let i = 0; i < N_JOBS; i++) {
    const d = recentBiasedDayOffset(rnd());
    const at = iso(d, rnd());
    const completed = rnd() < 0.55;
    rows.push({
      org_id: ORG_ID,
      persona: weightedPick(PERSONAS, rnd()),
      company_id: pick(refs.companyIds, i),
      contact_id: pick(refs.contactIds, i + 1),
      status: completed ? "completed" : "scheduled",
      job_number: `DEMO-${String(1000 + i)}`,
      estimated_revenue_cents: (3000 + Math.floor(rnd() * 15000)) * 100, // $3k..$18k
      scheduled_at: at,
      completed_at: completed ? at : null,
      created_at: at,
      updated_at: at,
      metadata: { seed_batch: SEED_BATCH },
    });
  }
  return rows;
}

function buildOutcomes(refs, jobIds, leadIds) {
  const rows = [];
  for (let i = 0; i < N_OUTCOMES; i++) {
    const d = recentBiasedDayOffset(rnd());
    const at = iso(d, rnd());
    const revenue = (2500 + Math.floor(rnd() * 13500)) * 100; // $2.5k..$16k
    const status = rnd() < 0.82 ? "won" : rnd() < 0.6 ? "paid" : "lost";
    const isWin = status === "won" || status === "paid";
    rows.push({
      org_id: ORG_ID,
      persona: weightedPick(PERSONAS, rnd()),
      job_id: pick(jobIds, i),
      lead_id: pick(leadIds, i * 2 + 1),
      company_id: pick(refs.companyIds, i + 2),
      contact_id: pick(refs.contactIds, i),
      status,
      gross_revenue_cents: isWin ? revenue : 0,
      gross_margin_cents: isWin ? Math.floor(revenue * 0.42) : 0,
      created_at: at,
      closed_at: isWin ? at : null,
      updated_at: at,
      metadata: { seed_batch: SEED_BATCH },
    });
  }
  return rows;
}

async function clearBatch(table) {
  // Supabase can't filter on jsonb ->> directly in .delete().eq, so use a match on the tagged column via rpc-free filter.
  const { error } = await sb.from(table).delete().eq("org_id", ORG_ID).contains("metadata", { seed_batch: SEED_BATCH });
  if (error) throw new Error(`clear ${table}: ${error.message}`);
}

async function insertAll(table, rows) {
  const ids = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await sb.from(table).insert(rows.slice(i, i + 200)).select("id");
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    for (const r of data ?? []) ids.push(r.id);
  }
  return ids;
}

async function main() {
  for (const t of ["outcomes", "jobs", "leads"]) await clearBatch(t);

  const refs = await fetchRefs();
  const leads = buildLeads(refs);
  const jobs = buildJobs(refs);
  const leadIds = await insertAll("leads", leads);
  const jobIds = await insertAll("jobs", jobs);
  const outcomes = buildOutcomes(refs, jobIds, leadIds);
  await insertAll("outcomes", outcomes);

  const recent = (rows) => rows.filter((r) => new Date(r.created_at).getTime() >= NOW - 30 * DAY).length;
  const wonRevenue = outcomes
    .filter((o) => new Date(o.created_at).getTime() >= NOW - 30 * DAY && (o.status === "won" || o.status === "paid"))
    .reduce((s, o) => s + o.gross_revenue_cents, 0);
  console.log(`leads:    ${leads.length} (recent 30d: ${recent(leads)})`);
  console.log(`jobs:     ${jobs.length} (recent 30d: ${recent(jobs)})`);
  console.log(`outcomes: ${outcomes.length} (recent 30d: ${recent(outcomes)})`);
  console.log(`recent won revenue: $${Math.round(wonRevenue / 100).toLocaleString()}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
