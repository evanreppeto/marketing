# Proper Page-Title System — Design

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** Make the browser tab title brand-correct and contextual: default **"Arc"**, **"{Workspace} · Arc"** when signed in, and **"{Section} · Arc"** per page — replacing today's single inherited `"{workspace} | Marketing"` title that's identical on every route.

## Problem

`generateMetadata()` in `src/app/layout.tsx` sets one title for the whole app: `` `${identity.displayName ?? workspaceName} | ${productLabel}` ``. `productLabel` defaults to `"Marketing"`, so the tab reads "Big Shoulders Restoration | Marketing" everywhere, and "Arc | Marketing" signed-out (since `workspaceName` defaults to "Arc"). No route sets its own title, so the tab never reflects the current page, and the product brand ("Arc", already the `assistantName`) doesn't appear.

## Decisions (confirmed)

- **Brand token = `assistantName`** (default `"Arc"`, operator-configurable) — the tab follows if the agent is ever renamed.
- **Include dynamic titles** for the two highest-value dynamic routes (campaign detail, CRM record); all other routes get static section titles.

## What exists (reuse)

- Root `generateMetadata` (`src/app/layout.tsx:117`): has `getAppSettings()` (→ `assistantName`, `workspaceName`, `productLabel`, favicon) and `resolveBrandIdentity()` (→ `displayName` when a real workspace identity exists, else null).
- Next.js App Router `Metadata.title` supports `{ default, template }` and per-route `export const metadata` / `generateMetadata`.
- Top-level routes (from `console-frame` nav): `/`, `/arc`, `/campaigns`, `/crm`, `/opportunities`, `/activity`, `/analytics`, `/usage`, `/brain`, `/personas`, `/gallery`, `/library` (+ `/library/brand`), `/outbox`, `/board`, `/settings`; auth/onboarding: `/login`, `/sign-in`, `/sign-up`, `/forgot-password`, `/onboarding`.

## Architecture

### a. Root title template (`src/app/layout.tsx` `generateMetadata`)
```ts
const { assistantName /* default "Arc" */, ... } = await getAppSettings();
const identity = await resolveBrandIdentity();
const brand = assistantName || "Arc";
const signedIn = Boolean(identity.displayName);
return {
  title: {
    default: signedIn ? `${identity.displayName} · ${brand}` : brand,
    template: `%s · ${brand}`,
  },
  // …description + icons unchanged
};
```
- Signed out → **`Arc`**; signed in → **`Big Shoulders Restoration · Arc`**; any page with its own title → **`%s · Arc`**.
- A small pure helper `buildAppTitle({ brand, workspaceDisplayName })` in `src/lib/branding/page-title.ts` returns the `{default, template}` object — unit-testable without Next internals.

### b. Per-page static titles
Add `export const metadata = { title: "<Section>" }` to each top-level route's `page.tsx` (the template appends `· Arc`):
| Route | title | Route | title |
|---|---|---|---|
| `/` | (omit → workspace default) | `/brain` | `Brain` |
| `/arc` | `Chat` | `/personas` | `Personas` |
| `/campaigns` | `Campaigns` | `/gallery` | `Gallery` |
| `/crm` | `CRM` | `/library` | `Library` |
| `/opportunities` | `Opportunities` | `/library/brand` | `Brand` |
| `/activity` | `Activity` | `/outbox` | `Outbox` |
| `/analytics` | `Analytics` | `/board` | `Board` |
| `/usage` | `Usage` | `/settings` | `Settings` |
| `/onboarding` | `Set up` | `/login`,`/sign-in` | `Sign in` |
| `/sign-up` | `Create account` | `/forgot-password` | `Reset password` |

- `/` (Home) intentionally has **no** page title so it shows the workspace default ("{Workspace} · Arc") — the "home" tab is the workspace identity.
- `/arc` uses **`Chat`** (not "Arc") to avoid "Arc · Arc".
- Routes not listed simply inherit the workspace default — acceptable, nothing breaks.
- **Constraint:** a route that has only a client `page.tsx` (`"use client"`) cannot `export const metadata`. For those, add the title via the nearest `layout.tsx` (create a minimal one if absent) or a server wrapper. Audited per route during planning; most app pages are server components.

### c. Dynamic titles (2 routes)
- `/campaigns/[campaignId]` → `generateMetadata` using the campaign name → `"Spring Flood Push · Arc"`; fall back to `"Campaign · Arc"` if not found.
- CRM record route `/crm/[object]/[recordId]` → record/company/contact name → `"Northside Plumbing · Arc"`; fall back to the object label. Reuse the existing record read-model; never throw (fall back on any error).

## Testing

- **`buildAppTitle`** (pure): signed-in → `{default:"X · Arc", template:"%s · Arc"}`; signed-out → `{default:"Arc", template:"%s · Arc"}`; custom brand (assistantName="Nova") → uses "Nova".
- **Dynamic `generateMetadata`**: returns the entity name when found; falls back (and never throws) when missing/unconfigured. (Mock the read-model.)
- Static `export const metadata` titles are compile-time — covered by `pnpm build`.

## Safety & scope

- Cosmetic/metadata only; no data, routing, or auth behavior changes. No new deps.
- Graceful: unknown routes inherit the workspace default; dynamic lookups fall back, never throw.
- Reversible; respects operator-configured `assistantName`.

## Out of scope

- Favicon / brand-mark changes (the sidebar already uses the Arc mark; favicon handled separately if wanted).
- Renaming the `productLabel` setting or other branding surfaces.
- `og:title`/social metadata (can layer on the same `brand` token later).
- Per-page titles for deep/rare subroutes beyond the two dynamic ones above (they inherit the default gracefully).
