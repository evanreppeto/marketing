// `pnpm sandbox:reset` — wipe the local database back to a clean, freshly
// seeded state. Re-applies every migration (so it also picks up new ones) and
// re-runs the seeds. Your uncommitted app code is untouched — this only resets
// data. Refuses to run against anything that isn't the local stack.
import { die, isLocalSupabase, log, ok, paint, sh, step, supa } from "./lib.mjs";

async function main() {
  if (!isLocalSupabase()) {
    die("Refusing to reset — .env.local isn't pointing at local Supabase (127.0.0.1). This guard exists so `sandbox:reset` can never wipe a real database.");
  }

  log(paint("bold", "\n  Resetting the local sandbox database\n"));

  step("Re-applying all migrations (this drops and recreates local data)…");
  await supa(["db", "reset"]).catch(() => die("`supabase db reset` failed — scroll up for the CLI error."));
  ok("Schema rebuilt from supabase/migrations/.");

  step("Re-seeding the fake tenant…");
  await sh("node", ["scripts/sandbox/seed-all.mjs"]).catch(() => die("Re-seed failed after reset."));

  log(paint("green", paint("bold", "\n  ✓ Clean slate. Run `pnpm sandbox` to play again.\n")));
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
