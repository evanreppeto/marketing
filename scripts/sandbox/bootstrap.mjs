// `pnpm sandbox:up` — bring the local playground online.
//
//   1. Verify Docker is running.
//   2. Start the local Supabase stack (Postgres + Auth + Storage + Studio).
//   3. Point .env.local at it (backing up your real one first).
//   4. Apply any pending migrations from supabase/migrations/.
//   5. Seed the fake Big Shoulders Restoration tenant.
//
// Idempotent: safe to run repeatedly. The heavy step (first-time image pull)
// only happens once. Everyday use is `pnpm sandbox` (app + fake Arc worker).
import {
  APP_URL,
  SANDBOX_BEARER,
  SANDBOX_LOGINS,
  STUDIO_URL,
  assertDocker,
  die,
  log,
  ok,
  paint,
  sh,
  step,
  supa,
  supaCapture,
  upsertEnv,
} from "./lib.mjs";

function readStatusJson() {
  // `supabase status -o json` prints a JSON map of local service URLs + keys.
  const res = supaCapture(["status", "-o", "json"]);
  if (res.code !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k]) return obj[k];
    const lower = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
    if (lower && obj[lower]) return obj[lower];
  }
  return undefined;
}

async function main() {
  log(paint("bold", "\n  Arc sandbox — bringing up your local playground\n"));

  step("Checking Docker…");
  assertDocker();
  ok("Docker is running.");

  step("Starting local Supabase (first run pulls Docker images — this can take a few minutes)…");
  await supa(["start"]).catch(() =>
    die("`supabase start` failed. Scroll up for the CLI error. Common causes: Docker low on resources, or a port (54321-54324) already in use."),
  );

  const status = readStatusJson();
  if (!status) die("Couldn't read `supabase status`. Is the stack up? Try `pnpm sandbox:down` then `pnpm sandbox:up`.");

  const apiUrl = pick(status, "API_URL", "api_url");
  const anonKey = pick(status, "ANON_KEY", "anon_key");
  const serviceKey = pick(status, "SERVICE_ROLE_KEY", "service_role_key");
  if (!apiUrl || !anonKey || !serviceKey) {
    die("Local Supabase came up but didn't report its URL/keys. Run `supabase status` and check the output.");
  }
  ok(`Local Supabase is up at ${apiUrl}`);

  step("Pointing .env.local at the local stack…");
  upsertEnv({
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    // The fake Arc worker authenticates to the app with this bearer.
    ARC_AGENT_API_TOKEN: SANDBOX_BEARER,
    // No external runner in the sandbox — the local fake worker answers chats.
    ARC_RUNNER_URL: "",
    // Show REAL seeded data (not synthetic fallbacks) so empty surfaces are an
    // honest signal a seed is missing. Flip to 1 for a pure "never empty" demo.
    ARC_DEMO_DATA: "0",
    // Lets the app render a "SANDBOX" banner so it's never confused with prod.
    NEXT_PUBLIC_SANDBOX: "1",
    DEFAULT_ORG_SLUG: "big-shoulders-restoration",
  });
  ok("Wrote sandbox env (your previous .env.local is saved as .env.local.pre-sandbox).");

  step("Applying any pending migrations…");
  // `supabase start` applies migrations on first init; this catches migrations
  // added since the stack was first created, without wiping data.
  await supa(["migration", "up"]).catch(() =>
    log(paint("yellow", "  (migration up reported nothing to apply, or the CLI is a version without it — continuing.)")),
  );
  ok("Schema is current.");

  step("Seeding the fake Big Shoulders Restoration tenant…");
  await sh("node", ["scripts/sandbox/seed-all.mjs"]).catch(() =>
    die("Seeding failed. Scroll up for which seed broke. You can retry with `pnpm sandbox:seed`."),
  );

  log(paint("green", paint("bold", "\n  ✓ Sandbox is ready.\n")));
  log(`  ${paint("bold", "App")}         ${APP_URL}   ${paint("dim", "(start with: pnpm sandbox)")}`);
  log(`  ${paint("bold", "Supabase")}    ${STUDIO_URL}   ${paint("dim", "(database studio)")}`);
  log(`  ${paint("bold", "Logins")}      ${SANDBOX_LOGINS.map((l) => `${l.email} / ${l.password}`).join("   ")}`);
  log(paint("dim", "\n  Next: run `pnpm sandbox` to start the app + the fake Arc worker together.\n"));
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
