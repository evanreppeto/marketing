// Seed a demo dispatch history so the Outbox shows the full send lifecycle
// (Queued → Scheduled → Sent → Delivered → Failed) instead of an empty board.
// These are RECORDS of human-approved sends — nothing here auto-sends; the app
// still only records state. Attaches to the demo org's real campaigns.
//
//   node scripts/seed-outbox-dispatches.mjs
//
// Idempotent: rows are tagged payload.seed = SEED; a re-run deletes those first.
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
const SEED = "outbox-demo";
const DAY = 86400000, HOUR = 3600000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

// [status, channel, deliverable label, audience, resultNote, scheduledOffsetMs, dispatchedOffsetMs]
const ROWS = [
  ["queued", "email", "Re-engagement — Email A", 2412, null, null, null],
  ["queued", "email", "Storm Rapid Response — Email", 8740, null, null, null],
  ["scheduled", "email", "Storm-zone update — Email", 11200, null, 2 * DAY, null],
  ["scheduled", "sms", "Adjuster referral — SMS", 430, null, 3 * DAY, null],
  ["sent", "email", "New-lead welcome — Email", 1180, "Delivering · 1,180 sending", null, -2 * HOUR],
  ["delivered", "email", "Proof story — Email", 3204, "44% open · 11% click · 0.4% bounce", null, -1 * DAY],
  ["failed", "email", "Estimate follow-up — Email", 96, "100% bounced · 550 mailbox unavailable · 96 recipients", null, -1 * DAY],
];

async function main() {
  const { data: campaigns, error: cErr } = await sb.from("campaigns").select("id").eq("org_id", ORG_ID).order("created_at").limit(ROWS.length);
  if (cErr) throw cErr;
  const ids = (campaigns ?? []).map((c) => c.id);
  if (!ids.length) throw new Error("No campaigns to attach dispatches to — seed campaigns first.");

  // Clear any prior demo dispatches on these campaigns (all dispatch data is demo).
  await sb.from("campaign_dispatches").delete().eq("org_id", ORG_ID).in("campaign_id", ids);

  const rows = ROWS.map(([status, channel, label, audience, note, sched, disp], i) => ({
    org_id: ORG_ID,
    campaign_id: ids[i % ids.length],
    channel,
    status,
    scheduled_for: sched != null ? iso(sched) : null,
    dispatched_at: disp != null ? iso(disp) : null,
    recipient_summary: label,
    audience_count: audience,
    result_note: note,
    payload: { seed: SEED },
  }));
  const { error } = await sb.from("campaign_dispatches").insert(rows);
  if (error) throw new Error(`insert dispatches: ${error.message}`);
  console.log(`campaign_dispatches: seeded ${rows.length} across the send lifecycle.`);
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
