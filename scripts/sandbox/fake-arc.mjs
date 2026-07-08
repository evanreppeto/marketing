// `pnpm sandbox:arc` — a local, deterministic stand-in for the Arc runner.
//
// The real Arc runner is a separate cloud service that calls an LLM. In the
// sandbox there's no runner and no LLM, so Arc chat would just sit "thinking"
// forever. This worker fills that gap: it polls the same bearer-gated inbox the
// real runner uses, shows a live step timeline, and posts a scripted reply.
//
// It talks to the app ONLY through GET/POST /api/v1/arc/messages — the same
// surface that structurally can't send/publish/launch anything. So the sandbox
// is safe by construction: the fake worker can chat, never act outbound.
//
// Started automatically by `pnpm sandbox`; run alone with `pnpm sandbox:arc`.
import { APP_URL, SANDBOX_BEARER, log, paint, readEnvValue, warn } from "./lib.mjs";

const BEARER = readEnvValue("ARC_AGENT_API_TOKEN") ?? SANDBOX_BEARER;
const BASE = process.env.SANDBOX_APP_URL ?? APP_URL;
const POLL_MS = 1500;
const STEP_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${BEARER}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const postStep = (id, label, status = "running") =>
  api(`/api/v1/arc/messages/${id}/steps`, "POST", { label, status });

const postReply = (id, replyBody) =>
  api("/api/v1/arc/messages", "POST", { agentTaskId: id, body: replyBody, status: "complete" });

// ---------------------------------------------------------------------------
// Scripted intents. First match wins; `fallback` catches everything else.
// Voice: Arc, the marketing operator for Big Shoulders Restoration (BSR).
// ---------------------------------------------------------------------------
const INTENTS = [
  {
    name: "greeting",
    match: (t) => /\b(hi|hello|hey|help|who are you|what can you|get started)\b/.test(t),
    steps: ["Reading workspace context"],
    reply: () =>
      "Hi — I'm Arc, the marketing operator for Big Shoulders Restoration. I can:\n\n" +
      "• Scan for source-backed opportunities (CRM inactivity, weather events, competitor moves)\n" +
      "• Draft approval-gated campaign packages (email, SMS, ad, landing copy)\n" +
      "• Organize and package approved BSR proof media\n" +
      "• Learn from what converts\n\n" +
      "Nothing I prepare goes outbound until you approve it. Try “find opportunities this week” or “draft a storm-response email campaign”.",
  },
  {
    name: "opportunities",
    match: (t) => /\b(opportun|lead|prospect|find|scan|who should|reach out|target)\b/.test(t),
    steps: [
      "Scanning CRM for inactivity + stalled jobs",
      "Checking weather and competitor signals",
      "Scoring candidates against the 12 personas",
    ],
    reply: () =>
      "I found 2 source-backed opportunities and dropped them in your Opportunities inbox as approval-gated proposals:\n\n" +
      "1. Dormant property managers — 14 accounts with a water-damage job >180 days ago and no follow-up since. Persona: Facilities Decision-Maker. Suggested play: reactivation email + seasonal maintenance offer.\n" +
      "2. Weather signal — an NWS flood watch covers the North Shore service area this weekend. Suggested play: a ready-to-send storm-response campaign to at-risk commercial accounts.\n\n" +
      "Each opportunity shows its evidence and a recommended action. Approve one and I'll assemble the campaign package — I won't contact anyone until you do.",
  },
  {
    name: "campaign",
    match: (t) => /\b(campaign|draft|email|sms|ad|write|copy|angle|newsletter|blast)\b/.test(t),
    steps: [
      "Pulling persona + relationship context",
      "Selecting approved BSR proof media",
      "Drafting the package and running guardrails",
    ],
    reply: () =>
      "Drafted a campaign package and queued it in Campaigns for your review (status: Needs approval):\n\n" +
      "• Brief: Reactivate dormant commercial accounts before storm season\n" +
      "• Audience: 14 facilities decision-makers, last job >180 days\n" +
      "• Email — subject: “Before the next storm hits your building”  •  preview: “A 12-point pre-season check from the crew you already trust.”\n" +
      "• SMS: “BSR here — want us to pre-inspect your property before storm season? Reply YES and we'll set it up.”\n" +
      "• Proof points: 4-hour emergency response, IICRC-certified, 200+ Chicago commercial jobs\n" +
      "• Guardrail check: passed (no unverified claims, approved media only)\n\n" +
      "It's a draft — approve, decline, or request a revision. Outbound stays locked until you approve.",
  },
  {
    name: "status",
    match: (t) => /\b(status|working on|what are you|your tasks|queue|waiting|blocked|to.?do)\b/.test(t),
    steps: ["Reading the task queue"],
    reply: () =>
      "Here's where things stand:\n\n" +
      "• Waiting on you: 1 campaign package (storm-season reactivation) and 2 opportunities to approve.\n" +
      "• Blocked: 1 asset needs a redaction check before it can be approved.\n" +
      "• Recently prepared: 3 resized creative variants from approved BSR media.\n\n" +
      "Nothing has gone out — every item is parked at an approval gate. Want me to walk through any of them?",
  },
];

const FALLBACK = {
  name: "fallback",
  steps: ["Thinking it through"],
  reply: (text) =>
    `Got it — “${text.slice(0, 120)}”.\n\n` +
    "In the sandbox I answer with scripted, deterministic replies (no live model), but the full flow is real: " +
    "I can scan for opportunities, draft approval-gated campaign packages, and organize creative. " +
    "Ask me to “find opportunities” or “draft a campaign” to see a package land in your approval queue. " +
    "As always, nothing goes outbound without your approval.",
};

function chooseIntent(message) {
  const t = (message ?? "").toLowerCase();
  return INTENTS.find((i) => i.match(t)) ?? FALLBACK;
}

async function handle(msg) {
  const { agentTaskId, message } = msg;
  const intent = chooseIntent(message);
  log(paint("cyan", `  ↳ replying to "${(message ?? "").slice(0, 60)}" as [${intent.name}]`));

  for (const label of intent.steps) {
    await postStep(agentTaskId, label, "running");
    await sleep(STEP_MS);
  }
  await postStep(agentTaskId, "Composing reply", "done");
  const reply = typeof intent.reply === "function" ? intent.reply(message ?? "") : intent.reply;
  const { status, json } = await postReply(agentTaskId, reply);
  if (status >= 300) {
    warn(`  reply for ${agentTaskId} was rejected (${status}): ${json?.message ?? "unknown"}`);
  }
}

let warnedDown = false;
async function tick() {
  let res;
  try {
    res = await api("/api/v1/arc/messages?limit=5");
  } catch {
    if (!warnedDown) {
      warn(`Waiting for the app at ${BASE} … (start it with \`pnpm sandbox\`)`);
      warnedDown = true;
    }
    return;
  }
  warnedDown = false;
  if (res.status === 401 || res.status === 403) {
    warn("Inbox returned 401/403 — ARC_AGENT_API_TOKEN in .env.local doesn't match. Re-run `pnpm sandbox:up`.");
    return;
  }
  const messages = res.json?.messages ?? [];
  for (const msg of messages) {
    try {
      await handle(msg);
    } catch (e) {
      warn(`  failed handling ${msg.agentTaskId}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function main() {
  log(paint("bold", "\n  🤖 Fake Arc worker — deterministic sandbox replies (no LLM, no outbound)"));
  log(paint("dim", `     polling ${BASE}/api/v1/arc/messages every ${POLL_MS}ms\n`));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
