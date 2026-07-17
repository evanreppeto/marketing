import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Studio crashed the whole page on prod. A live workspace with no approved media
 * (media_assets empty) gets libraryItems=[], so `sources.library.items[0]` — the
 * initial background — is undefined, and every `bg.url`/`bg.p`/`bg.l` deref threw
 * (React #418 / "cannot read properties of undefined (reading 'url')"). The
 * offline demo never hit it because it falls back to non-empty sample art, and
 * the repo has no jsdom/testing-library to render the component under test — so
 * this bug class is invisible to CI here.
 *
 * This guards it at the source level (same approach as the sentry-inlining and
 * campaign-tone guards): the initial background must be nullable, and the canvas
 * must keep an empty-state branch instead of assuming a background exists. It's a
 * text assertion, but it catches the exact regression — reverting to
 * `useState<Item>(sources.library.items[0])` or dropping the empty state.
 */

const SRC = readFileSync(
  join(__dirname, "_components", "studio-view.tsx"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Studio tolerates an empty approved-media library", () => {
  it("types the selected background as nullable", () => {
    // The crash was `useState<Item>(sources.library.items[0])` — a non-nullable
    // type over a possibly-empty array. It must admit undefined.
    expect(SRC).toMatch(/useState<Item \| undefined>\(/);
    expect(SRC).not.toMatch(/useState<Item>\(/);
  });

  it("renders an empty-state background instead of dereferencing an absent one", () => {
    // The canvas must branch on bg, not assume it. cbg-empty is the placeholder.
    expect(SRC).toMatch(/bg \?/);
    expect(SRC).toContain("cbg-empty");
  });

  it("guards the two render sites that actually crashed", () => {
    // .cprov and the Layers row deref'd bg.p / bg.l unconditionally and threw when
    // bg was undefined. Assert the GUARDED forms are present — a positive check,
    // because the guarded string contains the old unguarded one as a substring, so
    // "absence of the raw form" can't distinguish them.
    expect(SRC).toContain('{bg && <div className="cprov">');
    expect(SRC).toMatch(/\{bg \? `\$\{bg\.l\} · \$\{provShort\(bg\.p\)\}`/);
  });
});
