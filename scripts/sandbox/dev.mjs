// `pnpm sandbox` — the everyday command. Runs the Next app (:6001) and the
// fake Arc worker together against the local stack. This is your "docker
// compose up": one command, a localhost you can poke, Arc that answers.
//
// Bring the stack online first with `pnpm sandbox:up` (one-time-ish).
import { spawn } from "node:child_process";
import { APP_URL, STUDIO_URL, die, isLocalSupabase, log, paint, supaCapture, warn } from "./lib.mjs";

if (!isLocalSupabase()) {
  die("This doesn't look like the sandbox — .env.local isn't pointing at local Supabase.\n  Run `pnpm sandbox:up` first to bring up the stack and wire the env.");
}
if (supaCapture(["status"]).code !== 0) {
  die("The local Supabase stack isn't running. Run `pnpm sandbox:up` first.");
}

log(paint("bold", "\n  Arc sandbox — app + fake Arc worker\n"));
log(`  ${paint("bold", "App")}        ${APP_URL}`);
log(`  ${paint("bold", "Studio")}     ${STUDIO_URL}`);
log(paint("dim", "  Ctrl-C to stop both.\n"));

const children = [];
function spawnChild(name, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", cwd: process.cwd() });
  child.on("exit", (code) => {
    log(paint("yellow", `\n  [${name}] exited (${code}). Shutting down the sandbox…`));
    shutdown();
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGINT");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// The app first; the worker retries until the app answers, so ordering is loose.
spawnChild("app", "pnpm", ["dev", "--port", "6001"]);
spawnChild("arc", "node", ["scripts/sandbox/fake-arc.mjs"]);
