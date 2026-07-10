import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural guard on the Supabase migration chain so it stays replayable on a
 * BRAND-NEW Postgres — the fresh-DB blocker BSR-357 hardens.
 *
 * History: `default_organization_id()` was applied out-of-band on the live DB and
 * then *used* (as an org_id column default) by ~8 legacy migrations that never
 * *defined* it, so the legacy chain could not be replayed on an empty database.
 * The #351 canonical baseline (`00000000000000_baseline.sql`) fixed this by
 * defining the function — after creating the `organizations` table it reads and
 * before the first column-default that calls it. These assertions fail loudly if
 * a future migration reintroduces a use-before-define, an undefined helper, or a
 * duplicate/ambiguous version prefix.
 *
 * The Supabase CLI applies migrations in lexicographic filename order, so we
 * concatenate the files in that same order and reason about it as one script —
 * the closest static approximation of a real fresh-DB apply.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function migrationFilesInApplyOrder(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic == the CLI's apply order
}

/** The leading numeric version prefix (everything before the first underscore). */
function versionPrefix(filename: string): string {
  return filename.split("_")[0];
}

/** Concatenate every migration in apply order, prefixed with a locating comment. */
function concatenatedChain(files: string[]): string {
  return files
    .map((f) => `-- >>> ${f}\n${readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")}`)
    .join("\n");
}

const DEFINE_RE = /create\s+(?:or\s+replace\s+)?function\s+\S*default_organization_id/i;
// A "use" is any call site `default_organization_id(` — column defaults, policy
// bodies, grants. It deliberately does NOT match the string literal
// `'%default_organization_id%'` in the tenancy self-check (no paren follows).
const USE_RE = /default_organization_id\s*\(/i;

describe("supabase migration chain (fresh-DB replayability)", () => {
  const files = migrationFilesInApplyOrder();

  it("has migrations to check and starts from the canonical baseline", () => {
    expect(files.length).toBeGreaterThan(0);
    // The all-zeros baseline must sort first so the schema it defines exists
    // before any dated follow-on migration runs.
    expect(files[0]).toBe("00000000000000_baseline.sql");
  });

  it("has no duplicate version prefixes (ordering is unambiguous)", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const f of files) {
      const prefix = versionPrefix(f);
      const prior = seen.get(prefix);
      if (prior) duplicates.push(`${prefix}: ${prior} & ${f}`);
      else seen.set(prefix, f);
    }
    expect(duplicates).toEqual([]);
  });

  it("defines default_organization_id() before it is ever used", () => {
    const lines = concatenatedChain(files).split("\n");
    let defLine = -1;
    let firstUseLine = -1;
    lines.forEach((line, i) => {
      if (DEFINE_RE.test(line)) {
        if (defLine < 0) defLine = i;
        return; // the CREATE line is the definition, not a use
      }
      if (USE_RE.test(line) && firstUseLine < 0) firstUseLine = i;
    });

    // Must be defined at all — the original blocker was "used but never defined".
    expect(defLine, "default_organization_id() is never defined in the chain").toBeGreaterThanOrEqual(0);
    // And defined before the first call site, so a fresh apply never references
    // a function that doesn't exist yet.
    if (firstUseLine >= 0) {
      expect(defLine).toBeLessThan(firstUseLine);
    }
  });

  it("creates public.organizations before default_organization_id() reads it", () => {
    // The function body selects from public.organizations; a SQL-language function
    // is validated at CREATE time, so the table must exist first on a fresh DB.
    const chain = concatenatedChain(files);
    const orgTableIdx = chain.search(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.organizations\b/i);
    const defIdx = chain.search(DEFINE_RE);
    expect(orgTableIdx, "public.organizations is never created").toBeGreaterThanOrEqual(0);
    expect(defIdx).toBeGreaterThanOrEqual(0);
    expect(orgTableIdx).toBeLessThan(defIdx);
  });
});
