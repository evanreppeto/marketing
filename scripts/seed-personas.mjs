// Seed rich, BSR-specific audience personas for the Personas console so the
// already-built screen renders coherent data instead of the neutral demo
// fallback. Targets the Big Shoulders Restoration default org and mirrors the
// six persona names the CRM already uses (Homeowner emergency, Property
// manager, Insurance agent, Plumbing partner, Past customer, Homeowner
// preventative), so Personas and CRM tell one story.
//
//   node scripts/seed-personas.mjs
//
// Idempotent: deletes this org's existing persona rows, then inserts the six
// below (the (org_id, slug) unique key also makes a re-run a clean replace).
// Column shapes match src/lib/personas/console.ts -> mapRow (jsonb columns take
// objects/arrays; audience_share is a whole-number percent; score is 0-100).
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

// Six personas, spread ~3 acquisition / ~2 engagement / ~1 retention so the
// console's segment tab counts resemble the mockup. Content is specific to
// Big Shoulders Restoration: water & storm-damage restoration plus
// plumbing-partner referral outreach across the Chicago area.
const PERSONAS = [
  {
    slug: "homeowner-emergency",
    name: "Homeowner emergency",
    initials: "HE",
    segment: "acquisition",
    stage: "Hot lead",
    score: 92,
    signals: { engagement: 88, fit: 90, intent: 97 },
    signal_drivers: {
      engagement: ["Called the 24/7 line after hours", "Opened the emergency-response text within minutes"],
      fit: ["Owner-occupied single-family home in our Chicago service area", "Active water intrusion — our core restoration job"],
      intent: ["Standing water or sewage backup right now", "Adjuster is already asking for damage photos"],
    },
    audience_share: 22,
    score_trend: [70, 78, 84, 88, 90, 92],
    live: true,
    quote:
      "My basement took on two feet of water after last night's storm and the smell is getting worse — I need someone out here today.",
    profile:
      "A Chicago-area homeowner in the middle of an active water or storm emergency who found us while panic-searching for help. They need fast reassurance, a real arrival window, and someone who can talk to their insurer.",
    goals: [
      "Get a crew on site today to stop the damage",
      "Prevent mold before it starts spreading",
      "Have the loss documented properly for their claim",
    ],
    objections: [
      "Worried about surprise out-of-pocket cost",
      "Doesn't know if insurance will cover it",
      "Skeptical of fly-by-night storm chasers",
    ],
    angle: "Active emergency — lead with speed, a real arrival window, and insurance help.",
    audience: "Homeowners with an active water/sewage/storm loss right now.",
    cta: "Call our 24/7 line / Request emergency dispatch",
    channel: "Search & call",
    best_timing: "Within the hour — the loss is happening now",
    next_action: "Dispatch the on-call crew and text a live ETA plus a photo-documentation checklist.",
    proof_points: [
      "IICRC-certified crews, 45-minute average Chicago response",
      "We bill your insurer directly and document the claim",
    ],
    sample_message: {
      subject: "Crew can be at your door within the hour",
      preview: "Standing water spreads fast. Tell us your address and we'll dispatch now and start your claim file.",
    },
    arc_activity: [
      { title: "Emergency dispatch confirmation SMS", status: "Awaiting approval", when: "12 minutes ago" },
      { title: "Insurance photo-documentation checklist", status: "Draft ready", when: "Today" },
    ],
  },
  {
    slug: "insurance-agent",
    name: "Insurance agent",
    initials: "IA",
    segment: "acquisition",
    stage: "Active",
    score: 84,
    signals: { engagement: 80, fit: 88, intent: 84 },
    signal_drivers: {
      engagement: ["Referred two policyholders this quarter", "Opens our claims-status updates the same day"],
      fit: ["Local State Farm / Allstate agent covering our zip codes", "Sends the mitigation work we specialize in"],
      intent: ["Asked for a preferred-vendor packet", "Wants a single restoration partner for storm season"],
    },
    audience_share: 12,
    score_trend: [66, 71, 75, 79, 82, 84],
    live: true,
    quote:
      "When a policyholder's home floods, I need a restoration partner who shows up, documents everything cleanly, and makes me look good.",
    profile:
      "A Chicago-area insurance agent who refers policyholders to trusted restoration vendors. They care about fast response, clean claim documentation, and not getting complaints back from their clients.",
    goals: [
      "Keep policyholders happy through a stressful claim",
      "Work with a vendor who documents losses correctly",
      "Reduce claim cycle time and reopened claims",
    ],
    objections: [
      "Burned before by a vendor who over-scoped a job",
      "Needs proof of licensing, insurance, and Xactimate estimates",
      "Protective of who they put in front of clients",
    ],
    angle: "Referral partner — lead with reliability, clean documentation, and making them look good.",
    audience: "Local insurance agents who refer restoration work.",
    cta: "Get our preferred-vendor packet / Schedule an intro call",
    channel: "Email & partner outreach",
    best_timing: "Ahead of storm season and after a smooth claim",
    next_action: "Send the preferred-vendor packet with sample Xactimate documentation and recent claim outcomes.",
    proof_points: [
      "Xactimate estimates and full photo logs on every claim",
      "Licensed, bonded, insured — under 1% reopened claims",
    ],
    sample_message: {
      subject: "A restoration partner your policyholders won't complain about",
      preview: "Fast response, clean Xactimate docs, and status updates you can forward. Here's our vendor packet.",
    },
    arc_activity: [
      { title: "Preferred-vendor packet (PDF)", status: "Awaiting approval", when: "Today" },
      { title: "Q3 claim-outcome recap email", status: "Prepared", when: "2 days ago" },
    ],
  },
  {
    slug: "plumbing-partner",
    name: "Plumbing partner",
    initials: "PP",
    segment: "acquisition",
    stage: "Active",
    score: 78,
    signals: { engagement: 74, fit: 82, intent: 76 },
    signal_drivers: {
      engagement: ["Passed us a burst-pipe job last week", "Texts photos from the field when water damage is involved"],
      fit: ["Independent Chicago plumber who hits water damage they don't remediate", "Complementary, non-competing trade"],
      intent: ["Wants a reciprocal referral arrangement", "Asked how the handoff and referral fee work"],
    },
    audience_share: 15,
    score_trend: [58, 63, 68, 72, 75, 78],
    live: false,
    quote:
      "I fix the pipe, but I'm not set up to dry out a flooded basement or handle the mold — I need someone I can hand that off to fast.",
    profile:
      "An independent Chicago-area plumber who runs into water damage beyond their scope on jobs. They want a dependable restoration partner to refer the drying, mold, and rebuild work to — and to send jobs back their way.",
    goals: [
      "Hand off water-damage cleanup without dropping the customer",
      "Look complete to their own clients",
      "Earn reciprocal referrals and a fair referral fee",
    ],
    objections: [
      "Doesn't want us poaching their plumbing work",
      "Needs a fast, reliable handoff so their name is protected",
      "Wants clarity on referral fees and response time",
    ],
    angle: "Referral partner — lead with a clean handoff, reciprocal leads, and protecting their customer.",
    audience: "Independent plumbers who hit out-of-scope water damage.",
    cta: "Set up a referral partnership / See how the handoff works",
    channel: "Partner outreach & SMS",
    best_timing: "Right after they hand off a job that went smoothly",
    next_action: "Send the partner one-pager: handoff process, response SLA, and reciprocal-referral terms.",
    proof_points: [
      "Same-day handoff, we keep your customer looped in",
      "Reciprocal referrals — we send plumbing leads back to you",
    ],
    sample_message: {
      subject: "You fix the pipe, we handle the flood — and send jobs back",
      preview: "A clean handoff that protects your name, plus reciprocal referrals. Here's how a partnership works.",
    },
    arc_activity: [
      { title: "Partner one-pager + referral terms", status: "Draft ready", when: "Today" },
      { title: "Reciprocal-referral intro SMS", status: "Prepared", when: "Yesterday" },
    ],
  },
  {
    slug: "property-manager",
    name: "Property manager",
    initials: "PM",
    segment: "engagement",
    stage: "Active",
    score: 74,
    signals: { engagement: 82, fit: 78, intent: 66 },
    signal_drivers: {
      engagement: ["Used us for two unit turns this year", "Replies to our maintenance updates within a day"],
      fit: ["Manages multiple Chicago multifamily buildings", "Recurring water and mitigation needs across a portfolio"],
      intent: ["Exploring a priority-response agreement", "Not in an active emergency this week"],
    },
    audience_share: 18,
    score_trend: [60, 64, 68, 70, 72, 74],
    live: true,
    quote:
      "I've got 40 units across three buildings — when a supply line lets go at 2am, I need one number to call and a crew that keeps tenants calm.",
    profile:
      "A Chicago property manager responsible for multiple multifamily buildings. They value a single dependable vendor for water and storm mitigation, minimal tenant disruption, and predictable turnaround across their portfolio.",
    goals: [
      "One reliable restoration vendor for the whole portfolio",
      "Minimize tenant disruption and vacancy loss",
      "Predictable response and clean billing per property",
    ],
    objections: [
      "Juggling several vendors already",
      "Needs after-hours coverage and priority scheduling",
      "Wants per-building invoicing that owners will accept",
    ],
    angle: "Portfolio relationship — lead with priority response, tenant care, and per-property billing.",
    audience: "Property managers running multifamily portfolios.",
    cta: "Set up a priority-response agreement / Book a portfolio walk-through",
    channel: "Email & account outreach",
    best_timing: "During lease turns and before winter freeze season",
    next_action: "Propose a portfolio priority-response agreement with after-hours coverage and per-building billing.",
    proof_points: [
      "24/7 priority scheduling for portfolio accounts",
      "Per-property invoicing and one dedicated point of contact",
    ],
    sample_message: {
      subject: "One number for every building in your portfolio",
      preview: "Priority after-hours response, tenants kept calm, per-property billing. Let's set up your agreement.",
    },
    arc_activity: [
      { title: "Portfolio priority-response proposal", status: "Awaiting approval", when: "Today" },
      { title: "Winter freeze-prevention checklist", status: "Draft ready", when: "3 days ago" },
    ],
  },
  {
    slug: "homeowner-preventative",
    name: "Homeowner preventative",
    initials: "HP",
    segment: "engagement",
    stage: "New",
    score: 61,
    signals: { engagement: 64, fit: 72, intent: 48 },
    signal_drivers: {
      engagement: ["Downloaded the basement-flood prevention guide", "Opened our seasonal maintenance tips"],
      fit: ["Owns an older Chicago home with a finished basement", "Right profile, no active loss yet"],
      intent: ["Researching, not in an emergency", "Considering a sump pump or backflow inspection"],
    },
    audience_share: 16,
    score_trend: [48, 52, 55, 57, 59, 61],
    live: false,
    quote:
      "My neighbor's basement flooded last spring and mine is finished — I'd rather spend a little now than deal with that disaster.",
    profile:
      "A cautious Chicago homeowner, often with an older home and finished basement, thinking ahead about preventing water damage. No active emergency — they're weighing inspections, sump pumps, and backflow protection.",
    goals: [
      "Avoid a flooded basement before it ever happens",
      "Understand their real risk and what to fix first",
      "Protect a finished basement they've invested in",
    ],
    objections: [
      "No urgent problem, so it's easy to defer",
      "Unsure which upgrades are actually worth it",
      "Doesn't want an upsell to something they don't need",
    ],
    angle: "Prevention-minded — lead with a low-pressure risk check and neighbor-relatable proof.",
    audience: "Homeowners thinking ahead about water-damage prevention.",
    cta: "Book a free flood-risk assessment / Get the prevention guide",
    channel: "Email & seasonal nurture",
    best_timing: "Ahead of spring thaw and heavy-rain season",
    next_action: "Offer a free flood-risk assessment tied to their neighborhood's recent storm history.",
    proof_points: [
      "Free, no-pressure flood-risk assessment",
      "Sump pump and backflow work that pays for itself in one avoided claim",
    ],
    sample_message: {
      subject: "Beat the spring thaw before your basement floods",
      preview: "A quick, free risk check for your finished basement — and the two fixes that prevent most Chicago claims.",
    },
    arc_activity: [
      { title: "Spring flood-prevention nurture email", status: "Draft ready", when: "Today" },
      { title: "Free risk-assessment offer block", status: "Prepared", when: "4 days ago" },
    ],
  },
  {
    slug: "past-customer",
    name: "Past customer",
    initials: "PC",
    segment: "retention",
    stage: "Champion",
    score: 88,
    signals: { engagement: 90, fit: 86, intent: 88 },
    signal_drivers: {
      engagement: ["Left a five-star review after their basement restoration", "Still opens our seasonal check-ins"],
      fit: ["Delighted prior restoration customer in our service area", "Strong word-of-mouth in their neighborhood"],
      intent: ["Has referred a neighbor already", "Likely to refer again and re-book preventative work"],
    },
    audience_share: 17,
    score_trend: [80, 82, 84, 85, 87, 88],
    live: false,
    quote:
      "You guys saved my basement after the flood and treated my house like it was your own — I've already told two neighbors about you.",
    profile:
      "A happy former Big Shoulders Restoration customer who had a great experience during a stressful loss. A prime source of referrals, reviews, and repeat preventative work across their Chicago neighborhood.",
    goals: [
      "Help neighbors find a restorer they can trust",
      "Keep their own home protected going forward",
      "Feel appreciated for their loyalty and referrals",
    ],
    objections: [
      "Needs an easy, natural way to refer",
      "Wants any reward to feel genuine, not salesy",
      "No active problem right now",
    ],
    angle: "Delighted alum — lead with a warm thank-you, an easy referral, and a review ask.",
    audience: "Past restoration customers who love the work.",
    cta: "Refer a neighbor / Leave a Google review",
    channel: "Email & SMS",
    best_timing: "After a milestone or the anniversary of their restoration",
    next_action: "Send a warm thank-you with a neighbor-referral link and a one-tap Google review request.",
    proof_points: [
      "Neighbor-referral reward that gives back to both of you",
      "Rated 4.9 on Google across 300+ Chicago restorations",
    ],
    sample_message: {
      subject: "Thank you — know a neighbor who could use us?",
      preview: "You trusted us with your basement. Refer a neighbor and we'll take great care of them (and thank you both).",
    },
    arc_activity: [
      { title: "Neighbor-referral thank-you email", status: "Awaiting approval", when: "Today" },
      { title: "One-tap Google review request SMS", status: "Draft ready", when: "2 days ago" },
    ],
  },
];

async function main() {
  // Idempotent replace: clear this org's personas, then insert the fresh set.
  const del = await sb.from("personas").delete().eq("org_id", ORG_ID);
  if (del.error) throw new Error(`delete existing personas: ${del.error.message}`);

  const rows = PERSONAS.map((p) => ({ org_id: ORG_ID, ...p }));
  const ins = await sb.from("personas").insert(rows).select("name,segment,score");
  if (ins.error) throw new Error(`insert personas: ${ins.error.message}`);

  console.log(`Inserted ${ins.data.length} personas for org ${ORG_ID}:`);
  for (const r of ins.data) console.log(`   ${String(r.score).padStart(3)}  ${r.segment.padEnd(11)}  ${r.name}`);

  // Verify: count + ordered listing straight from the DB.
  const { count } = await sb
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG_ID);
  const check = await sb
    .from("personas")
    .select("name,segment,score")
    .eq("org_id", ORG_ID)
    .order("score", { ascending: false });
  if (check.error) throw new Error(`verify select: ${check.error.message}`);

  console.log(`\nVerified count in DB: ${count}`);
  console.log("By score (desc):");
  for (const r of check.data) console.log(`   ${String(r.score).padStart(3)}  ${r.segment.padEnd(11)}  ${r.name}`);

  const bySegment = check.data.reduce((acc, r) => ((acc[r.segment] = (acc[r.segment] || 0) + 1), acc), {});
  console.log("Segment counts:", bySegment);

  if (count !== PERSONAS.length) {
    throw new Error(`expected ${PERSONAS.length} rows, found ${count}`);
  }
  console.log("\n✅ Personas seeded.");
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
