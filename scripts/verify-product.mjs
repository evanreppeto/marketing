import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const smokeTests = [
  "src/lib/product-readiness/app-surface.test.ts",
  "src/lib/product-readiness/backend-boundary.test.ts",
  "src/lib/auth/route-protection.test.ts",
  "src/app/api/auth/sign-in/route.test.ts",
  "src/app/api/auth/sign-up/route.test.ts",
  "src/app/api/auth/workspace-invites/route.test.ts",
  "src/app/api/auth/workspace-members/route.test.ts",
  "src/app/api/v1/arc/health/route.test.ts",
  "src/app/api/v1/arc/tasks/route.test.ts",
];

function candidateBinNames(name) {
  return process.platform === "win32" ? [`${name}.cmd`, `${name}.ps1`, name] : [name];
}

function findBin(name) {
  let current = process.cwd();
  while (true) {
    for (const binName of candidateBinNames(name)) {
      const candidate = path.join(current, "node_modules", ".bin", binName);
      if (fs.existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return name;
}

const steps = [
  { label: "typecheck", command: findBin("tsc"), args: ["--noEmit", "--pretty", "false"] },
  { label: "test:smoke", command: findBin("vitest"), args: ["run", ...smokeTests] },
  { label: "test", command: findBin("vitest"), args: ["run"] },
  { label: "build", command: findBin("next"), args: ["build"] },
];

function normalizeCommandForSpawn(command, args) {
  if (process.platform === "win32" && command.toLowerCase().endsWith(".cmd")) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }

  return { command, args };
}

for (const step of steps) {
  console.log(`\n[verify] ${step.label}`);
  const command = normalizeCommandForSpawn(step.command, step.args);
  const result = spawnSync(command.command, command.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`\n[verify] ${step.label} failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[verify] Product verification passed.");
