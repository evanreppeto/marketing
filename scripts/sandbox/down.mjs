// `pnpm sandbox:down` — stop the local Supabase stack and restore your real
// .env.local. Container data is preserved (a later `pnpm sandbox:up` resumes
// where you left off); use `pnpm sandbox:reset` when you want a clean slate.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { ENV_BACKUP, ENV_PATH, log, ok, paint, step, supa, warn } from "./lib.mjs";

async function main() {
  log(paint("bold", "\n  Stopping the Arc sandbox\n"));

  step("Stopping local Supabase containers…");
  await supa(["stop"]).catch(() => warn("`supabase stop` reported an error (was the stack already down?) — continuing."));
  ok("Supabase stopped (local data kept for next time).");

  if (existsSync(ENV_BACKUP)) {
    step("Restoring your previous .env.local…");
    copyFileSync(ENV_BACKUP, ENV_PATH);
    rmSync(ENV_BACKUP);
    ok("Restored .env.local from .env.local.pre-sandbox.");
  } else {
    warn("No .env.local.pre-sandbox backup found — leaving the sandbox env in place.");
  }

  log(paint("dim", "\n  Bring it back anytime with `pnpm sandbox:up`.\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
