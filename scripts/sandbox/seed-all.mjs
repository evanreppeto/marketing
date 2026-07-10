// `pnpm sandbox:seed` — populate the local tenant with fake data.
//
// Runs the existing scripts/seed-*.mjs family in dependency order against
// whatever .env.local points at. The tenant seed is REQUIRED (everything hangs
// off its org/workspace/users); the rest are best-effort so one broken seed
// doesn't leave you with an empty playground. Re-runnable — the seeds upsert.
import { die, isLocalSupabase, log, ok, paint, sh, step, warn } from "./lib.mjs";

// order matters: workspace/users first, then brand, then records that reference them.
const SEEDS = [
  { script: "seed-test-workspace.mjs", label: "workspace + users", required: true },
  { script: "seed-bsr-brand-kit.mjs", label: "brand kit" },
  { script: "seed-personas.mjs", label: "personas" },
  { script: "seed-crm-demo-signals.mjs", label: "CRM records + signals" },
  { script: "seed-opportunity-signals.mjs", label: "weather + competitor detector signals" },
  { script: "seed-arc-demo.mjs", label: "Arc tasks, opportunities, messages" },
  { script: "seed-test-campaign.mjs", label: "approval-gated campaign" },
  { script: "seed-media-campaign.mjs", label: "campaign with media assets" },
  { script: "seed-campaign-results.mjs", label: "campaign performance results" },
  { script: "seed-brain.mjs", label: "brand brain / knowledge" },
  { script: "seed-analytics-history.mjs", label: "analytics history" },
  { script: "seed-outbox-dispatches.mjs", label: "outbox dispatches" },
];

async function main() {
  if (!isLocalSupabase()) {
    warn("NEXT_PUBLIC_SUPABASE_URL doesn't look local (127.0.0.1). Seeds write real rows —");
    warn("if you meant the sandbox, run `pnpm sandbox:up` first. Continuing in 3s…");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const results = [];
  for (const seed of SEEDS) {
    step(`Seeding: ${seed.label}  ${paint("dim", `(${seed.script})`)}`);
    try {
      await sh("node", [`scripts/${seed.script}`]);
      results.push({ ...seed, status: "ok" });
      ok(seed.label);
    } catch (e) {
      if (seed.required) {
        die(`Required seed failed: ${seed.label} (${seed.script}). ${e instanceof Error ? e.message : ""}`);
      }
      results.push({ ...seed, status: "skip" });
      warn(`Skipped ${seed.label} — ${seed.script} errored (optional, continuing).`);
    }
  }

  const good = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skip");
  log(paint("bold", `\n  Seed summary: ${good}/${SEEDS.length} succeeded`));
  if (skipped.length) {
    log(paint("yellow", `  Skipped: ${skipped.map((s) => s.script).join(", ")}`));
    log(paint("dim", "  (Those surfaces will be empty in the app — fix the seed or ignore if you don't need it.)"));
  }
  log("");
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
