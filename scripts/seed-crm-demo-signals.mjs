// Seed the CRM demo "signals" that make two already-built screens render like
// their mockups against the Big Shoulders Restoration default org:
//
//   1. Open follow-up tasks (crm_tasks) on a few contacts, so the CRM board's
//      Tasks column shows "N open" instead of "—".
//   2. Lead-score + recency fields on pending opportunities' evidence jsonb, so
//      the Home top-opportunity shows its [1][2][3] source/score/recency chips.
//
//   node scripts/seed-crm-demo-signals.mjs
//
// Idempotent: tasks are matched by (contact, title) and re-inserted; the
// opportunity evidence merge only adds fields that are missing. Contacts are
// resolved by full_name so this survives a reseed with different ids.
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

// Open follow-up tasks, keyed by contact full_name. A mix of counts (2 / 1 / 2 /
// 1) so the Tasks column shows variety like the mockup.
const TASKS = [
  { contact: "Jordan Vega", title: "Send storm-response inspection quote", priority: "high", status: "open", author_kind: "agent", author_name: "Arc", dueDays: 2 },
  { contact: "Jordan Vega", title: "Confirm roof photos received", priority: "normal", status: "open", author_kind: "human", author_name: "Riley", dueDays: 1 },
  { contact: "Priya Nasser", title: "Follow up on insurance adjuster intro", priority: "high", status: "open", author_kind: "agent", author_name: "Arc", dueDays: -1 },
  { contact: "Marcus Ellison", title: "Schedule free inspection", priority: "urgent", status: "open", author_kind: "agent", author_name: "Arc", dueDays: 1 },
  { contact: "Marcus Ellison", title: "Share before/after case study", priority: "normal", status: "in_progress", author_kind: "human", author_name: "Riley", dueDays: 3 },
  { contact: "Dana Okafor", title: "Call back re: gutter estimate", priority: "normal", status: "open", author_kind: "human", author_name: "Riley", dueDays: 2 },
];

function dueAt(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function seedTasks() {
  const names = [...new Set(TASKS.map((t) => t.contact))];
  const { data: contacts, error } = await sb.from("contacts").select("id, full_name").eq("org_id", ORG_ID).in("full_name", names);
  if (error) throw error;
  const idByName = new Map((contacts ?? []).map((c) => [c.full_name, c.id]));

  let inserted = 0;
  for (const t of TASKS) {
    const entityId = idByName.get(t.contact);
    if (!entityId) {
      console.warn(`  · skipped "${t.title}" — no contact "${t.contact}"`);
      continue;
    }
    // Idempotent: clear any prior copy of this exact task on this contact.
    await sb.from("crm_tasks").delete().eq("org_id", ORG_ID).eq("entity_id", entityId).eq("title", t.title);
    const { error: insErr } = await sb.from("crm_tasks").insert({
      org_id: ORG_ID,
      entity_type: "contact",
      entity_id: entityId,
      title: t.title,
      priority: t.priority,
      status: t.status,
      author_kind: t.author_kind,
      author_name: t.author_name,
      assignee_kind: "human",
      due_at: dueAt(t.dueDays),
    });
    if (insErr) throw insErr;
    inserted += 1;
  }
  console.log(`crm_tasks: seeded ${inserted} open follow-up tasks across ${names.length} contacts.`);
}

async function enrichOpportunityEvidence() {
  const { data: opps, error } = await sb
    .from("opportunities")
    .select("id, confidence, evidence")
    .eq("org_id", ORG_ID)
    .eq("status", "pending");
  if (error) throw error;

  let updated = 0;
  for (const o of opps ?? []) {
    const ev = (o.evidence && typeof o.evidence === "object") ? o.evidence : {};
    if (typeof ev.leadScore === "number") continue; // already enriched
    const conf = typeof o.confidence === "number" ? o.confidence : 60;
    const next = { ...ev, leadScore: Math.min(96, conf + 9), daysCold: Math.max(4, Math.round((100 - conf) * 0.4)) };
    const { error: upErr } = await sb.from("opportunities").update({ evidence: next }).eq("id", o.id);
    if (upErr) throw upErr;
    updated += 1;
  }
  console.log(`opportunities: enriched evidence (leadScore + daysCold) on ${updated} pending rows.`);
}

async function main() {
  await seedTasks();
  await enrichOpportunityEvidence();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
