# Proper Page-Title System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab title reads **"Arc"** by default, **"{Workspace} · Arc"** signed in, and **"{Section} · Arc"** per page (dynamic entity names on campaign + CRM-record detail).

**Architecture:** A pure `buildAppTitle()` helper drives the root `{default, template}` title; each top-level route (all server components) adds `export const metadata = { title: "<Section>" }`; campaign + CRM-record detail routes add `generateMetadata` using the entity name with safe fallbacks.

**Tech Stack:** Next.js 16 App Router metadata, TypeScript, Vitest.

**Test command:** `pnpm test <path>`.

**Verified facts:**
- Root `generateMetadata` at `src/app/layout.tsx:117` uses `getAppSettings()` (exposes `assistantName`, default `"Arc"`) + `resolveBrandIdentity()` (`displayName` set only for a real signed-in workspace, else null/undefined).
- **All top-level route `page.tsx` files are server components** → `export const metadata` works directly (no layout workaround needed).
- Dynamic routes: `src/app/campaigns/[campaignId]/page.tsx`; `src/app/crm/{companies,contacts,jobs,leads,outcomes,properties}/[recordId]/page.tsx`. **Next 16: route `params` is a `Promise` — `await` it.**
- `Metadata.title` supports `{ default, template }`; per-route string titles render through the parent template.

---

## File Structure
- `src/lib/branding/page-title.ts` (create) + `page-title.test.ts`
- `src/app/layout.tsx` (modify — use the helper)
- ~18 top-level `page.tsx` (add `export const metadata`)
- `campaigns/[campaignId]/page.tsx` + 6 `crm/*/[recordId]/page.tsx` (add `generateMetadata`)

---

## Task 1: `buildAppTitle` helper + wire into root layout

**Files:** Create `src/lib/branding/page-title.ts` + `page-title.test.ts`; modify `src/app/layout.tsx`.

- [ ] **Step 1: Test** (`page-title.test.ts`)
```typescript
import { describe, expect, it } from "vitest";
import { buildAppTitle } from "./page-title";

describe("buildAppTitle", () => {
  it("signed out → default is just the brand", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: null }))
      .toEqual({ default: "Arc", template: "%s · Arc" });
  });
  it("signed in → default is '{workspace} · brand'", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: "Big Shoulders Restoration" }))
      .toEqual({ default: "Big Shoulders Restoration · Arc", template: "%s · Arc" });
  });
  it("respects a custom brand (renamed assistant)", () => {
    expect(buildAppTitle({ brand: "Nova", workspaceDisplayName: null }))
      .toEqual({ default: "Nova", template: "%s · Nova" });
  });
  it("treats blank workspace name as signed-out", () => {
    expect(buildAppTitle({ brand: "Arc", workspaceDisplayName: "  " }).default).toBe("Arc");
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `page-title.ts`
```typescript
import type { Metadata } from "next";

/** Build the app's title {default, template}. Default is "{workspace} · {brand}"
 *  when a real workspace identity exists, else just the brand. Pure. */
export function buildAppTitle(input: { brand: string; workspaceDisplayName: string | null | undefined }): Required<Pick<Metadata, "title">>["title"] {
  const brand = input.brand.trim() || "Arc";
  const workspace = input.workspaceDisplayName?.trim();
  return {
    default: workspace ? `${workspace} · ${brand}` : brand,
    template: `%s · ${brand}`,
  };
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Wire into `src/app/layout.tsx` `generateMetadata`** — replace the `title:` line:
```typescript
import { buildAppTitle } from "@/lib/branding/page-title";
// …inside generateMetadata, after getAppSettings()+resolveBrandIdentity():
const { assistantName } = settings; // ensure assistantName is destructured from getAppSettings()
return {
  title: buildAppTitle({ brand: assistantName, workspaceDisplayName: identity.displayName }),
  description: "Campaign planning, approvals, CRM, and performance workspace for service businesses.",
  icons: { icon: resolvedFavicon, apple: resolvedFavicon },
};
```
(Keep `resolvedFavicon` as-is. `assistantName` comes from `getAppSettings()`; add it to the destructure on line ~118.)
- [ ] **Step 6: `pnpm test src/lib/branding/page-title.test.ts` → PASS; `npx tsc --noEmit` clean.**
- [ ] **Step 7: Commit** — `git add src/lib/branding src/app/layout.tsx && git commit -m "feat(branding): brand-aware app title template (default Arc, workspace-aware)"`

---

## Task 2: Static per-page titles

**Files:** add `export const metadata = { title: "<Section>" };` to each route's `page.tsx`. (Server components — add the export near the top, after imports. Import `type { Metadata } from "next"` and type it `export const metadata: Metadata = { title: "<Section>" };` for clarity.)

- [ ] **Step 1: Apply titles** per this mapping:
  - `arc` → `"Chat"`; `campaigns` → `"Campaigns"`; `crm` → `"CRM"`; `opportunities` → `"Opportunities"`; `activity` → `"Activity"`; `analytics` → `"Analytics"`; `usage` → `"Usage"`; `brain` → `"Brain"`; `personas` → `"Personas"`; `gallery` → `"Gallery"`; `library` → `"Library"`; `library/brand` → `"Brand"`; `outbox` → `"Outbox"`; `board` → `"Board"`; `settings` → `"Settings"`; `onboarding` → `"Set up"`; `login` & `sign-in` → `"Sign in"`; `sign-up` → `"Create account"`; `forgot-password` → `"Reset password"`.
  - **Do NOT add a title to `src/app/page.tsx` (`/`)** — Home intentionally shows the workspace default ("{Workspace} · Arc").
  - If any listed `page.tsx` already `export const metadata` (e.g. has a description), MERGE the `title` into the existing object rather than duplicating the export.
  - If a page unexpectedly starts with `"use client"` (the audit found none, but verify per file), add the title via a sibling `layout.tsx` instead (`export const metadata = { title: "<Section>" }`).
- [ ] **Step 2: `npx tsc --noEmit` clean** (static titles are compile-checked; no unit test needed).
- [ ] **Step 3: Commit** — `git add src/app && git commit -m "feat(branding): per-page tab titles across top-level routes"`

---

## Task 3: Dynamic titles (campaign + CRM records)

**Files:** `src/app/campaigns/[campaignId]/page.tsx`; `src/app/crm/{companies,contacts,jobs,leads,outcomes,properties}/[recordId]/page.tsx`.

- [ ] **Step 1: For each dynamic page, read its existing data fetch** (how it loads the campaign / record by id and what field holds the display name — e.g. campaign `name`, company `name`, contact `full_name`/`name`). Reuse that exact read-model call in `generateMetadata`.
- [ ] **Step 2: Add `generateMetadata`** to each, following this pattern (adapt the fetch + name field + the params type to each page; `params` is a Promise in Next 16):
```typescript
import type { Metadata } from "next";
export async function generateMetadata({ params }: { params: Promise<{ campaignId: string }> }): Promise<Metadata> {
  try {
    const { campaignId } = await params;
    const campaign = await /* existing campaign-by-id read-model */(campaignId);
    return { title: campaign?.name?.trim() || "Campaign" };
  } catch {
    return { title: "Campaign" };
  }
}
```
- CRM record pages: same shape with `{ recordId }`, the object's read-model, and the per-object fallback label (`"Company"`, `"Contact"`, `"Job"`, `"Lead"`, `"Outcome"`, `"Property"`). Never throw — always return a fallback title.
- The parent template makes these render as `"Spring Flood Push · Arc"`, `"Northside Plumbing · Arc"`, etc.
- [ ] **Step 3: Add a focused test** for one representative dynamic route (mock the read-model): returns the entity name when found; returns the fallback when the fetch returns null or throws. (`campaigns/[campaignId]/route`-style test, or a colocated test importing `generateMetadata`.)
- [ ] **Step 4: `npx tsc --noEmit` clean; run the dynamic test → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/campaigns src/app/crm && git commit -m "feat(branding): dynamic tab titles for campaign + CRM record detail"`

---

## Task 4: Build + verify

- [ ] **Step 1:** `pnpm test src/lib/branding` (+ the dynamic test) → pass.
- [ ] **Step 2:** `pnpm build` → succeeds (`pnpm install` first if deps missing — note `cytoscape-fcose` etc. require a fresh install). The build compiles all `metadata`/`generateMetadata` exports; a typo in any title surfaces here.
- [ ] **Step 3 (optional preview):** if a dev server can run, load a couple routes and confirm `document.title` (e.g. `/crm` → "CRM · Arc", signed-out root → "Arc"). Locally `/`-shell pages may hang on unreachable Supabase; the build + unit tests are the gate.
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "fix(branding): page-title verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** root template+helper → T1; static per-page titles for all listed routes → T2; dynamic campaign+CRM-record titles → T3; build/verify → T4. Matches the spec's decisions (brand = `assistantName`; include dynamic for campaign + CRM record).
- **Placeholder scan:** none. T3 Step 1 is an explicit "read the page's existing fetch and reuse it" instruction (the read-model call varies per route); the generateMetadata shape + fallback is fully specified.
- **Type consistency:** `buildAppTitle({brand, workspaceDisplayName})` returns Next's `title` union; root layout passes `assistantName` + `identity.displayName`. Static titles are `Metadata` objects; dynamic ones return `Promise<Metadata>` with `params` awaited (Next 16).
- **Correctness:** `/` deliberately omitted (workspace default); `/arc` titled "Chat" to avoid "Arc · Arc"; blank workspace name treated as signed-out (tested). All target pages confirmed server components.
- **Safety:** cosmetic/metadata only; dynamic lookups never throw (try/catch + fallback); no new deps; reversible.
