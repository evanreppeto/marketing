# Branded Creative Compositing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing "Phase 2" step so Arc renders a finished, on-brand creative — real logo + headline + CTA + brand colors/fonts baked onto an AI background — instead of writing a text "overlay spec."

**Architecture:** A pure `domain/creative-templates` module owns formats, brand-token mapping, and template selection. A server-only renderer (`src/lib/media/compose/`) turns a brand-tokenized JSX template into a PNG via Next's built-in `ImageResponse` (satori + resvg — no native deps). A bearer-gated route `POST /api/v1/arc/media/compose` fetches the workspace brand kit, renders, and stores the PNG in the existing `campaign-media` bucket. A new runner tool `compose_creative` chains generate-background → compose → draft-asset so Arc produces one finished, approval-gated composite asset.

**Tech Stack:** Next.js 16 route handlers (Node runtime), React 19 JSX, `next/og` `ImageResponse`, satori-safe inline styles, Supabase Storage, vitest, the existing `apps/arc-runner` Claude Agent SDK tools.

**Design spec:** [docs/superpowers/specs/2026-06-23-branded-creative-compositing-design.md](../specs/2026-06-23-branded-creative-compositing-design.md)

---

## File Structure

**New (app):**
- `src/domain/creative-templates.ts` — pure: types, `CREATIVE_DIMENSIONS`, `normalizeCreativeFormat`, `selectCreativeTemplate`, `resolveFontRole`, `toBrandTokens`
- `src/domain/__tests__/creative-templates.test.ts`
- `src/lib/media/compose/types.ts` — `CreativeTemplateProps`, `CreativeTemplate`
- `src/lib/media/compose/fonts.ts` — `loadCreativeFonts` + bundled `.ttf` files
- `src/lib/media/compose/templates/{bold,editorial,minimal}.tsx`
- `src/lib/media/compose/renderer.ts` — `renderCreative`
- `src/lib/media/compose/renderer.test.ts`
- `src/app/api/v1/arc/media/compose/route.ts`
- `src/app/api/v1/arc/media/compose/route.test.ts`

**New (fonts, binary, committed):**
- `src/lib/media/compose/fonts/{Inter-Regular,Inter-Bold,Serif-Regular,Serif-Bold}.ttf`

**Modified:**
- `src/domain/index.ts` — re-export the new module
- `apps/arc-runner/src/tools/media.ts` — add `composeCreative`, return it from `mediaTools`
- `apps/arc-runner/src/tools/index.test.ts` — add `compose_creative` to the pinned `DRAFT` list
- `apps/arc-runner/src/tools/media.test.ts` — assert `compose_creative` is wired
- `apps/arc-runner/src/prompt.ts` — CREATIVE section tells Arc to finish creatives with `compose_creative`

**Reused unchanged:** `src/app/api/v1/arc/_lib/http.ts` (`arcGuard`, `fail`, `readJson`, `INVALID_JSON`), `src/lib/media/storage.ts` (`storeGeneratedMedia`), `src/lib/brand-kit/persistence.ts` (`getBusinessProfile`), `src/app/api/v1/arc/campaigns/draft-asset/route.ts` (already accepts `media.source`).

---

## Task 1: Domain — creative-templates (pure, TDD)

**Files:**
- Create: `src/domain/creative-templates.ts`
- Test: `src/domain/__tests__/creative-templates.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/creative-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CREATIVE_DIMENSIONS,
  CREATIVE_TEMPLATE_IDS,
  normalizeCreativeFormat,
  resolveFontRole,
  selectCreativeTemplate,
  toBrandTokens,
} from "../creative-templates";
import type { BusinessProfile } from "../brand-kit";

describe("normalizeCreativeFormat", () => {
  it("accepts canonical ratios", () => {
    expect(normalizeCreativeFormat("1:1")).toBe("1:1");
    expect(normalizeCreativeFormat("4:5")).toBe("4:5");
    expect(normalizeCreativeFormat("9:16")).toBe("9:16");
    expect(normalizeCreativeFormat("16:9")).toBe("16:9");
  });
  it("maps friendly names and defaults to 1:1", () => {
    expect(normalizeCreativeFormat("portrait")).toBe("4:5");
    expect(normalizeCreativeFormat("STORY")).toBe("9:16");
    expect(normalizeCreativeFormat("landscape")).toBe("16:9");
    expect(normalizeCreativeFormat(undefined)).toBe("1:1");
    expect(normalizeCreativeFormat("nonsense")).toBe("1:1");
  });
});

describe("CREATIVE_DIMENSIONS", () => {
  it("has pixel sizes for every format", () => {
    expect(CREATIVE_DIMENSIONS["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(CREATIVE_DIMENSIONS["4:5"]).toEqual({ width: 1080, height: 1350 });
    expect(CREATIVE_DIMENSIONS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(CREATIVE_DIMENSIONS["16:9"]).toEqual({ width: 1920, height: 1080 });
  });
});

describe("selectCreativeTemplate", () => {
  it("honors a valid hint", () => {
    expect(selectCreativeTemplate({ hint: "editorial" })).toBe("editorial");
    expect(selectCreativeTemplate({ hint: "MINIMAL" })).toBe("minimal");
  });
  it("falls back to a deterministic seed-based pick when hint is absent/invalid", () => {
    const a = selectCreativeTemplate({ hint: "bogus", seed: "campaign-42" });
    const b = selectCreativeTemplate({ seed: "campaign-42" });
    expect(a).toBe(b); // deterministic for the same seed
    expect(CREATIVE_TEMPLATE_IDS).toContain(a);
  });
  it("varies across different seeds", () => {
    const picks = new Set(
      ["a", "b", "c", "d", "e", "f"].map((s) => selectCreativeTemplate({ seed: s })),
    );
    expect(picks.size).toBeGreaterThan(1); // not all identical
  });
});

describe("resolveFontRole", () => {
  it("detects serif families", () => {
    expect(resolveFontRole("Georgia")).toBe("serif");
    expect(resolveFontRole("Playfair Display")).toBe("serif");
    expect(resolveFontRole("Source Serif 4")).toBe("serif");
  });
  it("defaults everything else to sans", () => {
    expect(resolveFontRole("Inter")).toBe("sans");
    expect(resolveFontRole(undefined)).toBe("sans");
    expect(resolveFontRole("")).toBe("sans");
  });
});

describe("toBrandTokens", () => {
  it("returns neutral tokens when no profile", () => {
    const t = toBrandTokens(null);
    expect(t.logoUrl).toBeNull();
    expect(t.accent).toMatch(/^#/);
    expect(t.headingFont).toBeTruthy();
  });
  it("maps palette + logo + short mark from a profile", () => {
    const profile = {
      displayName: "Big Shoulders Restoration",
      logoUrl: "https://cdn/logo.png",
      shortMark: "BSR",
      accent: "#d4342b",
      brandPalette: {
        primary: { label: "Primary", hex: "#16181d" },
        secondary: { label: "Secondary", hex: "#3b3f47" },
        accent: { label: "Accent", hex: "#d4342b" },
        dark: { label: "Dark", hex: "#0f1115" },
        light: { label: "Light", hex: "#f5f3ee" },
        headingFont: "Inter",
        bodyFont: "Inter",
      },
    } as unknown as BusinessProfile;
    const t = toBrandTokens(profile);
    expect(t.primary).toBe("#16181d");
    expect(t.accent).toBe("#d4342b");
    expect(t.logoUrl).toBe("https://cdn/logo.png");
    expect(t.shortMark).toBe("BSR");
    expect(t.displayName).toBe("Big Shoulders Restoration");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/creative-templates.test.ts`
Expected: FAIL — `Cannot find module '../creative-templates'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/creative-templates.ts`:

```ts
/**
 * Creative compositing — pure, industry-agnostic logic. No I/O. Owns the output
 * formats, how a workspace's Brand Kit maps to render tokens, and which layout
 * template a given creative uses. Consumed by the server-only renderer in
 * `src/lib/media/compose/` and the `/api/v1/arc/media/compose` route.
 */
import type { BusinessProfile } from "./brand-kit";

export type CreativeFormat = "1:1" | "4:5" | "9:16" | "16:9";
export type CreativeTemplateId = "bold" | "editorial" | "minimal";
export type CreativeDimensions = { width: number; height: number };

export type CreativeCopy = {
  headline: string;
  kicker?: string;
  ctaLabel?: string;
};

/** Flattened, render-ready brand values pulled from a Brand Kit (or neutral defaults). */
export type BrandTokens = {
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  light: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
  shortMark: string;
  displayName: string;
};

export const CREATIVE_TEMPLATE_IDS: CreativeTemplateId[] = ["bold", "editorial", "minimal"];

export const CREATIVE_DIMENSIONS: Record<CreativeFormat, CreativeDimensions> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export function normalizeCreativeFormat(raw: string | null | undefined): CreativeFormat {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "1:1" || r === "square") return "1:1";
  if (r === "4:5" || r === "portrait") return "4:5";
  if (r === "9:16" || r === "story" || r === "vertical") return "9:16";
  if (r === "16:9" || r === "landscape") return "16:9";
  return "1:1";
}

/** Pick a layout: a valid hint wins; otherwise a deterministic hash of the seed
 *  spreads picks across templates so consecutive creatives don't repeat. */
export function selectCreativeTemplate(input: { hint?: string | null; seed?: string }): CreativeTemplateId {
  const hint = input.hint?.trim().toLowerCase();
  if (hint && (CREATIVE_TEMPLATE_IDS as string[]).includes(hint)) {
    return hint as CreativeTemplateId;
  }
  const seed = input.seed ?? "";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CREATIVE_TEMPLATE_IDS[h % CREATIVE_TEMPLATE_IDS.length];
}

const SERIF_HINTS = [
  "serif", "georgia", "times", "garamond", "playfair", "lora",
  "merriweather", "source serif", "pt serif", "slab",
];

/** Map an arbitrary brand font name to one of our two bundled font roles. */
export function resolveFontRole(font: string | null | undefined): "sans" | "serif" {
  const f = (font ?? "").toLowerCase();
  return SERIF_HINTS.some((h) => f.includes(h)) ? "serif" : "sans";
}

const NEUTRAL_TOKENS: BrandTokens = {
  primary: "#16181d",
  secondary: "#3b3f47",
  accent: "#C8A24B",
  dark: "#0f1115",
  light: "#f5f3ee",
  headingFont: "sans-serif",
  bodyFont: "sans-serif",
  logoUrl: null,
  shortMark: "—",
  displayName: "Your Brand",
};

const pick = (hex: string | undefined, fallback: string) => (hex && hex.trim() ? hex : fallback);

/** Flatten a Brand Kit into render tokens, falling back to neutral defaults. */
export function toBrandTokens(profile: BusinessProfile | null): BrandTokens {
  if (!profile) return { ...NEUTRAL_TOKENS };
  const p = profile.brandPalette;
  const mark =
    (profile.shortMark && profile.shortMark.trim()) ||
    (profile.displayName ? profile.displayName.slice(0, 3).toUpperCase() : NEUTRAL_TOKENS.shortMark);
  return {
    primary: pick(p?.primary?.hex, NEUTRAL_TOKENS.primary),
    secondary: pick(p?.secondary?.hex, NEUTRAL_TOKENS.secondary),
    accent: pick(p?.accent?.hex, pick(profile.accent, NEUTRAL_TOKENS.accent)),
    dark: pick(p?.dark?.hex, NEUTRAL_TOKENS.dark),
    light: pick(p?.light?.hex, NEUTRAL_TOKENS.light),
    headingFont: pick(p?.headingFont, NEUTRAL_TOKENS.headingFont),
    bodyFont: pick(p?.bodyFont, NEUTRAL_TOKENS.bodyFont),
    logoUrl: profile.logoUrl ?? null,
    shortMark: mark,
    displayName: pick(profile.displayName, NEUTRAL_TOKENS.displayName),
  };
}
```

- [ ] **Step 4: Re-export from the domain barrel**

In `src/domain/index.ts`, add this line alongside the other `export * from "./..."` lines:

```ts
export * from "./creative-templates";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/domain/__tests__/creative-templates.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add src/domain/creative-templates.ts src/domain/__tests__/creative-templates.test.ts src/domain/index.ts
git commit -m "feat(creative): pure domain for compositing formats + brand tokens + template selection"
```

---

## Task 2: Bundle fonts + font loader

satori (inside `ImageResponse`) needs the actual font **file**, not a CSS name. We bundle two families — a sans (Inter) and a serif — each in regular + bold, and map the brand's heading/body fonts onto them.

**Files:**
- Create: `src/lib/media/compose/fonts/Inter-Regular.ttf`, `Inter-Bold.ttf`, `Serif-Regular.ttf`, `Serif-Bold.ttf`
- Create: `src/lib/media/compose/fonts.ts`

- [ ] **Step 1: Source four real `.ttf` files**

The `@expo-google-fonts/*` packages ship genuine static `.ttf` files (not woff2, which satori can't read). Add them as dev deps, copy the four files in, then drop the dev deps:

```bash
pnpm add -D @expo-google-fonts/inter @expo-google-fonts/source-serif-pro
mkdir -p src/lib/media/compose/fonts
cp node_modules/@expo-google-fonts/inter/Inter_400Regular.ttf src/lib/media/compose/fonts/Inter-Regular.ttf
cp node_modules/@expo-google-fonts/inter/Inter_700Bold.ttf src/lib/media/compose/fonts/Inter-Bold.ttf
cp node_modules/@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular.ttf src/lib/media/compose/fonts/Serif-Regular.ttf
cp node_modules/@expo-google-fonts/source-serif-pro/SourceSerifPro_700Bold.ttf src/lib/media/compose/fonts/Serif-Bold.ttf
pnpm remove @expo-google-fonts/inter @expo-google-fonts/source-serif-pro
```

Verify the four files exist and are non-trivial:

```bash
ls -l src/lib/media/compose/fonts/*.ttf
```
Expected: four files, each tens-to-hundreds of KB (not 0 bytes). If the exact filenames in the packages differ, run `ls node_modules/@expo-google-fonts/inter/*.ttf` and adjust the `cp` source names — the destination names must stay exactly as above.

> These `.ttf` files are committed binary assets. Do not add them to `.gitignore`.

- [ ] **Step 2: Write the font loader**

Create `src/lib/media/compose/fonts.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { resolveFontRole, type BrandTokens } from "@/domain";

/** A font entry in the shape `ImageResponse` expects. */
export type LoadedFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

/** Read a bundled font. `new URL(..., import.meta.url)` lets Next's file tracer
 *  bundle the `.ttf` for the route at build time (a bare cwd path would not be traced). */
async function readFont(relative: string): Promise<Buffer> {
  return readFile(fileURLToPath(new URL(`./fonts/${relative}`, import.meta.url)));
}

/**
 * Load two logical families — "Heading" (700) and "Body" (400) — choosing the
 * bundled sans or serif file per the brand's requested fonts. Templates always
 * reference fontFamily "Heading" / "Body".
 */
export async function loadCreativeFonts(brand: BrandTokens): Promise<LoadedFont[]> {
  const headingFile = resolveFontRole(brand.headingFont) === "serif" ? "Serif-Bold.ttf" : "Inter-Bold.ttf";
  const bodyFile = resolveFontRole(brand.bodyFont) === "serif" ? "Serif-Regular.ttf" : "Inter-Regular.ttf";
  return [
    { name: "Heading", data: await readFont(headingFile), weight: 700, style: "normal" },
    { name: "Body", data: await readFont(bodyFile), weight: 400, style: "normal" },
  ];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/media/compose/fonts.ts src/lib/media/compose/fonts/
git commit -m "feat(creative): bundle Inter+serif ttf fonts and a brand-aware loader"
```

---

## Task 3: Renderer + the "bold" template (smoke test)

**Files:**
- Create: `src/lib/media/compose/types.ts`
- Create: `src/lib/media/compose/templates/bold.tsx`
- Create: `src/lib/media/compose/renderer.ts`
- Test: `src/lib/media/compose/renderer.test.ts`

- [ ] **Step 1: Define the shared template prop types**

Create `src/lib/media/compose/types.ts`:

```ts
import type { ReactElement } from "react";

import type { BrandTokens, CreativeCopy, CreativeDimensions } from "@/domain";

export type CreativeTemplateProps = {
  brand: BrandTokens;
  copy: CreativeCopy;
  dims: CreativeDimensions;
  /** Background image as a data: URL (fetched + inlined by the renderer). */
  backgroundDataUrl: string;
  /** Logo as a data: URL, or null when the brand has no logo (use the short mark). */
  logoDataUrl: string | null;
};

export type CreativeTemplate = (p: CreativeTemplateProps) => ReactElement;
```

- [ ] **Step 2: Write the "bold" template**

Create `src/lib/media/compose/templates/bold.tsx`. Note the satori rules: every element with more than one child sets `display: "flex"` + a `flexDirection`; backgrounds and the logo are real `<img>` elements; sizes scale off the canvas width.

```tsx
import type { CreativeTemplate } from "../types";

/** Bold: charcoal scrim, logo top-left, big headline + accent CTA pill on a bottom scrim. */
export const templateBold: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080; // scale unit so 16:9 (1920w) scales up proportionally

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: dims.width,
        height: dims.height,
        backgroundColor: brand.dark,
        fontFamily: "Body",
        overflow: "hidden",
      }}
    >
      {/* background photo */}
      <img
        src={backgroundDataUrl}
        width={dims.width}
        height={dims.height}
        style={{ position: "absolute", top: 0, left: 0, width: dims.width, height: dims.height, objectFit: "cover" }}
      />
      {/* bottom scrim for legibility */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: dims.height * 0.62,
          display: "flex",
          background: `linear-gradient(0deg, ${brand.dark} 6%, rgba(15,17,21,0.55) 48%, rgba(15,17,21,0) 100%)`,
        }}
      />
      {/* logo or short-mark chip */}
      {logoDataUrl ? (
        <img
          src={logoDataUrl}
          style={{ position: "absolute", top: 56 * u, left: 56 * u, height: 72 * u, objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 56 * u,
            left: 56 * u,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 72 * u,
            paddingLeft: 22 * u,
            paddingRight: 22 * u,
            backgroundColor: brand.accent,
            color: brand.light,
            fontFamily: "Heading",
            fontSize: 34 * u,
            borderRadius: 14 * u,
          }}
        >
          {brand.shortMark}
        </div>
      )}
      {/* copy block */}
      <div
        style={{
          position: "absolute",
          left: 56 * u,
          right: 56 * u,
          bottom: 56 * u,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {copy.kicker ? (
          <div
            style={{
              display: "flex",
              color: brand.accent,
              fontFamily: "Heading",
              fontSize: 26 * u,
              letterSpacing: 2 * u,
              textTransform: "uppercase",
              marginBottom: 18 * u,
            }}
          >
            {copy.kicker}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            color: brand.light,
            fontFamily: "Heading",
            fontSize: 78 * u,
            lineHeight: 1.05,
            letterSpacing: -1 * u,
            marginBottom: copy.ctaLabel ? 32 * u : 0,
          }}
        >
          {copy.headline}
        </div>
        {copy.ctaLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: brand.accent,
              color: brand.light,
              fontFamily: "Heading",
              fontSize: 30 * u,
              paddingTop: 20 * u,
              paddingBottom: 20 * u,
              paddingLeft: 34 * u,
              paddingRight: 34 * u,
              borderRadius: 16 * u,
            }}
          >
            {copy.ctaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Write the renderer**

Create `src/lib/media/compose/renderer.ts`:

```ts
import { ImageResponse } from "next/og";

import {
  CREATIVE_DIMENSIONS,
  type BrandTokens,
  type CreativeCopy,
  type CreativeFormat,
  type CreativeTemplateId,
} from "@/domain";

import { loadCreativeFonts } from "./fonts";
import type { CreativeTemplate } from "./types";
import { templateBold } from "./templates/bold";

const TEMPLATES: Record<CreativeTemplateId, CreativeTemplate> = {
  bold: templateBold,
  // editorial + minimal registered in Task 4
  editorial: templateBold,
  minimal: templateBold,
};

/** Fetch an http(s) image and inline it as a data: URL (satori renders these reliably). */
async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch image (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export type RenderCreativeInput = {
  template: CreativeTemplateId;
  format: CreativeFormat;
  brand: BrandTokens;
  copy: CreativeCopy;
  backgroundUrl: string;
};

/** Render a finished, brand-tokenized creative to a PNG buffer. */
export async function renderCreative(
  input: RenderCreativeInput,
): Promise<{ bytes: Buffer; contentType: "image/png" }> {
  const dims = CREATIVE_DIMENSIONS[input.format];
  const backgroundDataUrl = await toDataUrl(input.backgroundUrl);
  const logoDataUrl = input.brand.logoUrl
    ? await toDataUrl(input.brand.logoUrl).catch(() => null) // a broken logo must not kill the render
    : null;
  const fonts = await loadCreativeFonts(input.brand);
  const template = TEMPLATES[input.template] ?? templateBold;
  const element = template({ brand: input.brand, copy: input.copy, dims, backgroundDataUrl, logoDataUrl });
  const response = new ImageResponse(element, { width: dims.width, height: dims.height, fonts });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType: "image/png" };
}
```

- [ ] **Step 4: Write the smoke test**

Create `src/lib/media/compose/renderer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { toBrandTokens } from "@/domain";
import { renderCreative } from "./renderer";

// 1x1 transparent PNG, used as both background and logo fetch responses.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

afterEach(() => vi.unstubAllGlobals());

describe("renderCreative", () => {
  it("renders the bold template to a non-empty PNG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(TINY_PNG, { headers: { "content-type": "image/png" } })),
    );
    const brand = toBrandTokens(null);
    const out = await renderCreative({
      template: "bold",
      format: "1:1",
      brand,
      copy: { headline: "Flooded? On-site in 60 minutes.", kicker: "24/7 Water Emergency", ctaLabel: "Call now" },
      backgroundUrl: "https://cdn.example/bg.png",
    });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes.length).toBeGreaterThan(1000);
    // PNG magic bytes
    expect(out.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm test src/lib/media/compose/renderer.test.ts`
Expected: PASS — a PNG buffer with the PNG magic header.

> **If `next/og` fails to initialize under vitest** (wasm load error for satori/resvg): keep the renderer code, change the test to `it.skip(...)` with a one-line comment "covered by the route test + manual verification (Task 7)", and rely on Task 5's mocked-renderer route test plus Task 7's live render. Do not delete the renderer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/compose/types.ts src/lib/media/compose/templates/bold.tsx src/lib/media/compose/renderer.ts src/lib/media/compose/renderer.test.ts
git commit -m "feat(creative): ImageResponse renderer + bold template"
```

---

## Task 4: Editorial + minimal templates

**Files:**
- Create: `src/lib/media/compose/templates/editorial.tsx`
- Create: `src/lib/media/compose/templates/minimal.tsx`
- Modify: `src/lib/media/compose/renderer.ts`
- Modify: `src/lib/media/compose/renderer.test.ts`

- [ ] **Step 1: Write the "editorial" template**

Create `src/lib/media/compose/templates/editorial.tsx`:

```tsx
import type { CreativeTemplate } from "../types";

/** Editorial: accent side-rail, kicker + headline up top on a dark band, logo + outline CTA at the foot. */
export const templateEditorial: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: dims.width,
        height: dims.height,
        backgroundColor: brand.dark,
        fontFamily: "Body",
        overflow: "hidden",
      }}
    >
      <img
        src={backgroundDataUrl}
        width={dims.width}
        height={dims.height}
        style={{ position: "absolute", top: 0, left: 0, width: dims.width, height: dims.height, objectFit: "cover" }}
      />
      {/* accent rail */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 16 * u, display: "flex", backgroundColor: brand.accent }} />
      {/* top band */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          paddingTop: 56 * u,
          paddingBottom: 64 * u,
          paddingLeft: 64 * u,
          paddingRight: 56 * u,
          background: `linear-gradient(180deg, ${brand.dark} 30%, rgba(15,17,21,0) 100%)`,
        }}
      >
        {copy.kicker ? (
          <div
            style={{
              display: "flex",
              color: brand.accent,
              fontFamily: "Heading",
              fontSize: 24 * u,
              letterSpacing: 3 * u,
              textTransform: "uppercase",
              marginBottom: 16 * u,
            }}
          >
            {copy.kicker}
          </div>
        ) : null}
        <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 70 * u, lineHeight: 1.06, letterSpacing: -1 * u }}>
          {copy.headline}
        </div>
      </div>
      {/* bottom scrim */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: dims.height * 0.34,
          display: "flex",
          background: `linear-gradient(0deg, ${brand.dark} 8%, rgba(15,17,21,0) 100%)`,
        }}
      />
      {/* foot: logo + outline CTA */}
      <div
        style={{
          position: "absolute",
          left: 64 * u,
          right: 56 * u,
          bottom: 56 * u,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} style={{ height: 56 * u, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 34 * u }}>{brand.displayName}</div>
        )}
        {copy.ctaLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: brand.light,
              fontFamily: "Heading",
              fontSize: 28 * u,
              paddingTop: 16 * u,
              paddingBottom: 16 * u,
              paddingLeft: 28 * u,
              paddingRight: 28 * u,
              border: `${3 * u}px solid ${brand.light}`,
              borderRadius: 12 * u,
            }}
          >
            {copy.ctaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Write the "minimal" template**

Create `src/lib/media/compose/templates/minimal.tsx`:

```tsx
import type { CreativeTemplate } from "../types";

/** Minimal: solid brand-primary side panel with serif-friendly headline; photo fills the rest. */
export const templateMinimal: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080;
  const panelW = dims.width * 0.5;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: dims.width,
        height: dims.height,
        backgroundColor: brand.primary,
        fontFamily: "Body",
        overflow: "hidden",
      }}
    >
      {/* photo on the right */}
      <img
        src={backgroundDataUrl}
        width={dims.width}
        height={dims.height}
        style={{ position: "absolute", top: 0, left: 0, width: dims.width, height: dims.height, objectFit: "cover" }}
      />
      {/* solid panel on the left */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: panelW,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64 * u,
          backgroundColor: brand.primary,
        }}
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} style={{ height: 64 * u, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 38 * u }}>{brand.displayName}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {copy.kicker ? (
            <div
              style={{
                display: "flex",
                color: brand.accent,
                fontFamily: "Heading",
                fontSize: 24 * u,
                letterSpacing: 3 * u,
                textTransform: "uppercase",
                marginBottom: 18 * u,
              }}
            >
              {copy.kicker}
            </div>
          ) : null}
          <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 64 * u, lineHeight: 1.1 }}>
            {copy.headline}
          </div>
          <div style={{ display: "flex", width: 64 * u, height: 4 * u, backgroundColor: brand.accent, marginTop: 28 * u, marginBottom: 28 * u }} />
          {copy.ctaLabel ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                backgroundColor: brand.accent,
                color: brand.primary,
                fontFamily: "Heading",
                fontSize: 28 * u,
                paddingTop: 18 * u,
                paddingBottom: 18 * u,
                paddingLeft: 30 * u,
                paddingRight: 30 * u,
                borderRadius: 10 * u,
              }}
            >
              {copy.ctaLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Register both templates in the renderer**

In `src/lib/media/compose/renderer.ts`, update the imports and the `TEMPLATES` map:

```ts
import { templateBold } from "./templates/bold";
import { templateEditorial } from "./templates/editorial";
import { templateMinimal } from "./templates/minimal";

const TEMPLATES: Record<CreativeTemplateId, CreativeTemplate> = {
  bold: templateBold,
  editorial: templateEditorial,
  minimal: templateMinimal,
};
```

- [ ] **Step 4: Extend the smoke test to cover all templates + a portrait format**

In `src/lib/media/compose/renderer.test.ts`, add this test inside the `describe("renderCreative", ...)` block:

```ts
it("renders every template across square and portrait", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(TINY_PNG, { headers: { "content-type": "image/png" } })),
  );
  const brand = toBrandTokens(null);
  for (const template of ["bold", "editorial", "minimal"] as const) {
    for (const format of ["1:1", "4:5"] as const) {
      const out = await renderCreative({
        template,
        format,
        brand,
        copy: { headline: "We restore. You recover.", kicker: "Storm Response", ctaLabel: "Get help" },
        backgroundUrl: "https://cdn.example/bg.png",
      });
      expect(out.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  }
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/lib/media/compose/renderer.test.ts`
Expected: PASS (or both `it.skip` if `next/og` can't init under vitest — same fallback as Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/compose/templates/editorial.tsx src/lib/media/compose/templates/minimal.tsx src/lib/media/compose/renderer.ts src/lib/media/compose/renderer.test.ts
git commit -m "feat(creative): editorial + minimal templates"
```

---

## Task 5: Compose route — `POST /api/v1/arc/media/compose`

**Files:**
- Create: `src/app/api/v1/arc/media/compose/route.ts`
- Test: `src/app/api/v1/arc/media/compose/route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `src/app/api/v1/arc/media/compose/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/api/v1/arc/_lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/v1/arc/_lib/http")>();
  return {
    ...actual,
    arcGuard: vi.fn(async () => ({ ok: true, scope: { orgId: "org-1", workspaceId: "ws-1", source: "agent-token" } })),
  };
});
vi.mock("@/lib/media", () => ({ isMediaGenEnabled: vi.fn(() => true) }));
vi.mock("@/lib/brand-kit/persistence", () => ({ getBusinessProfile: vi.fn(async () => null) }));
vi.mock("@/lib/media/compose/renderer", () => ({
  renderCreative: vi.fn(async () => ({ bytes: Buffer.from("png-bytes"), contentType: "image/png" })),
}));
vi.mock("@/lib/media/storage", () => ({ storeGeneratedMedia: vi.fn(async () => "https://cdn.example/composite.png") }));

import { POST } from "./route";
import { isMediaGenEnabled } from "@/lib/media";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/v1/arc/media/compose", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/arc/media/compose", () => {
  it("returns 201 with a composite-tagged media object", async () => {
    const res = await post({ background_url: "https://cdn.example/bg.png", headline: "Flooded?", cta_label: "Call now" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { media: { url: string; source: string; format: string }; template: string };
    expect(json.media.url).toBe("https://cdn.example/composite.png");
    expect(json.media.source).toBe("composite");
    expect(json.media.format).toBe("1:1");
    expect(["bold", "editorial", "minimal"]).toContain(json.template);
  });

  it("rejects when background_url is missing", async () => {
    const res = await post({ headline: "Flooded?" });
    expect(res.status).toBe(400);
  });

  it("rejects when headline is missing", async () => {
    const res = await post({ background_url: "https://cdn.example/bg.png" });
    expect(res.status).toBe(400);
  });

  it("returns 503 when media gen is disabled", async () => {
    vi.mocked(isMediaGenEnabled).mockReturnValueOnce(false);
    const res = await post({ background_url: "https://cdn.example/bg.png", headline: "Flooded?" });
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/media/compose/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

Create `src/app/api/v1/arc/media/compose/route.ts`:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  normalizeCreativeFormat,
  selectCreativeTemplate,
  toBrandTokens,
  type CreativeCopy,
} from "@/domain";
import { INVALID_JSON, arcGuard, fail, readJson } from "@/app/api/v1/arc/_lib/http";
import { isMediaGenEnabled } from "@/lib/media";
import { renderCreative } from "@/lib/media/compose/renderer";
import { storeGeneratedMedia } from "@/lib/media/storage";
import { getBusinessProfile } from "@/lib/brand-kit/persistence";

// satori + custom font file reads need the Node runtime, not edge.
export const runtime = "nodejs";

const COMPOSITE_RISK =
  "Real logo overlaid on an AI-generated background — the background is not proof of a real job.";

/**
 * Composite a finished, on-brand creative: AI background + Brand Kit (logo,
 * palette, fonts) + headline/CTA copy → a single PNG stored in campaign-media.
 * Bearer-gated; flag-gated by isMediaGenEnabled(). No outbound — the caller
 * lands the result as an approval-gated draft asset.
 *
 *   POST /api/v1/arc/media/compose
 *   { background_url, headline, kicker?, cta_label?, format?, template?, seed? }
 *   -> 201 { ok, status:"created", media, objectPath, template }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  if (!isMediaGenEnabled()) {
    return fail("not_configured", "Creative compositing isn't enabled (needs ARC_MEDIA_ENABLED and GEMINI_API_KEY).", 503);
  }

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const backgroundUrl = str(body.background_url);
  if (!backgroundUrl) return fail("rejected", "background_url is required.", 400);
  const headline = str(body.headline);
  if (!headline) return fail("rejected", "headline is required.", 400);

  const copy: CreativeCopy = {
    headline,
    kicker: str(body.kicker) || undefined,
    ctaLabel: str(body.cta_label) || undefined,
  };
  const format = normalizeCreativeFormat(str(body.format));
  const template = selectCreativeTemplate({ hint: str(body.template) || null, seed: str(body.seed) || backgroundUrl });

  try {
    const profile = await getBusinessProfile(allowed.scope.orgId);
    const brand = toBrandTokens(profile);
    const { bytes, contentType } = await renderCreative({ template, format, brand, copy, backgroundUrl });

    const objectPath = `arc-composite/${allowed.scope.orgId}/${allowed.scope.workspaceId}/${randomUUID()}.png`;
    const url = await storeGeneratedMedia(objectPath, bytes, contentType);

    const media = {
      kind: "image" as const,
      url,
      source: "composite" as const,
      format,
      riskFlags: [COMPOSITE_RISK],
    };
    return NextResponse.json({ ok: true, status: "created", media, objectPath, template }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Creative compositing failed.", 502);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/media/compose/route.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/media/compose/route.ts src/app/api/v1/arc/media/compose/route.test.ts
git commit -m "feat(creative): POST /api/v1/arc/media/compose route"
```

---

## Task 6: Runner tool `compose_creative` + prompt

This is the tool Arc calls so it *finishes* creatives. It chains: get a background (use a passed `background_url`, or generate one) → call `/compose` → land the composite as one approval-gated draft asset via the existing `/draft-asset` route.

**Files:**
- Modify: `apps/arc-runner/src/tools/media.ts`
- Modify: `apps/arc-runner/src/tools/index.test.ts`
- Modify: `apps/arc-runner/src/tools/media.test.ts`
- Modify: `apps/arc-runner/src/prompt.ts`

> Fresh worktrees have no shared `node_modules`. If runner tests error on missing deps, run `pnpm install` once at the repo root first.

- [ ] **Step 1: Update the pinned tool-surface list (test-first)**

In `apps/arc-runner/src/tools/index.test.ts`, add `compose_creative` to the `DRAFT` array (line ~49):

```ts
const DRAFT = ["create_campaign_draft", "generate_image", "generate_video", "compose_creative", "analyze_website", "propose_brand_profile", "attach_media"];
```

- [ ] **Step 2: Add a wiring assertion in media.test.ts**

Open `apps/arc-runner/src/tools/media.test.ts` to see the existing pattern (it calls `mediaTools(...)` and inspects returned tool names). Add a test mirroring that pattern:

```ts
it("exposes compose_creative", () => {
  const names = mediaTools(stubClient, step, () => {}, {}).map((t) => t.name);
  expect(names).toContain("compose_creative");
});
```

(Use the same `stubClient` / `step` setup already defined at the top of that file. If the file's `mediaTools(...)` call uses a different argument shape, match it exactly.)

- [ ] **Step 3: Run the two tests to verify they fail**

Run: `pnpm --filter arc-runner test src/tools/index.test.ts src/tools/media.test.ts`
Expected: FAIL — `compose_creative` not found in the assembled tools.

- [ ] **Step 4: Implement the tool**

In `apps/arc-runner/src/tools/media.ts`, add the `composeCreative` tool inside `mediaTools(...)`, just before the `return` statement. It reuses the same `client`, `step`, `collectCard`, and `ctx` already in scope:

```ts
  const composeCreative = tool(
    "compose_creative",
    "Produce a FINISHED, on-brand creative — the business's real logo + headline + CTA + brand colors/fonts composited onto an AI background — and land it as an approval-gated draft asset. Use this (not generate_image alone) whenever the operator wants a usable ad/social/one-pager creative. Provide the SCENE for the background via `prompt` (+ optional `style`), OR pass an existing `background_url`. Write the on-image words in `headline` (short, punchy), optional `kicker` (small eyebrow), and `cta_label` (button text). The server pulls the brand logo/palette/fonts from the Brand Kit and picks a layout (override with `template`). Do NOT bake text/logos into the background prompt — the compositor adds the real ones. Attach to an existing campaign with campaign_id, or start a new draft with name + persona + restoration_focus; infer sensible values rather than interrogating the operator and note your assumptions.",
    {
      headline: z.string().describe("The main on-image line — short and punchy. No logos/URLs."),
      title: z.string().describe("Short title for the asset"),
      prompt: z.string().optional().describe("Scene for the AI background (omit if passing background_url). No text/logos."),
      background_url: z.string().optional().describe("Use this existing image as the background instead of generating one"),
      style: z.string().optional().describe("Background look, e.g. 'candid documentary photograph, natural lighting'"),
      kicker: z.string().optional().describe("Small eyebrow line above the headline"),
      cta_label: z.string().optional().describe("Call-to-action button text, e.g. 'Call (312) 555-0199'"),
      format: z.string().optional().describe("1:1 | 4:5 | 9:16 | 16:9 (default 1:1)"),
      template: z.string().optional().describe("bold | editorial | minimal (default: auto-selected)"),
      asset_type: z.string().optional().describe("default image_prompt"),
      campaign_id: z.string().optional(),
      name: z.string().optional(),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
    },
    async (args) => {
      const label = "Composing creative";
      await step(label, "running");
      try {
        // 1. Resolve the background: use a passed URL, or generate one.
        let backgroundUrl = args.background_url?.trim();
        if (!backgroundUrl) {
          if (!args.prompt?.trim()) {
            await step(label, "done");
            return textResult("compose_creative needs either a background_url or a prompt to generate the background.");
          }
          const bg = await client.apiPost<{ media: ArcMedia }>("/api/v1/arc/media/generate-image", {
            prompt: args.prompt,
            style: args.style,
            aspect_ratio: args.format,
            level: ctx.level,
          });
          backgroundUrl = bg.media.url;
        }

        // 2. Composite the finished creative.
        const composed = await client.apiPost<{ media: ArcMedia; objectPath?: string; template: string }>(
          "/api/v1/arc/media/compose",
          {
            background_url: backgroundUrl,
            headline: args.headline,
            kicker: args.kicker,
            cta_label: args.cta_label,
            format: args.format,
            template: args.template,
            seed: ctx.campaignId ?? args.campaign_id,
          },
        );

        // 3. Land it as one approval-gated draft asset.
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            ...(args.campaign_id ? { campaign_id: args.campaign_id } : ctx.campaignId ? { campaign_id: ctx.campaignId } : {}),
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "image_prompt",
            title: args.title,
            media_url: composed.media.url,
            media_path: composed.objectPath,
            media: composed.media,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );

        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: composed.media,
          approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
        });
        return textResult(
          JSON.stringify({
            campaignId: draft.campaignId,
            assetId: draft.assetId,
            media: composed.media,
            template: composed.template,
            status: "finished composite created, pending approval",
          }),
        );
      } catch (error) {
        await step(label, "done");
        return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  );
```

Then change the return at the end of `mediaTools` from:

```ts
  return [generateImage, generateVideo];
```

to:

```ts
  return [generateImage, generateVideo, composeCreative];
```

- [ ] **Step 5: Update Arc's prompt to prefer finishing creatives**

In `apps/arc-runner/src/prompt.ts`, replace the first two sentences of the `CREATIVE.` paragraph (it currently starts "Prefer the business's real, approved media. With generate_image / generate_video ...") so it reads:

```
CREATIVE. Prefer the business's real, approved media. To make a USABLE ad/social/one-pager, use compose_creative — it composites the business's real logo + your headline/CTA + brand colors/fonts onto an AI background and lands one finished, approval-gated asset; reach for it instead of leaving a bare background or describing an overlay in text. Use generate_image / generate_video (act/draft) only when you specifically want a raw visual (a background, a concept, a clip) without finished branding — never to fabricate a photo of a real job or a before/after that didn't happen. Describe the scene in prompt and the look in style (for realism, "candid documentary photograph, natural lighting"). Never put text, words, logos, or signage in the generated image — the server strips them and the compositor adds the real logo/copy. generate_video produces a short Veo clip (16:9 or 9:16) that renders asynchronously (about 1–3 minutes, with progress shown) — same rules: no in-image text/logos, augment never fabricate, approval-gated. Infer a sensible campaign name and persona rather than interrogating the operator; state your assumptions briefly. Every generated asset is tagged AI, risk-flagged, and approval-gated. Flag creative risks — misleading scenes, embedded text, privacy issues, unsubstantiated claims.
```

If `apps/arc-runner/src/prompt.test.ts` asserts on specific CREATIVE wording, update those assertions to match (e.g. it may check the paragraph contains "generate_image"; add/adjust a check for "compose_creative").

- [ ] **Step 6: Run the full runner suite**

Run: `pnpm --filter arc-runner test`
Expected: PASS — including `tools/index.test.ts` (act/draft sets now include `compose_creative`), `tools/media.test.ts`, and `prompt.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/arc-runner/src/tools/media.ts apps/arc-runner/src/tools/index.test.ts apps/arc-runner/src/tools/media.test.ts apps/arc-runner/src/prompt.ts apps/arc-runner/src/prompt.test.ts
git commit -m "feat(arc): compose_creative tool + prompt — Arc finishes creatives, not specs"
```

---

## Task 7: Typecheck, build, and live verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + build (lint ≠ typecheck)**

Run: `pnpm build`
Expected: build completes with no type errors. (`pnpm lint` alone does not typecheck — the build/tsc pass is what catches typed-Supabase-enum and JSX issues.)

- [ ] **Step 2: Lint the changed files (scoped — the repo lint scans vendored files)**

Run: `pnpm lint` and confirm no new errors in the files this plan created/modified. If `pnpm lint` floods with pre-existing vendor noise, scope it, e.g.:
`pnpm exec eslint src/domain/creative-templates.ts src/lib/media/compose src/app/api/v1/arc/media/compose apps/arc-runner/src/tools/media.ts`
Expected: clean for our files.

- [ ] **Step 3: Run the full app test suite for regressions**

Run: `pnpm test`
Expected: no new failures attributable to this work. (Some pre-existing draft-asset route tests 502 because `revalidatePath` throws in the vitest node env — that is a known, unrelated condition; confirm the set of failures matches `main` before this branch.)

- [ ] **Step 4: Live render check**

With `ARC_MEDIA_ENABLED=1`, `GEMINI_API_KEY`, Supabase env vars, and `ARC_AGENT_API_TOKEN` set, start the app (`pnpm dev`) and exercise the route directly with a real background URL (any public image) to confirm a PNG lands in the bucket:

```bash
curl -sS -X POST http://localhost:3000/api/v1/arc/media/compose \
  -H "Authorization: Bearer $ARC_AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"background_url":"https://images.unsplash.com/photo-1581578731548-c64695cc6952","headline":"Flooded? On-site in 60 minutes.","kicker":"24/7 Water Emergency","cta_label":"Call (312) 555-0199","format":"4:5"}' | tee /tmp/compose.json
```
Expected: `201` with `media.source:"composite"` and a `media.url`. Open `media.url` in a browser and confirm the logo (or short-mark chip), headline, kicker, and CTA are rendered on the background, in brand colors. Repeat with `"template":"editorial"` and `"template":"minimal"` to eyeball all three.

- [ ] **Step 5: End-to-end through Arc**

In the Arc chat (act or draft mode), ask: *"Make a finished water-damage social ad for homeowners — our logo, a headline, and a call-now CTA."* Confirm Arc calls `compose_creative` (one draft asset appears), the asset card shows the **finished, branded** image (not a bare background), it is `pending_approval` + dispatch-locked, and the provenance shows `source: composite` with the risk flag. This is the acceptance test for the original complaint.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(creative): verification fixes for compositing"
```

---

## Self-review notes (already reconciled against the spec)

- **Spec §5.1 render engine** → Tasks 3/5 (`ImageResponse`, Node runtime). **§5.2 templates** → Tasks 1/3/4. **§5.3 fonts** → Task 2. **§5.4 route** → Task 5. **§5.5 tool** → Task 6 (+ pinned-list update). **§5.6 prompt/default behavior** → Task 6. **§5.7 provenance/approval** → Task 5 (`source:"composite"`, risk flag) + reused draft-asset path. **§7 formats** → Task 1 dims + Task 4 covers 1:1/4:5; 9:16/16:9 dims exist and render but get live-checked later. **§8 fallbacks** → Task 3 (logo fetch `.catch`), Task 1 (neutral tokens). **§9 security** → Task 5 (bearer via `arcGuard`, no outbound).
- **Deviation from spec §5.6 (documented):** v1 stores the composite as the single asset; the bare AI background is created only if Arc separately called `generate_image`. `compose_creative` generates the background internally and lands **one** finished asset, which is cleaner than two drafts. The background's provenance is carried by the composite's risk flag. The spec's "bare background kept as a distinct source-layer asset" is deferred — note it if a reviewer asks.
- **Type consistency:** `BrandTokens`, `CreativeCopy`, `CreativeFormat`, `CreativeTemplateId`, `CreativeDimensions` defined in Task 1 and imported unchanged by Tasks 3–5; `CreativeTemplate`/`CreativeTemplateProps` in Task 3 used by Tasks 3–4; route response `media.source:"composite"` matches `ArcMedia.source` union (already includes `"composite"`).
- **Known-fragile:** `next/og` under vitest (Tasks 3/4 fallback to `it.skip` + route/manual coverage); font filenames from the `@expo-google-fonts` packages (Task 2 verify step); satori's CSS subset (templates use only flex + absolute + supported props).
