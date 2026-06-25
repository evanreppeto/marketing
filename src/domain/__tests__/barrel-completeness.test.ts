import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Guard against the recurring "dropped domain barrel export" bug: a new
 * `src/domain/<module>.ts` is added (or survives a merge) but its
 * `export * from "./<module>"` line is missing from `src/domain/index.ts`, so the
 * symbols vanish from `@/domain` and the production build breaks (has hit prod via
 * brand-design and email-templates). This is a STRUCTURAL check on purpose — a
 * runtime `in` check can't see type-only re-exports, which is what the email drop was.
 */

const domainDir = fileURLToPath(new URL("..", import.meta.url)); // src/domain
const indexSrc = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

/**
 * Domain modules intentionally NOT re-exported through the `@/domain` barrel.
 * Add a name here ONLY with a justification (e.g. a genuinely internal helper that
 * must not be importable as `@/domain`). Empty today — the barrel is complete.
 */
const ALLOWED_UNEXPORTED = new Set<string>([]);

/** Every real domain module (top-level `*.ts`, minus the barrel itself and tests). */
function moduleFiles(): string[] {
  return readdirSync(domainDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts")
    .map((f) => f.replace(/\.ts$/, ""));
}

/** Module specifiers re-exported by index.ts via `export * from "./x"` or `export { … } from "./x"`. */
function exportedModules(): Set<string> {
  const re = /export\s+(?:\*|\{[^}]*\})\s+from\s+"\.\/([a-zA-Z0-9_-]+)"/g;
  const out = new Set<string>();
  for (let m = re.exec(indexSrc); m; m = re.exec(indexSrc)) out.add(m[1]);
  return out;
}

describe("@/domain barrel completeness", () => {
  it("re-exports every domain module so consumers can import it via @/domain", () => {
    const exported = exportedModules();
    const missing = moduleFiles().filter((m) => !exported.has(m) && !ALLOWED_UNEXPORTED.has(m));
    expect(
      missing,
      `These domain modules are not re-exported from src/domain/index.ts. Add:\n${missing
        .map((m) => `  export * from "./${m}";`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("has no barrel export line pointing to a non-existent domain module", () => {
    const files = new Set(moduleFiles());
    const orphans = [...exportedModules()].filter((m) => !files.has(m));
    expect(orphans, `src/domain/index.ts re-exports modules that don't exist: ${orphans.join(", ")}`).toEqual([]);
  });
});
