import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards a bug class that ordinary unit tests cannot reach.
 *
 * Next inlines `NEXT_PUBLIC_*` into the browser bundle by find-and-replacing the
 * literal text `process.env.NEXT_PUBLIC_FOO`. Read one through a variable and
 * there is nothing to replace, so the client gets `undefined` — while every unit
 * test still passes, because Node has a real `process.env`. That is exactly how
 * #463 shipped a Sentry that could never turn on: green tests, dead client.
 *
 * So this asserts on the source text. Ugly, but it is the only layer where the
 * mistake is visible without a full browser build.
 */

const SOURCE = readFileSync(join(__dirname, "sentry-options.ts"), "utf8");

// Strip comments — the file discusses the wrong pattern at length, and prose
// about a bug must not read as the bug.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PUBLIC_VARS = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_RELEASE",
];

describe("sentry-options client inlining", () => {
  it.each(PUBLIC_VARS)("reads %s as a literal process.env member expression", (name) => {
    // The literal form Next find-and-replaces. Anything else is dead on the client.
    expect(CODE).toContain(`process.env.${name}`);
  });

  it.each(PUBLIC_VARS)("never reaches %s through a bracket lookup", (name) => {
    // process.env["NEXT_PUBLIC_X"] is not inlined either.
    expect(CODE).not.toMatch(new RegExp(`process\\.env\\s*\\[\\s*["'\`]${name}`));
  });

  it("never aliases process.env into a variable or parameter default", () => {
    // `const env = process.env` / `(env = process.env)` — the #463 regression.
    // Bare `process.env.X` member reads are fine; anything that captures the
    // object itself and indexes it later is not.
    const aliased = CODE.match(/(?:=|\breturn\b)\s*process\.env\s*(?![.[])/);
    expect(aliased, `process.env must not be aliased: ${aliased?.[0]}`).toBeNull();
  });
});

/**
 * The same bug class, one layer out. VERCEL_ENV / VERCEL_GIT_COMMIT_SHA carry no
 * NEXT_PUBLIC_ prefix, so the browser never sees them: client Sentry tagged
 * production errors `environment: "development"` with no release, while the server
 * tagged the same errors correctly. next.config.ts bridges them at build time —
 * if that mapping is dropped, the client silently goes back to lying.
 */
describe("next.config env bridge", () => {
  const CONFIG = readFileSync(join(__dirname, "..", "..", "..", "next.config.ts"), "utf8");

  it("maps VERCEL_ENV onto a NEXT_PUBLIC_ name the client can actually see", () => {
    expect(CONFIG).toMatch(/NEXT_PUBLIC_SENTRY_ENVIRONMENT:[\s\S]{0,140}process\.env\.VERCEL_ENV/);
  });

  it("maps VERCEL_GIT_COMMIT_SHA onto a NEXT_PUBLIC_ name, so traces carry a release", () => {
    expect(CONFIG).toMatch(/NEXT_PUBLIC_SENTRY_RELEASE:[\s\S]{0,140}process\.env\.VERCEL_GIT_COMMIT_SHA/);
  });
});
