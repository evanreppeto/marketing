// Shared helpers for the local `pnpm sandbox` playground scripts.
//
// The sandbox is a fully local, throwaway environment: Dockerized Supabase
// (via the Supabase CLI) + the Next app on :6001 + a fake Arc worker. None of
// this reaches a real project. See SANDBOX.md.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();
export const ENV_PATH = join(ROOT, ".env.local");
export const ENV_BACKUP = join(ROOT, ".env.local.pre-sandbox");

export const APP_PORT = 6001;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const STUDIO_URL = "http://127.0.0.1:54323";
export const SUPABASE_API_URL = "http://127.0.0.1:54321";

// A fixed, local-only bearer the fake Arc worker uses to talk to the app.
// It has no meaning outside the sandbox.
export const SANDBOX_BEARER = "sandbox-arc-token";

// Seeded login credentials (see scripts/seed-test-workspace.mjs).
export const SANDBOX_LOGINS = [
  { role: "owner", email: "owner@bsr.test", password: "BsrOwner1234!" },
  { role: "member", email: "teammate@bsr.test", password: "BsrTeam1234!" },
];

// ---------------------------------------------------------------------------
// Tiny console helpers (no dependency on chalk/picocolors).
// ---------------------------------------------------------------------------
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
export const paint = (color, s) => `${C[color] ?? ""}${s}${C.reset}`;
export const log = (s = "") => console.log(s);
export const step = (s) => console.log(paint("cyan", `▸ ${s}`));
export const ok = (s) => console.log(paint("green", `✓ ${s}`));
export const warn = (s) => console.log(paint("yellow", `! ${s}`));
export function die(s) {
  console.error(paint("red", `✗ ${s}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Process helpers.
// ---------------------------------------------------------------------------

/** Spawn a command, inheriting stdio. Resolves on exit 0, rejects otherwise. */
export function sh(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(0) : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`)),
    );
  });
}

/** Spawn a command, capturing stdout/stderr. Never throws; returns the result. */
export function shCapture(cmd, args = [], opts = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

export function hasBin(name) {
  return shCapture("which", [name]).code === 0;
}

// ---------------------------------------------------------------------------
// Supabase CLI — prefer a global install, else run through `pnpm dlx`.
// ---------------------------------------------------------------------------
const SUPABASE_CLI_PIN = "supabase@2";
export function supabaseInvocation(args) {
  if (hasBin("supabase")) return { cmd: "supabase", args };
  return { cmd: "pnpm", args: ["dlx", SUPABASE_CLI_PIN, ...args] };
}
export function supa(args, opts = {}) {
  const { cmd, args: a } = supabaseInvocation(args);
  return sh(cmd, a, opts);
}
export function supaCapture(args, opts = {}) {
  const { cmd, args: a } = supabaseInvocation(args);
  return shCapture(cmd, a, opts);
}

/** Fail fast with a friendly message if the Docker daemon isn't reachable. */
export function assertDocker() {
  if (!hasBin("docker")) {
    die("Docker isn't installed. Install Docker Desktop, then re-run. (This is the container runtime the local Supabase stack needs.)");
  }
  if (shCapture("docker", ["info"]).code !== 0) {
    die("Docker is installed but the daemon isn't running. Start Docker Desktop and re-run `pnpm sandbox:up`.");
  }
}

// ---------------------------------------------------------------------------
// .env.local read / merge / backup.
// ---------------------------------------------------------------------------
export function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return map;
}

export function readEnv() {
  if (!existsSync(ENV_PATH)) return new Map();
  return parseEnv(readFileSync(ENV_PATH, "utf8"));
}

export function readEnvValue(key) {
  return process.env[key] ?? readEnv().get(key);
}

/**
 * Merge `updates` into .env.local, preserving every other key. Backs up any
 * pre-existing .env.local to .env.local.pre-sandbox once (so `sandbox:down`
 * can restore your real config). Keys are written in a stable order with a
 * clearly labelled sandbox block on top.
 */
export function upsertEnv(updates) {
  if (existsSync(ENV_PATH) && !existsSync(ENV_BACKUP)) {
    copyFileSync(ENV_PATH, ENV_BACKUP);
    warn(`Backed up your existing .env.local → ${ENV_BACKUP} (restored by \`pnpm sandbox:down\`).`);
  }
  const merged = readEnv();
  for (const [k, v] of Object.entries(updates)) merged.set(k, v);

  const header =
    "# --- Managed by `pnpm sandbox` — points at the LOCAL Supabase stack. ---\n" +
    "# Your previous .env.local (if any) is saved as .env.local.pre-sandbox.\n" +
    "# Run `pnpm sandbox:down` to stop the stack and restore it.\n\n";
  const bodyLines = [...merged.entries()].map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_PATH, header + bodyLines.join("\n") + "\n");
}

/** True when the configured Supabase URL is the local stack (a reset guard). */
export function isLocalSupabase() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  return url.includes("127.0.0.1") || url.includes("localhost");
}
