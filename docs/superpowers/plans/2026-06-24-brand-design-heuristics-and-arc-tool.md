# Brand-Design Heuristics + Arc Design Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the website color-extraction heuristics, and give Arc a read-only `analyze_brand_design` tool plus a `propose_brand_profile` that carries the full palette + fonts into a DRAFT profile (operator activates — Arc never does), fixing the existing logo/favicon hotlink along the way.

**Architecture:** Part 1 is pure-domain changes to `src/domain/brand-design.ts` (+ tests). Part 2 extracts a shared `storeBrandImageFromUrl` helper, adds a bearer-gated `POST /api/v1/arc/brand/design` route, extends the `PUT /api/v1/arc/brand/profile` route + the `propose_brand_profile` runner tool to accept palette/fonts and store (not hotlink) images, and adds a new `analyze_brand_design` runner tool.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Supabase, Vitest, the `@anthropic-ai/claude-agent-sdk` `tool()` helper + Zod in `apps/arc-runner`. Package manager **pnpm**.

**Reference spec:** `docs/superpowers/specs/2026-06-24-brand-design-heuristics-and-arc-tool-design.md`

---

## Conventions for every task

- Run a single test file: `pnpm test path/to/file.test.ts`
- Run a runner test (the `apps/arc-runner` package has its own vitest): `pnpm --filter arc-runner test path/to/file.test.ts` — and if a fresh worktree errors that vitest/deps are missing in `apps/arc-runner`, run `pnpm --filter arc-runner install` (known gotcha: fresh worktrees have no shared node_modules for the runner).
- Lint ONLY changed files: `pnpm exec eslint <file>` (whole-repo lint scans vendored files — don't).
- Typecheck the app with `pnpm build`; typecheck the runner with `pnpm --filter arc-runner exec tsc --noEmit` (lint does NOT typecheck).
- Commit after each task. Branch `claude/elegant-heyrovsky-02dc2e` — do not touch main.

---

## File Structure

Modified:
- `src/domain/brand-design.ts` (+ `src/domain/__tests__/brand-design.test.ts`) — Parts 1 (Tasks 1–2)
- `src/app/library/brand/actions.ts` — use shared helper (Task 3)
- `src/app/api/v1/arc/brand/profile/route.ts` (+ `route.test.ts`) — palette/fonts + image store (Task 5)
- `apps/arc-runner/src/tools/brand.ts` (+ `brand.test.ts`) — new tool + extended propose (Task 6)
- `apps/arc-runner/src/tools/index.test.ts` — tool-surface update (Task 6)

New:
- `src/lib/brand-kit/brand-image.ts` (+ `brand-image.test.ts`) — shared store helper (Task 3)
- `src/app/api/v1/arc/brand/design/route.ts` (+ `route.test.ts`) — design route (Task 4)

---

## Task 1: Color parsing robustness + prominence tiebreaker

**Files:**
- Modify: `src/domain/brand-design.ts`
- Test: `src/domain/__tests__/brand-design.test.ts`

- [ ] **Step 1: Add failing tests**

In `src/domain/__tests__/brand-design.test.ts`, inside the existing `describe("extractBrandDesign — colors", ...)` block, add:

```ts
  it("normalizes 8-digit hex (#rrggbbaa) by dropping the alpha", () => {
    const signal = extractBrandDesign(`<head><style>body{color:#1b2a4aff}</style></head>`, BASE);
    expect(signal.colors.map((c) => c.hex)).toContain("#1b2a4a");
  });

  it("tags an !important brand CSS variable as css-var", () => {
    const signal = extractBrandDesign(`<head><style>:root{--brand-primary:#C8A24B !important}</style></head>`, BASE);
    expect(signal.colors.find((c) => c.hex === "#c8a24b")?.source).toBe("css-var");
  });

  it("orders equal-tier frequency colors by prominence (count)", () => {
    const html = `<head><style>
      a{color:#0f8a5f} .b{border-color:#0f8a5f} .c{outline-color:#0f8a5f}
      h2{color:#c8a24b}
    </style></head>`;
    const signal = extractBrandDesign(html, BASE);
    const i0f = signal.colors.findIndex((c) => c.hex === "#0f8a5f");
    const ic8 = signal.colors.findIndex((c) => c.hex === "#c8a24b");
    expect(i0f).toBeGreaterThanOrEqual(0);
    expect(ic8).toBeGreaterThanOrEqual(0);
    expect(i0f).toBeLessThan(ic8);
  });
```

- [ ] **Step 2: Run, verify the new cases fail**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: the three new cases FAIL (8-digit dropped → no `#1b2a4a`; `!important` value tagged `frequency` not `css-var`; prominence order not guaranteed).

- [ ] **Step 3: Update `BrandDesignColor`, `normalizeHex`, css-var capture, frequency regex, and the sort**

In `src/domain/brand-design.ts`:

(a) Add an optional `count` to the color type (line 9):
```ts
export type BrandDesignColor = { hex: string; source: "theme-color" | "css-var" | "frequency"; count?: number };
```

(b) Replace `normalizeHex` (lines 89–93) to accept 3/4/6/8-digit and drop alpha:
```ts
function normalizeHex(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  else if (/^#[0-9a-f]{8}$/.test(v)) v = v.slice(0, 7);
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}
```

(c) Replace the `add` closure + the css-var loop + the frequency loops + the final sort inside `extractColors` (lines 122–159) with:
```ts
  const found = new Map<string, BrandDesignColor>();
  const add = (hex: string | null, source: BrandDesignColor["source"], count?: number) => {
    if (hex && !found.has(hex)) found.set(hex, { hex, source, ...(count !== undefined ? { count } : {}) });
  };

  for (const t of tagsOf(html, "meta")) {
    if (/name\s*=\s*["']theme-color["']/i.test(t)) add(normalizeHex(attr(t, "content") ?? ""), "theme-color");
  }

  const styles = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const inline = (html.match(/style\s*=\s*"([^"]*)"/gi) ?? []).join("\n");
  const css = `${styles}\n${inline}`;

  for (const m of css.matchAll(/--[\w-]*(?:primary|secondary|accent|brand|color)[\w-]*\s*:\s*([^;}]+)/gi)) {
    const firstToken = m[1].trim().split(/\s+/)[0]; // drop "!important" and trailing tokens
    add(normalizeHex(firstToken) ?? rgbToHex(m[1]), "css-var");
  }

  const freq = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = normalizeHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\([^)]*\)/gi)) {
    const hex = rgbToHex(m[0]);
    if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  for (const [hex, count] of [...freq.entries()].sort((a, b) => b[1] - a[1])) add(hex, "frequency", count);

  // Rank: saturated brand colors first, gray extremes last; within a bucket,
  // trust an explicit brand-named CSS variable over a theme-color meta (often a
  // dark chrome color) over a raw frequency match; then by on-page prominence.
  const sourceRank = (s: BrandDesignColor["source"]) => (s === "css-var" ? 0 : s === "theme-color" ? 1 : 2);
  return [...found.values()].sort((a, b) => {
    const va = saturation(a.hex) > 0.15 ? 0 : 1;
    const vb = saturation(b.hex) > 0.15 ? 0 : 1;
    if (va !== vb) return va - vb;
    const r = sourceRank(a.source) - sourceRank(b.source);
    if (r !== 0) return r;
    return (b.count ?? 0) - (a.count ?? 0);
  });
```

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: PASS (the prior 12 cases + 3 new = 15). The earlier "ranks a brand CSS variable ahead of the theme-color meta" case still passes.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts
git commit -m "feat(brand): 8-digit hex, !important css-vars, prominence-ranked colors"
```

---

## Task 2: Dedupe near-identical swatches + dark/light from neutrals

**Files:**
- Modify: `src/domain/brand-design.ts`
- Test: `src/domain/__tests__/brand-design.test.ts`

- [ ] **Step 1: Add failing tests**

In `src/domain/__tests__/brand-design.test.ts`, add to the `colors` describe block:
```ts
  it("collapses near-identical colors into one swatch (keeps higher-priority source)", () => {
    const html = `<head><style>:root{--brand-primary:#c8a24b} body{color:#c9a34c}</style></head>`;
    const signal = extractBrandDesign(html, BASE);
    const goldish = signal.colors.filter((c) => c.hex === "#c8a24b" || c.hex === "#c9a34c");
    expect(goldish).toHaveLength(1);
    expect(goldish[0].hex).toBe("#c8a24b"); // css-var beats the near-duplicate frequency color
  });
```

And in the `describe("brandDesignToPaletteUpdate", ...)` block, add:
```ts
  it("keeps a vivid brand color out of the dark/light slots when a neutral exists", () => {
    const update = brandDesignToPaletteUpdate({
      logoCandidates: [], faviconUrl: null,
      colors: [
        { hex: "#1a0a2e", source: "css-var" },   // very dark purple — vivid → primary
        { hex: "#333333", source: "frequency" }, // neutral gray
        { hex: "#fafafa", source: "frequency" }, // near-white neutral
      ],
      headingFont: null, bodyFont: null,
    });
    expect(update.primary).toBe("#1a0a2e");
    expect(update.dark).toBe("#333333");  // not the darker vivid purple
    expect(update.light).toBe("#fafafa");
  });
```

- [ ] **Step 2: Run, verify the new cases fail**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: the two new cases FAIL (both near-identical colors currently survive; dark currently picks the darkest overall = the vivid `#1a0a2e`).

- [ ] **Step 3: Add `rgbDistance`, dedupe the final list, and pick dark/light from neutrals**

In `src/domain/brand-design.ts`:

(a) Add this helper just below `saturation` (after line 119):
```ts
/** Euclidean RGB distance (0–441). Used to collapse near-identical swatches. */
function rgbDistance(a: string, b: string): number {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const dr = ch(a, 1) - ch(b, 1);
  const dg = ch(a, 3) - ch(b, 3);
  const db = ch(a, 5) - ch(b, 5);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
```

(b) At the end of `extractColors`, replace the final `return [...found.values()].sort(...)` so the sorted list is deduped before returning. Change:
```ts
  return [...found.values()].sort((a, b) => {
    const va = saturation(a.hex) > 0.15 ? 0 : 1;
    const vb = saturation(b.hex) > 0.15 ? 0 : 1;
    if (va !== vb) return va - vb;
    const r = sourceRank(a.source) - sourceRank(b.source);
    if (r !== 0) return r;
    return (b.count ?? 0) - (a.count ?? 0);
  });
```
to:
```ts
  const sorted = [...found.values()].sort((a, b) => {
    const va = saturation(a.hex) > 0.15 ? 0 : 1;
    const vb = saturation(b.hex) > 0.15 ? 0 : 1;
    if (va !== vb) return va - vb;
    const r = sourceRank(a.source) - sourceRank(b.source);
    if (r !== 0) return r;
    return (b.count ?? 0) - (a.count ?? 0);
  });
  // Collapse near-identical swatches; the earlier (higher-priority) one wins.
  const deduped: BrandDesignColor[] = [];
  for (const c of sorted) {
    if (deduped.some((kept) => rgbDistance(kept.hex, c.hex) < 32)) continue;
    deduped.push(c);
  }
  return deduped;
```

(c) Replace `brandDesignToPaletteUpdate`'s dark/light block. Change the body (lines 207–221) to:
```ts
  const update: BrandDesignPaletteUpdate = {};
  const vivid = signal.colors.filter((c) => saturation(c.hex) > 0.15).map((c) => c.hex);
  const [primary, secondary, accent] = vivid;
  if (primary) update.primary = primary;
  if (secondary) update.secondary = secondary;
  if (accent) update.accent = accent;

  // Prefer true neutrals (colors not chosen as a vivid brand color) for dark/light,
  // so a vivid primary doesn't also become the "dark" ink.
  const vividPicks = new Set([primary, secondary, accent].filter(Boolean));
  const neutrals = signal.colors.filter((c) => !vividPicks.has(c.hex));
  const pool = (neutrals.length > 0 ? neutrals : signal.colors)
    .slice()
    .sort((a, b) => luminance(a.hex) - luminance(b.hex));
  if (pool.length > 0) {
    update.dark = pool[0].hex;
    update.light = pool[pool.length - 1].hex;
  }
  if (signal.headingFont) update.headingFont = signal.headingFont;
  if (signal.bodyFont) update.bodyFont = signal.bodyFont;
  return update;
```

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts`
Expected: PASS (15 prior + 2 new = 17). The existing `brandDesignToPaletteUpdate` "maps vivid colors to primary/secondary/accent and gray extremes to dark/light" case still passes (its input `#111111`/`#fafafa` are neutrals, so dark=`#111111`, light=`#fafafa` unchanged).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/domain/brand-design.ts src/domain/__tests__/brand-design.test.ts
git commit -m "feat(brand): dedupe near-identical swatches; dark/light from neutrals"
```

---

## Task 3: Shared `storeBrandImageFromUrl` helper

**Files:**
- Create: `src/lib/brand-kit/brand-image.ts`
- Test: `src/lib/brand-kit/brand-image.test.ts`
- Modify: `src/app/library/brand/actions.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand-kit/brand-image.test.ts`:
```ts
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
vi.mock("@/lib/media-library/persistence", () => ({
  insertAssetWithUrl: vi.fn(async () => ({ id: "asset_1", url: "https://store.example/logo.png" })),
}));

import { afterEach, describe, expect, it, vi } from "vitest";

import { storeBrandImageFromUrl } from "./brand-image";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";

afterEach(() => vi.restoreAllMocks());

describe("storeBrandImageFromUrl", () => {
  it("downloads an image and returns the stored asset url", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const url = await storeBrandImageFromUrl({
      orgId: "org_1", url: "https://acme.com/logo.png", role: "logo", sourceUrl: "https://acme.com", uploadedBy: "arc",
    });
    expect(url).toBe("https://store.example/logo.png");
    expect(insertAssetWithUrl).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org_1", source: "url", provenance: { brandRole: "logo", sourceUrl: "https://acme.com" } }),
    );
  });

  it("returns null when the image fetch is blocked (SSRF)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const url = await storeBrandImageFromUrl({
      orgId: "org_1", url: "http://127.0.0.1/logo.png", role: "logo", sourceUrl: "", uploadedBy: "arc",
    });
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm test src/lib/brand-kit/brand-image.test.ts`
Expected: FAIL — cannot resolve `./brand-image`.

- [ ] **Step 3: Create the helper**

Create `src/lib/brand-kit/brand-image.ts`:
```ts
import { classifyKind } from "@/domain";
import { insertAssetWithUrl } from "@/lib/media-library/persistence";

import { fetchPublicImage } from "./design-fetch";

/**
 * Download a public image (SSRF-guarded) and store it as a Library asset, returning
 * the hosted URL — or null if the fetch/store fails. Shared by the operator's
 * apply-design action and Arc's propose-brand-profile route so brand logos/favicons
 * are always hosted, never hotlinked.
 */
export async function storeBrandImageFromUrl(args: {
  orgId: string;
  url: string;
  role: "logo" | "favicon";
  sourceUrl: string;
  uploadedBy: string;
}): Promise<string | null> {
  const image = await fetchPublicImage(args.url);
  if (!image.ok) return null;
  const host = (() => {
    try {
      return new URL(args.sourceUrl || args.url).hostname.replace(/^www\./, "");
    } catch {
      return args.role;
    }
  })();
  const safeName = host.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || args.role;
  const ext = image.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const fileName = `${args.role}-${safeName}.${ext}`;
  const result = await insertAssetWithUrl({
    orgId: args.orgId,
    folderId: null,
    fileName,
    bytes: image.bytes,
    contentType: image.contentType,
    kind: classifyKind(image.contentType, fileName),
    byteSize: image.bytes.byteLength,
    source: "url",
    provenance: { brandRole: args.role, sourceUrl: args.sourceUrl },
    uploadedBy: args.uploadedBy,
  });
  return result.url;
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm test src/lib/brand-kit/brand-image.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Refactor `actions.ts` to use the shared helper**

In `src/app/library/brand/actions.ts`:

(a) Replace the import line `import { insertAsset, insertAssetWithUrl } from "@/lib/media-library/persistence";` with:
```ts
import { insertAsset } from "@/lib/media-library/persistence";
```

(b) Replace `import { analyzeBrandDesignFromUrl, fetchPublicImage, type BrandDesignProposal } from "@/lib/brand-kit/design-fetch";` with:
```ts
import { analyzeBrandDesignFromUrl, type BrandDesignProposal } from "@/lib/brand-kit/design-fetch";
import { storeBrandImageFromUrl } from "@/lib/brand-kit/brand-image";
```

(c) Delete the entire local `storeBrandImage` function (the `async function storeBrandImage(args: {...}) {...}` block).

(d) Replace the two call sites: change `storeBrandImage({ orgId, url: logoUrl, role: "logo", sourceUrl, uploadedBy })` to `storeBrandImageFromUrl({ orgId, url: logoUrl, role: "logo", sourceUrl, uploadedBy })`, and `storeBrandImage({ orgId, url: faviconUrl, role: "favicon", sourceUrl, uploadedBy })` to `storeBrandImageFromUrl({ orgId, url: faviconUrl, role: "favicon", sourceUrl, uploadedBy })`.

Note: `classifyKind` stays imported (still used by `uploadAndAnalyzeBrandSourcesAction`). `insertAssetWithUrl` and `fetchPublicImage` are no longer referenced in this file — removing them from the imports (done above) is required so the build doesn't fail on unused imports.

- [ ] **Step 6: Typecheck + the existing design tests still pass**

Run: `pnpm build`
Expected: compiles, no type errors (no unused-import errors for `insertAssetWithUrl`/`fetchPublicImage`).
Run: `pnpm test src/lib/brand-kit/brand-image.test.ts src/lib/brand-kit/design-fetch.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint + commit**

Run: `pnpm exec eslint src/lib/brand-kit/brand-image.ts src/lib/brand-kit/brand-image.test.ts src/app/library/brand/actions.ts`
```bash
git add src/lib/brand-kit/brand-image.ts src/lib/brand-kit/brand-image.test.ts src/app/library/brand/actions.ts
git commit -m "refactor(brand): extract shared storeBrandImageFromUrl helper"
```

---

## Task 4: `POST /api/v1/arc/brand/design` route

**Files:**
- Create: `src/app/api/v1/arc/brand/design/route.ts`
- Test: `src/app/api/v1/arc/brand/design/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/arc/brand/design/route.test.ts` (mirrors the analyze-website route test harness):
```ts
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));
vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true, tokenSource: "database", orgId: "org-2", workspaceId: "20000000-0000-4000-8000-000000000002",
  })),
}));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org-1", workspaceId: "10000000-0000-4000-8000-000000000001", workspaceKey: "default", role: "admin",
  })),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { checkAgentBearer } from "@/lib/auth/api-token";

const bearerMock = vi.mocked(checkAgentBearer);

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/brand/design", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  vi.restoreAllMocks();
  bearerMock.mockReset();
  bearerMock.mockResolvedValue({ ok: true, tokenSource: "database", orgId: "org-2", workspaceId: "20000000-0000-4000-8000-000000000002" });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/brand/design", () => {
  it("401s without a valid token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    bearerMock.mockResolvedValue({ ok: false, reason: "unauthorized", status: 401 });
    const res = await POST(req("Bearer wrong", { url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("400s on a missing url", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
  });

  it("400s on a loopback/private url (SSRF guard)", async () => {
    configure();
    const res = await POST(req("Bearer secret", { url: "http://127.0.0.1/" }));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("rejected");
  });

  it("returns the extracted design proposal", async () => {
    configure();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        `<head><meta name="theme-color" content="#1B2A4A"><link rel="apple-touch-icon" href="/touch.png"><style>:root{--brand-primary:#C8A24B} h1{font-family:Oswald,sans-serif} body{font-family:Inter,Arial}</style></head>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const res = await POST(req("Bearer secret", { url: "https://acme.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.logoUrl).toBe("https://acme.com/touch.png");
    expect(json.palette.primary).toBe("#c8a24b");
    expect(json.headingFont).toBe("Oswald");
    expect(json.sourceUrl).toBe("https://acme.com/");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm test src/app/api/v1/arc/brand/design/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Create the route**

Create `src/app/api/v1/arc/brand/design/route.ts`:
```ts
import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { analyzeBrandDesignFromUrl } from "@/lib/brand-kit/design-fetch";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Fetch a public website and extract brand DESIGN (best logo candidate, colors,
 * fonts) for Arc to propose into a draft. SSRF-guarded by analyzeBrandDesignFromUrl
 * (no storage here — propose_brand_profile stores the chosen logo). No LLM.
 *
 *   POST /api/v1/arc/brand/design  { url }
 *   -> 200 { ok, logoUrl, faviconUrl, palette, headingFont, bodyFont, sourceUrl }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const urlRaw =
    typeof (payload as Record<string, unknown>).url === "string"
      ? ((payload as Record<string, unknown>).url as string).trim()
      : "";
  if (!urlRaw) return fail("rejected", "url is required.", 400);

  const result = await analyzeBrandDesignFromUrl(urlRaw);
  if (!result.ok) {
    return fail(result.status, result.message, result.status === "rejected" ? 400 : 502);
  }
  return ok(result.proposal);
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm test src/app/api/v1/arc/brand/design/route.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Lint + commit**

Run: `pnpm exec eslint src/app/api/v1/arc/brand/design/route.ts src/app/api/v1/arc/brand/design/route.test.ts`
```bash
git add src/app/api/v1/arc/brand/design/route.ts src/app/api/v1/arc/brand/design/route.test.ts
git commit -m "feat(arc): POST /api/v1/arc/brand/design returns extracted design proposal"
```

---

## Task 5: Extend `PUT /api/v1/arc/brand/profile` with palette/fonts + image store

**Files:**
- Modify: `src/app/api/v1/arc/brand/profile/route.ts`
- Test: `src/app/api/v1/arc/brand/profile/route.test.ts`

- [ ] **Step 1: Add failing tests**

In `src/app/api/v1/arc/brand/profile/route.test.ts`:

(a) Add a mock for the image-store helper at the top, next to the existing `vi.mock` calls (after the `@/lib/brand-kit/persistence` mock):
```ts
vi.mock("@/lib/brand-kit/brand-image", () => ({
  storeBrandImageFromUrl: vi.fn(async () => "https://store.example/logo.png"),
}));
```
and import it alongside the others:
```ts
import { storeBrandImageFromUrl } from "@/lib/brand-kit/brand-image";
```
and reset it in `beforeEach` (after the existing resets):
```ts
  vi.mocked(storeBrandImageFromUrl).mockClear();
  vi.mocked(storeBrandImageFromUrl).mockResolvedValue("https://store.example/logo.png");
```

(b) Add these cases inside the `describe("PUT /api/v1/arc/brand/profile", ...)` block:
```ts
  it("merges a proposed palette and fonts into the draft", async () => {
    configure();
    const res = await PUT(req("Bearer secret", {
      displayName: "Acme Co",
      brandPalette: { primary: "#C8A24B", secondary: "#1B2A4A" },
      headingFont: "Oswald",
      bodyFont: "Inter",
    }));
    expect(res.status).toBe(200);
    const profile = upsertMock.mock.calls[0][1];
    expect(profile.brandPalette.primary.hex).toBe("#c8a24b");
    expect(profile.brandPalette.secondary.hex).toBe("#1b2a4a");
    expect(profile.brandPalette.headingFont).toBe("Oswald");
    expect(profile.brandPalette.bodyFont).toBe("Inter");
  });

  it("downloads + stores an external logo instead of hotlinking it", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { displayName: "Acme Co", logoUrl: "https://acme.com/logo.png" }));
    expect(res.status).toBe(200);
    expect(storeBrandImageFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://acme.com/logo.png", role: "logo" }),
    );
    expect(upsertMock.mock.calls[0][1].logoUrl).toBe("https://store.example/logo.png");
  });

  it("ignores an invalid palette hex (keeps the current slot)", async () => {
    configure();
    const res = await PUT(req("Bearer secret", { displayName: "Acme Co", brandPalette: { primary: "not-a-hex" } }));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][1].brandPalette.primary.hex).toBe(""); // NEUTRAL_DEFAULTS empty
  });
```

- [ ] **Step 2: Run, verify the new cases fail**

Run: `pnpm test src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: the three new cases FAIL (palette/fonts not merged; logo not stored — still raw).

- [ ] **Step 3: Extend the route**

In `src/app/api/v1/arc/brand/profile/route.ts`:

(a) Add `runtime` + import the helper at the top (after the existing imports):
```ts
import { storeBrandImageFromUrl } from "@/lib/brand-kit/brand-image";

export const runtime = "nodejs"; // image store needs node:dns + fetch redirect control
```

(b) After the `const g = ...guardrails...` line (currently line 50) and before `const merged`, add palette/font parsing + image resolution:
```ts
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const paletteIn =
    typeof body.brandPalette === "object" && body.brandPalette !== null
      ? (body.brandPalette as Record<string, unknown>)
      : {};
  const slot = (name: "primary" | "secondary" | "accent" | "dark" | "light") => {
    const v = paletteIn[name];
    return typeof v === "string" && HEX.test(v.trim())
      ? { label: current.brandPalette[name].label, hex: v.trim().toLowerCase() }
      : current.brandPalette[name];
  };
  const brandPalette = {
    ...current.brandPalette,
    primary: slot("primary"),
    secondary: slot("secondary"),
    accent: slot("accent"),
    dark: slot("dark"),
    light: slot("light"),
    headingFont: str(body.headingFont, current.brandPalette.headingFont) ?? current.brandPalette.headingFont,
    bodyFont: str(body.bodyFont, current.brandPalette.bodyFont) ?? current.brandPalette.bodyFont,
  };

  // Store (not hotlink) any newly-provided external logo/favicon URL.
  const sourceUrl = str(body.websiteUrl, current.websiteUrl) ?? "";
  const resolveImage = async (raw: unknown, role: "logo" | "favicon", currentValue: string | null) => {
    const value = str(raw, currentValue);
    if (!value || value === currentValue || !/^https?:\/\//i.test(value)) return value;
    const stored = await storeBrandImageFromUrl({ orgId, url: value, role, sourceUrl, uploadedBy: "arc" });
    return stored ?? value;
  };
  const logoUrl = await resolveImage(body.logoUrl, "logo", current.logoUrl);
  const faviconUrl = await resolveImage(body.faviconUrl, "favicon", current.faviconUrl);
```

(c) In the `merged` object literal, replace the existing `logoUrl:` and `faviconUrl:` lines with references to the resolved values, and add `brandPalette`:
```ts
    logoUrl,
    faviconUrl,
```
and add `brandPalette,` to the object (e.g. right after the `guardrails: {...},` block, before `status: "draft"`).

The final `merged` keeps everything else unchanged. (`orgId` is already in scope as `allowed.scope.orgId` → `const orgId = allowed.scope.orgId;` already exists at line 27.)

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm test src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: PASS (the 5 existing + 3 new = 8). Note the "downloads + stores" test relies on the `storeBrandImageFromUrl` mock — no real network.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm build`
Expected: compiles clean.
Run: `pnpm exec eslint src/app/api/v1/arc/brand/profile/route.ts src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/arc/brand/profile/route.ts src/app/api/v1/arc/brand/profile/route.test.ts
git commit -m "feat(arc): brand/profile accepts palette+fonts and stores logos (no hotlink)"
```

---

## Task 6: Runner tools — `analyze_brand_design` + extended `propose_brand_profile`

**Files:**
- Modify: `apps/arc-runner/src/tools/brand.ts`
- Test: `apps/arc-runner/src/tools/brand.test.ts`
- Modify: `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: Add failing tests**

In `apps/arc-runner/src/tools/brand.test.ts`, add inside `describe("brandTools", ...)`:
```ts
  it("analyze_brand_design posts to the design route and returns the proposal text", async () => {
    const client = {
      apiPost: vi.fn(async () => ({ ok: true, logoUrl: "https://acme.com/logo.png", palette: { primary: "#c8a24b" } })),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    const res = await callHandler(tools["analyze_brand_design"], { url: "https://acme.com" });
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/brand/design", { url: "https://acme.com" });
    expect(res.content[0].text).toContain("#c8a24b");
  });

  it("propose_brand_profile forwards brandPalette and fonts", async () => {
    const client = {
      apiPut: vi.fn(async () => ({ ok: true, profile: { displayName: "Acme Co", status: "draft" } })),
    } as unknown as ArcClient;
    const tools = toolsByName(client, () => {});
    await callHandler(tools["propose_brand_profile"], {
      displayName: "Acme Co",
      brandPalette: { primary: "#c8a24b", secondary: "#1b2a4a" },
      headingFont: "Oswald",
      bodyFont: "Inter",
    });
    expect(client.apiPut).toHaveBeenCalledWith(
      "/api/v1/arc/brand/profile",
      expect.objectContaining({
        displayName: "Acme Co",
        brandPalette: { primary: "#c8a24b", secondary: "#1b2a4a" },
        headingFont: "Oswald",
        bodyFont: "Inter",
      }),
    );
  });
```

In `apps/arc-runner/src/tools/index.test.ts`, add `"analyze_brand_design"` to the `DRAFT` array (line 49):
```ts
const DRAFT = ["create_campaign_draft", "generate_image", "generate_video", "analyze_website", "analyze_brand_design", "propose_brand_profile", "attach_media"];
```
and add an exclusion assertion inside the existing `it("ask mode excludes draft work products", ...)`:
```ts
    expect(names).not.toContain("analyze_brand_design");
```

- [ ] **Step 2: Run, verify they fail**

Run: `pnpm --filter arc-runner test src/tools/brand.test.ts src/tools/index.test.ts`
Expected: FAIL — `analyze_brand_design` tool doesn't exist; `propose_brand_profile` doesn't forward `brandPalette`; the `DRAFT` set mismatches act/draft.

- [ ] **Step 3: Add the tool + extend the schema in `brand.ts`**

In `apps/arc-runner/src/tools/brand.ts`:

(a) Add a new tool inside `brandTools`, before the `return [...]`:
```ts
  const analyzeBrandDesign = tool(
    "analyze_brand_design",
    "Fetch a company's public website and detect their visual brand design — best logo candidate, brand colors (as hex), and heading/body fonts. Use when the operator asks you to pull or match their brand look from their site. Read-only and safe. After calling it, pass the palette + fonts (and logoUrl) into propose_brand_profile so the operator can review and activate them.",
    { url: z.string().describe("The company's website URL (http or https).") },
    async (args) =>
      runTool(step, "Reading brand design", () =>
        client.apiPost("/api/v1/arc/brand/design", { url: args.url }),
      ),
  );
```

(b) Extend the `proposeBrandProfile` Zod schema (the object passed as the 3rd arg) with palette + fonts — add these keys alongside the existing ones:
```ts
      brandPalette: z
        .object({
          primary: z.string().optional(),
          secondary: z.string().optional(),
          accent: z.string().optional(),
          dark: z.string().optional(),
          light: z.string().optional(),
        })
        .optional()
        .describe("Brand colors as 6-digit hex (e.g. #C8A24B)."),
      headingFont: z.string().optional().describe("Heading font family name."),
      bodyFont: z.string().optional().describe("Body font family name."),
```

(c) The handler already does `await client.apiPut("/api/v1/arc/brand/profile", { ...args });` — `brandPalette`/`headingFont`/`bodyFont` flow through automatically via the spread. No handler change needed.

(d) Add the new tool to the returned array:
```ts
  return [analyzeWebsite, analyzeBrandDesign, proposeBrandProfile];
```

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm --filter arc-runner test src/tools/brand.test.ts src/tools/index.test.ts`
Expected: PASS (existing brand cases + 2 new; the index tool-surface tests for ask/act/draft/scan all green with `analyze_brand_design` in act+draft only).

- [ ] **Step 5: Typecheck the runner + lint**

Run: `pnpm --filter arc-runner exec tsc --noEmit`
Expected: no errors.
Run: `pnpm exec eslint apps/arc-runner/src/tools/brand.ts apps/arc-runner/src/tools/brand.test.ts apps/arc-runner/src/tools/index.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/arc-runner/src/tools/brand.ts apps/arc-runner/src/tools/brand.test.ts apps/arc-runner/src/tools/index.test.ts
git commit -m "feat(arc): analyze_brand_design tool + palette/fonts in propose_brand_profile"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run all touched app test files together**

Run: `pnpm test src/domain/__tests__/brand-design.test.ts src/lib/brand-kit/brand-image.test.ts src/lib/brand-kit/design-fetch.test.ts src/app/api/v1/arc/brand/design/route.test.ts src/app/api/v1/arc/brand/profile/route.test.ts`
Expected: all PASS.

- [ ] **Step 2: Run the runner test suite**

Run: `pnpm --filter arc-runner test`
Expected: all PASS (the tool-surface contract in `index.test.ts` is the key one — it pins act/draft/ask/scan).

- [ ] **Step 3: Build the app + typecheck the runner**

Run: `pnpm build`
Expected: clean production build.
Run: `pnpm --filter arc-runner exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Sanity-check the operator UI still renders (regression)**

Part 1 only changes extractor internals; the preview/apply card is unchanged. If a dev server is convenient, load `/library/brand` and confirm via `preview_snapshot` that the "Pull brand design from your website" card still renders and `preview_console_logs` shows no errors. (Screenshots hang on the particle canvas — use DOM/snapshot checks.) If no server is handy, the build + the unchanged Task-5 UI component (from PR #248) is sufficient evidence.

- [ ] **Step 5: Final commit (if any verification fixups)**

```bash
git add -A
git commit -m "test(brand): verify heuristics + Arc design tool end to end"
```

---

## Self-Review Notes (reconciled against the spec)

- **Spec coverage:** Part 1 — dedupe (Task 2), dark/light-from-neutrals (Task 2), 8-digit hex + `!important` (Task 1), prominence tiebreaker (Task 1) ✓. Part 2 — shared `storeBrandImageFromUrl` + actions refactor (Task 3), `POST /brand/design` route (Task 4), extended `PUT /brand/profile` with palette/fonts + image store + nodejs runtime (Task 5), `analyze_brand_design` tool + extended `propose_brand_profile` + `index.test.ts` surface (Task 6) ✓. Arc-never-activates invariant preserved (Task 5 keeps the `409` active guard + forced `status:"draft"`; no UI/activation change).
- **Type consistency:** `BrandDesignColor` gains optional `count` (Task 1) used by the Task 1 sort and never breaks existing `{hex,source}` fixtures; `storeBrandImageFromUrl` signature is identical to the deleted inline `storeBrandImage` (Task 3), consumed by both `actions.ts` (Task 3) and the profile route (Task 5); the design route returns the `BrandDesignProposal` shape (Task 4) the runner tool forwards (Task 6).
- **Known gotchas surfaced:** runner package needs its own `pnpm --filter arc-runner install`/test/tsc; `index.test.ts` pins the per-mode tool set (Task 6 updates `DRAFT` + the ask-exclusion); lint ≠ typecheck; particle pages hang screenshots (DOM checks only). No schema/migration change (palette column already exists).
- **No silent behavior change to the operator path:** Task 3 is a pure extraction refactor (helper signature identical); the apply action's logic is untouched.
