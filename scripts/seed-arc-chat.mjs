/**
 * Seed a few rich demo Arc conversations (with reasoning traces + recall chips)
 * into the default workspace, so `/arc` opens looking alive instead of empty on
 * a fresh preview database.
 *
 * Visible in both auth modes: rows are stamped with `operator` (open/dev mode
 * lists by operator) AND `visibility: "workspace"` + `workspace_id` (Supabase
 * mode lists by workspace membership). Re-running replaces prior demo rows
 * (tagged `metadata.seed = "arc-chat-demo"`).
 *
 *   pnpm seed:arc-chat
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  try {
    const envText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      if (process.env[key] === undefined) process.env[key] = trimmed.slice(i + 1).trim();
    }
  } catch {
    // No .env.local — rely on the ambient environment (e.g. a deploy shell).
  }
}

function getSupabase() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked .env.local + environment).");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ORG_SLUG = process.env.DEFAULT_ORG_SLUG || "big-shoulders-restoration";
const WORKSPACE_KEY = process.env.DEFAULT_WORKSPACE_KEY || "default";
const OPERATOR = process.env.OPERATOR_EMAIL?.trim() || "Operator";
const SEED_TAG = "arc-chat-demo";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Conversations, newest first. `age` = ms before now the thread last moved. */
const CONVERSATIONS = [
  {
    title: "Storm-damage homeowners",
    pinned: true,
    age: HOUR,
    messages: [
      {
        role: "operator",
        body: "Which homeowners should we reach first after the Naperville hailstorm?",
      },
      {
        role: "arc",
        body:
          "**142 homes** took the heaviest hail and still haven't booked an inspection — about **23% of the storm zone** and ~$1.4M in estimated restoration work.\n\nThe clearest urgency signals:\n\n- Sit in the **worst-hit hail swath** with no inspection on file — 3.1× more likely to have hidden damage\n- No inspection booked in the **6 days** since the storm\n- Older roof — most likely to need a full insurance claim",
        metadata: {
          reasoning:
            "Pulled the storm-zone segment from CRM and ranked homes by insurance-claim readiness, then cross-checked last spring's response data before recommending an angle.",
          steps: [
            { label: "Pulled the 142 hardest-hit homes and grouped them by claim readiness", status: "done" },
            { label: "Compared discount vs. inspection-first response from last spring — inspection-first booked 2.4× more jobs", status: "done" },
            { label: "Chose a free-inspection angle, no discount gimmick", status: "done" },
          ],
          recall: [
            { label: "Storm-response playbook", confidence: 94 },
            { label: "Inspection-first beat discounts last spring", confidence: 88 },
          ],
          suggestions: ["Draft the outreach email", "Show the storm-zone map", "Which persona converts best?"],
        },
      },
    ],
  },
  {
    title: "Past-customer spring reactivation",
    pinned: false,
    age: DAY,
    messages: [
      { role: "operator", body: "Draft a spring reactivation angle for past roofing customers." },
      {
        role: "arc",
        body:
          "Past customers convert far better than cold prospects, so I'd lead with **value, not a discount**:\n\n- **Angle:** a free, no-obligation spring roof assessment before storm season\n- **Proof:** neighbor restorations, workmanship warranty, insurance-claim support\n- **Audience:** ~1,200 past customers in your service ZIPs, active jobs suppressed",
        metadata: {
          reasoning: "Anchored on your August storm-response win (31 booked jobs) and scoped a lookalike from Q4 booked leads.",
          steps: [
            { label: "Scoped ~1,200 past customers in service ZIPs, suppressed active jobs + opt-outs", status: "done" },
            { label: "Framed a free-assessment offer over a discount for this persona", status: "done" },
          ],
          recall: [{ label: "Aug storm-response booked 31 jobs", confidence: 91 }],
          suggestions: ["Write the email draft", "Add an SMS version", "Estimate the reachable audience"],
        },
      },
    ],
  },
  {
    title: "NOAA hail report — service ZIPs",
    pinned: false,
    age: 3 * DAY,
    messages: [
      { role: "operator", body: "Summarize the NOAA hail report for our service ZIPs." },
      {
        role: "arc",
        body:
          "The **Oct 27 NOAA report** confirms **1.5\" hail across 4 of your service ZIP codes**. Local news (WGN) reported overnight roof damage in Naperville, and insurance roof-claim filings are up **3× week-over-week** — a strong, time-boxed opportunity while claim windows are open.",
        metadata: {
          reasoning: "Read the NOAA report and corroborated with local coverage + claim-filing trend before flagging urgency.",
          steps: [
            { label: "Confirmed 1.5\" hail across 4 service ZIPs (NOAA, Oct 27)", status: "done" },
            { label: "Corroborated with WGN coverage + a 3× claim-filing spike", status: "done" },
          ],
          recall: [{ label: "NOAA storm-events feed", confidence: 96 }],
          suggestions: ["Turn this into an opportunity", "Draft a storm-response campaign"],
        },
      },
    ],
  },
];

async function main() {
  const supabase = getSupabase();

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id,name")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgErr) throw new Error(`organizations lookup failed: ${orgErr.message}`);
  if (!org) throw new Error(`No organization with slug "${ORG_SLUG}". Seed a workspace first (pnpm seed:test-workspace).`);

  let { data: workspace } = await supabase
    .from("workspaces")
    .select("id,name")
    .eq("org_id", org.id)
    .eq("key", WORKSPACE_KEY)
    .maybeSingle();
  if (!workspace) {
    const { data: anyWs } = await supabase
      .from("workspaces")
      .select("id,name")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspace = anyWs ?? null;
  }
  if (!workspace) throw new Error(`No workspace found for org "${ORG_SLUG}".`);

  const { data: member } = await supabase
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", workspace.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerId = member?.user_id ?? null;

  // Replace any prior demo rows (messages cascade on conversation delete).
  const { data: prior } = await supabase
    .from("arc_conversations")
    .select("id")
    .eq("workspace_id", workspace.id)
    .contains("metadata", { seed: SEED_TAG });
  if (prior && prior.length > 0) {
    await supabase.from("arc_conversations").delete().in("id", prior.map((r) => r.id));
    console.log(`Cleared ${prior.length} prior demo conversation(s).`);
  }

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  for (const c of CONVERSATIONS) {
    const { data: conv, error: convErr } = await supabase
      .from("arc_conversations")
      .insert({
        operator: OPERATOR,
        title: c.title,
        status: "active",
        org_id: org.id,
        workspace_id: workspace.id,
        owner_id: ownerId,
        visibility: "workspace",
        workspace_permission: "collaborate",
        pinned_at: c.pinned ? iso(0) : null,
        created_at: iso(c.age),
        updated_at: iso(c.age),
        last_message_at: iso(c.age),
        metadata: { seed: SEED_TAG },
      })
      .select("id")
      .single();
    if (convErr) throw new Error(`arc_conversations insert failed: ${convErr.message}`);

    const rows = c.messages.map((m, i) => ({
      conversation_id: conv.id,
      role: m.role,
      body: m.body,
      status: m.role === "operator" ? "sent" : "complete",
      org_id: org.id,
      workspace_id: workspace.id,
      author_user_id: m.role === "operator" ? ownerId : null,
      mentions: [],
      metadata: m.metadata ?? {},
      // Stagger within the thread so the operator turn precedes Arc's reply.
      created_at: iso(c.age - i * 2000),
    }));
    const { error: msgErr } = await supabase.from("arc_messages").insert(rows);
    if (msgErr) throw new Error(`arc_messages insert failed: ${msgErr.message}`);

    console.log(`  ✓ ${c.title}${c.pinned ? " (pinned)" : ""} — ${rows.length} messages`);
  }

  console.log(`\nSeeded ${CONVERSATIONS.length} Arc conversations into workspace "${workspace.name}" (operator "${OPERATOR}").`);
}

main().catch((error) => {
  console.error(`\nseed:arc-chat failed — ${error.message ?? error}`);
  process.exit(1);
});
