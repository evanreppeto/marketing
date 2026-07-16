/**
 * End-to-end verification spike for the draft critic.
 *
 * Unit tests cover the risk mapping, and the DB writes are proven against real
 * Postgres — but neither exercises the thing most likely to be wrong: the
 * PROMPT. This runs the real critic (real system prompt, real Sonnet call, real
 * read tools hitting the app's Operations API) over copy engineered so each
 * verdict has a known right answer, and prints what it actually decided.
 *
 * The fixture leans on the workspace's own brain facts, so it only means
 * something against a workspace that has some. Against BSR's it reads:
 *   - "IICRC-certified technicians"  -> brain fact exists      => expect grounded
 *   - "on site within 60 minutes"    -> no such fact anywhere   => expect unsupported
 *   - "we guarantee ... approved"    -> a payout promise, and a banned phrase
 *                                       => expect fabricated
 *
 * Run: `pnpm spike:critic` from apps/arc-runner, with:
 *   APP_API_BASE_URL   the running app (e.g. http://localhost:6041)
 *   ARC_AGENT_API_TOKEN  matching the app's
 * Must run where the spawned `claude` CLI is logged in (run `claude` once), or
 * the model call 401s and the verdict is COULD_NOT_RUN, not a failure.
 *
 * This writes NOTHING: it calls reviewDraft (read-only), never
 * reviewAndRecordDraft. Nothing is persisted and no approval is touched.
 */
import { createArcClient } from "./arc-client";
import { reviewDraft, riskFlagsFromFindings, riskFromFindings } from "./critic";
import type { DraftForReview } from "./types";

const DRAFT: DraftForReview = {
  assetId: "spike-asset",
  campaignId: "spike-campaign",
  title: "Emergency water response — homeowner email",
  assetType: "email",
  body: [
    "Subject: Water in your home? We're on the way.",
    "",
    "Hi there,",
    "",
    "When a pipe bursts, every minute counts. Our IICRC-certified technicians are on call around the clock.",
    "",
    "We'll be on site within 60 minutes of your call, and we guarantee your insurance claim will be approved.",
    "",
    "Call now and we'll dispatch the nearest crew.",
  ].join("\n"),
};

/** What a correct reviewer should conclude, for scoring the run. */
const EXPECTED: Array<{ needle: string; verdict: string; why: string }> = [
  { needle: "iicrc", verdict: "grounded", why: "'IICRC-certified technicians' is a brand fact in the brain" },
  { needle: "60 minutes", verdict: "unsupported", why: "no response-time fact or proof point exists" },
  { needle: "guarantee", verdict: "fabricated", why: "a claim-approval promise the business cannot make" },
];

async function main(): Promise<number> {
  const appApiBaseUrl = (process.env.APP_API_BASE_URL ?? "http://localhost:6041").replace(/\/+$/, "");
  const arcAgentApiToken = process.env.ARC_AGENT_API_TOKEN ?? "";
  if (!arcAgentApiToken) {
    console.log("SPIKE COULD_NOT_RUN: set ARC_AGENT_API_TOKEN (must match the running app's).");
    return 2;
  }

  const client = createArcClient(
    { appApiBaseUrl, arcAgentApiToken } as Parameters<typeof createArcClient>[0],
    undefined,
  );
  const step = async (label: string, status: "running" | "done") => {
    if (status === "running") console.log(`  · ${label}…`);
  };

  console.log(`[spike] app: ${appApiBaseUrl}`);
  console.log(`[spike] reviewing: ${DRAFT.title}\n`);

  let review;
  try {
    review = await reviewDraft(DRAFT, client, step, "Big Shoulders Restoration");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/401|unauthorized|\/login|credential/i.test(message)) {
      console.log(`SPIKE COULD_NOT_RUN: the spawned claude CLI isn't authenticated here.\n  ${message}`);
      return 2;
    }
    console.log(`SPIKE ERROR: ${message}`);
    return 1;
  }

  if (!review) {
    console.log("SPIKE FAIL: the critic returned no review (it never called submit_review).");
    return 1;
  }

  console.log("\n=== findings ===");
  for (const f of review.findings) {
    console.log(`  [${f.verdict.padEnd(11)}] ${f.claim}`);
    console.log(`                ↳ ${f.note}`);
  }
  console.log("\n=== verdict ===");
  console.log(`  recommendation: ${review.recommendation}`);
  console.log(`  rationale:      ${review.rationale}`);
  console.log(`  suggested:      ${review.suggestedEdits || "(none)"}`);
  console.log(`  risk_level:     ${riskFromFindings(review.findings)}`);
  console.log(`  risk_flags:     ${riskFlagsFromFindings(review.findings).join(", ") || "(none)"}`);

  console.log("\n=== scoring (did it get the known answers right?) ===");
  let correct = 0;
  for (const expect of EXPECTED) {
    const hit = review.findings.find((f) => f.claim.toLowerCase().includes(expect.needle));
    const got = hit?.verdict ?? "NOT CHECKED";
    const ok = got === expect.verdict;
    if (ok) correct += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  "${expect.needle}" → expected ${expect.verdict}, got ${got}`);
    if (!ok) console.log(`        (${expect.why})`);
  }

  console.log(`\nSPIKE ${correct === EXPECTED.length ? "PASS" : "PARTIAL"}: ${correct}/${EXPECTED.length} known answers correct.`);
  return correct === EXPECTED.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("SPIKE ERROR:", error);
    process.exit(1);
  },
);
