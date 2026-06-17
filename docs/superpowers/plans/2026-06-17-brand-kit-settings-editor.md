# Brand Kit Settings Editor + Identity Migration — Implementation Plan (Plan 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. NOTE: this repo's Next.js 16 differs from training data ("NOT the Next.js you know") — implementers MUST read the actual current files named in each task before editing, and consult `node_modules/next/dist/docs/` if unsure about a Next API. Follow `DESIGN.md` and reuse `src/app/_components/page-header.tsx` primitives.

**Goal:** Give operators a Settings "Brand Kit" editor that reads/writes the per-org `business_profiles` record (the same one Arc already consumes), and make the app's brand identity (workspace name, logo, favicon, short mark) render from that record instead of the global `app_settings` store — without regressing BSR's current branding.

**Architecture:** A new wired Settings section (`requireOperator()` + `isSupabaseAdminConfigured()` gate → `upsertBusinessProfile` → `revalidatePath`, following the `app-settings-actions.ts` idiom). The root layout reads the current org's `business_profiles` for identity (falling back to `app_settings`/defaults). The existing Branding section is slimmed to the app-level fields that stay in `app_settings`. A one-time script copies BSR's existing `app_settings` branding into its `business_profiles` row.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Vitest, pnpm.

**Source spec:** `docs/superpowers/specs/2026-06-16-business-profile-brand-kit-design.md` (§5). Builds on Plan 1 (`getBusinessProfile`/`upsertBusinessProfile`, `BusinessProfile`, `validateBusinessProfile`, `INDUSTRY_TEMPLATES`, `applyIndustryTemplate`, `NEUTRAL_DEFAULTS`).

**Approved scope (2026-06-17):**
- IN: Brand Kit editor (business_profiles identity + voice + services + guardrails + proof), render-path identity migration, BSR data migration.
- DEFERRED (flagged): per-org appearance/theming (accent/density/motion stay in the global Appearance section; free-hex custom color is a separate effort); persona-definition editing (→ Plan 3b); the onboarding wizard (→ Plan 3b).

---

## File Structure

| File | Change |
|------|--------|
| `src/lib/brand-kit/form.ts` (create) | Pure-ish mapper `buildBusinessProfileFromForm(formData, current)` → `BusinessProfile`; unit-tested |
| `src/lib/brand-kit/__tests__/form.test.ts` (create) | Tests for the mapper |
| `src/app/settings/brand-kit-actions.ts` (create) | `"use server"` `saveBrandKitAction` + `applyTemplateAction` (gate → upsert → revalidate) |
| `src/app/settings/brand-kit-settings.tsx` (create) | Server component: loads profile, renders the form |
| `src/app/settings/brand-kit-form.tsx` (create) | Client form (`useActionState`), identity/voice/services/guardrails/proof fields, logo upload, template prefill |
| `src/app/settings/settings-sections.ts` (modify) | Register the `brand-kit` section |
| `src/app/settings/page.tsx` (modify) | Render the new panel for `brand-kit` |
| `src/app/settings/settings-nav.tsx` | (auto — driven by registry; verify it picks up the new section) |
| `src/app/settings/branding-settings.tsx` + `settings-forms.tsx` + `app-settings-actions.ts` (modify) | Slim the Branding section: drop migrated identity fields (workspace name, logo, favicon, short mark); keep product label, assistant name, workspace profile |
| `src/app/layout.tsx` (modify) | Read org `business_profiles` identity; pass to metadata + ConsoleFrame with fallback |
| `scripts/migrate-bsr-branding.mjs` (create) + `package.json` | One-time: copy BSR `app_settings` branding → `business_profiles` |

No DB migration (all columns exist from Plan 1).

---

## Task 1: Pure form→profile mapper (TDD)

**Files:** `src/lib/brand-kit/form.ts`, `src/lib/brand-kit/__tests__/form.test.ts`

A small unit so the action stays thin and the mapping is tested. It merges submitted form fields over a `current` profile (so unspecified fields are preserved) and coerces list fields (services, phrases, service areas) from newline/comma-separated textareas.

- [ ] **Step 1: Write the failing test** — create `src/lib/brand-kit/__tests__/form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NEUTRAL_DEFAULTS } from "@/domain";
import { buildBusinessProfileFromForm, splitLines } from "../form";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("splitLines", () => {
  it("splits on newlines, trims, drops blanks", () => {
    expect(splitLines("Repairs\n  Maintenance \n\nInspections")).toEqual([
      "Repairs",
      "Maintenance",
      "Inspections",
    ]);
  });
  it("returns [] for empty input", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("   ")).toEqual([]);
  });
});

describe("buildBusinessProfileFromForm", () => {
  it("maps fields over the current profile and coerces lists", () => {
    const profile = buildBusinessProfileFromForm(
      fd({
        displayName: "Acme Co",
        tagline: "We fix things",
        industry: "professional_services",
        websiteUrl: "https://acme.test",
        tone: "professional",
        services: "Consulting\nAdvisory",
        bannedPhrases: "we guarantee\nrisk-free",
        complianceNotes: "Stay truthful.",
        status: "active",
      }),
      NEUTRAL_DEFAULTS,
    );
    expect(profile.displayName).toBe("Acme Co");
    expect(profile.tagline).toBe("We fix things");
    expect(profile.services).toEqual(["Consulting", "Advisory"]);
    expect(profile.bannedPhrases).toEqual(["we guarantee", "risk-free"]);
    expect(profile.guardrails.complianceNotes).toBe("Stay truthful.");
    expect(profile.status).toBe("active");
    // preserved from current where not provided:
    expect(profile.accent).toBe(NEUTRAL_DEFAULTS.accent);
  });

  it("treats blank optional text fields as null, not empty string", () => {
    const profile = buildBusinessProfileFromForm(fd({ displayName: "Acme", tagline: "" }), NEUTRAL_DEFAULTS);
    expect(profile.tagline).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `pnpm test src/lib/brand-kit/__tests__/form.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/brand-kit/form.ts`:**

```ts
import { NEUTRAL_DEFAULTS, type BusinessProfile, type ProofPoint } from "@/domain";

/** Split a textarea value into a trimmed, blank-free string list. */
export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function nullable(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v.length > 0 ? v : null;
}

/**
 * Merge submitted Brand Kit form fields over the org's current profile, so
 * fields not present in the form (e.g. appearance, personas) are preserved.
 * List fields come from newline-separated textareas.
 */
export function buildBusinessProfileFromForm(
  formData: FormData,
  current: BusinessProfile,
): BusinessProfile {
  const proofPoints: ProofPoint[] = splitLines(str(formData, "proofPoints")).map((label) => ({
    kind: "stat",
    label,
  }));
  const logoUpload = str(formData, "logoUpload");
  const logoUrl = str(formData, "logoUrl");
  return {
    ...current,
    displayName: str(formData, "displayName") || current.displayName,
    legalName: nullable(formData, "legalName"),
    tagline: nullable(formData, "tagline"),
    description: nullable(formData, "description"),
    industry: nullable(formData, "industry"),
    websiteUrl: nullable(formData, "websiteUrl"),
    logoUrl: logoUpload || logoUrl || null,
    faviconUrl: nullable(formData, "faviconUrl"),
    shortMark: nullable(formData, "shortMark"),
    serviceAreas: splitLines(str(formData, "serviceAreas")),
    tone: str(formData, "tone") || current.tone || NEUTRAL_DEFAULTS.tone,
    voiceGuidance: nullable(formData, "voiceGuidance"),
    preferredPhrases: splitLines(str(formData, "preferredPhrases")),
    bannedPhrases: splitLines(str(formData, "bannedPhrases")),
    services: splitLines(str(formData, "services")),
    proofPoints,
    guardrails: {
      disallowedClaims: splitLines(str(formData, "disallowedClaims")),
      complianceNotes: str(formData, "complianceNotes") || current.guardrails.complianceNotes,
    },
    status: formData.get("status") === "active" ? "active" : current.status,
  };
}
```

- [ ] **Step 4: Run** `pnpm test src/lib/brand-kit/__tests__/form.test.ts` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/brand-kit/form.ts src/lib/brand-kit/__tests__/form.test.ts
git commit -m "feat(brand-kit): pure form->BusinessProfile mapper"
```

---

## Task 2: Brand Kit server actions

**Files:** `src/app/settings/brand-kit-actions.ts`

- [ ] **Step 1: Read** `src/app/settings/app-settings-actions.ts` to match the exact action idiom (imports, `SettingsActionState` type, `NOT_CONFIGURED`, `requireOperator()`, `revalidatePath` calls).

- [ ] **Step 2: Create `src/app/settings/brand-kit-actions.ts`:**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { validateBusinessProfile, applyIndustryTemplate, type BusinessProfile } from "@/domain";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { buildBusinessProfileFromForm } from "@/lib/brand-kit/form";

export type BrandKitActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: BrandKitActionState = {
  ok: false,
  message: "Supabase isn't configured, so the Brand Kit can't be saved.",
};

async function loadCurrent(orgId: string): Promise<BusinessProfile> {
  const existing = await getBusinessProfile(orgId);
  if (existing) return existing;
  const { NEUTRAL_DEFAULTS } = await import("@/domain");
  return NEUTRAL_DEFAULTS;
}

export async function saveBrandKitAction(
  _previous: BrandKitActionState,
  formData: FormData,
): Promise<BrandKitActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const current = await loadCurrent(orgId);
  const profile = buildBusinessProfileFromForm(formData, current);

  const validation = validateBusinessProfile(profile);
  if (!validation.ok) {
    return { ok: false, message: `Please fix: ${validation.errors.join(", ")}.` };
  }

  try {
    await upsertBusinessProfile(orgId, profile);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't save the Brand Kit." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/arc");
  return { ok: true, message: "Brand Kit saved." };
}
```

(`applyIndustryTemplate` import is used by the form for client-side prefill via a server round-trip is NOT needed — the form prefills client-side from a serialized template list passed by the server component. So remove the `applyIndustryTemplate` import here if unused to keep eslint clean.)

- [ ] **Step 3: Verify** `npx tsc --noEmit` (expect clean — the form module from Task 1 exists) and `npx eslint src/app/settings/brand-kit-actions.ts` (remove any unused import it flags).
- [ ] **Step 4: Commit**
```bash
git add src/app/settings/brand-kit-actions.ts
git commit -m "feat(brand-kit): saveBrandKitAction (operator-gated, org-scoped)"
```

---

## Task 3: Brand Kit Settings UI (section + server component + client form)

**Files:** `src/app/settings/brand-kit-settings.tsx`, `src/app/settings/brand-kit-form.tsx`, `src/app/settings/settings-sections.ts`, `src/app/settings/page.tsx`

- [ ] **Step 1: Read** `src/app/settings/settings-sections.ts`, `src/app/settings/page.tsx`, `src/app/settings/branding-settings.tsx`, and `src/app/settings/settings-forms.tsx` (the `BrandingSettingsForm` + `Feedback` component + logo upload handler) to mirror the established patterns exactly.

- [ ] **Step 2: Register the section.** In `settings-sections.ts`, add a `brand-kit` entry (id, label "Brand Kit", description) — place it right after `branding` (or replace `branding`'s prominence per Task 5). Match the existing `SETTINGS_SECTIONS` object shape.

- [ ] **Step 3: Create the server component `src/app/settings/brand-kit-settings.tsx`:**
  - `async` server component. Resolve `orgId` only if `isSupabaseAdminConfigured()`; load `profile = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS`.
  - Pass **only serializable props** to the client form (the resolved profile fields + a serialized `INDUSTRY_TEMPLATES` summary `[{id,label}]` for the prefill dropdown). DO NOT pass functions (see the repo's known RSC crash: Server Components cannot pass function props to Client Components).
  - Wrap in `<SettingsSection>` (read how `branding-settings.tsx` wraps its form).

- [ ] **Step 4: Create the client form `src/app/settings/brand-kit-form.tsx`** (`"use client"`):
  - `const [state, action, pending] = useActionState(saveBrandKitAction, null)`.
  - `<form action={action} className="grid gap-5">` with named inputs matching Task 1's mapper keys: `displayName`, `legalName`, `tagline`, `description`, `industry`, `websiteUrl`, `faviconUrl`, `shortMark`, `serviceAreas` (textarea), `tone`, `voiceGuidance` (textarea), `preferredPhrases` (textarea), `bannedPhrases` (textarea), `services` (textarea), `disallowedClaims` (textarea), `complianceNotes` (textarea), `proofPoints` (textarea), and a hidden `status` (default the current value).
  - Logo upload: reuse the exact pattern from `settings-forms.tsx` `BrandingSettingsForm` — file input → FileReader data URL (≤550KB, image/*) → hidden `logoUpload`; plus a `logoUrl` text input; show a small live `<img>` preview.
  - Industry template prefill: a `<select>` of the passed `[{id,label}]`; on change, set the form fields' state from a client-side copy of the template's profile (pass a serialized `INDUSTRY_TEMPLATES` map of `{id: {tone, services}}` from the server component, OR call `applyIndustryTemplate` — but that's a domain fn; safest is to import `applyIndustryTemplate` directly in the client component since `@/domain` is pure and client-safe). Prefill only empty fields; don't clobber typed values.
  - Render `pending` on the submit `<Button>`; render `state.message` via the same `Feedback` pattern used in `settings-forms.tsx`.
  - Follow DESIGN.md: use `Panel`/`Button` primitives, no emojis, helper text ≤74ch, group fields into labeled subsections (Identity / Voice / Services / Guardrails / Proof).

- [ ] **Step 5: Wire the panel.** In `page.tsx`, add the `brand-kit` key to the panels map rendering `<BrandKitSettings />`.

- [ ] **Step 6: Verify**
  - `npx tsc --noEmit` → clean.
  - `npx eslint <the new files>` → clean.
  - `pnpm build` → **must succeed** (catches RSC violations like passing a function prop to a client component — a known crash class in this repo). Report the build result.

- [ ] **Step 7: Commit**
```bash
git add src/app/settings/brand-kit-settings.tsx src/app/settings/brand-kit-form.tsx src/app/settings/settings-sections.ts src/app/settings/page.tsx
git commit -m "feat(brand-kit): Settings Brand Kit editor (identity, voice, services, guardrails, proof)"
```

---

## Task 4: Slim the existing Branding section

**Files:** `src/app/settings/settings-forms.tsx`, `src/app/settings/branding-settings.tsx`, `src/app/settings/app-settings-actions.ts`

The old Branding section wrote workspace name, logo, favicon, short mark to `app_settings`. Those identity fields now live in `business_profiles` (Tasks 3 + 5). Remove them from the Branding section to avoid two conflicting editors; keep the app-level fields that stay in `app_settings`: `product_label`, `assistant_name`, `workspace_profile`.

- [ ] **Step 1: Read** all three files and the `saveBrandingSettingsAction` + `BrandingSettingsForm` in full.

- [ ] **Step 2: In `BrandingSettingsForm`** (`settings-forms.tsx`): remove the workspace name, logo upload/url, favicon, and short-mark fields and their local state/handlers. Keep product label, assistant name, workspace profile. Rename the section heading to "Workspace & product" (in `settings-sections.ts` label + `branding-settings.tsx`). Keep the component name or rename to `WorkspaceSettingsForm` consistently.

- [ ] **Step 3: In `saveBrandingSettingsAction`** (`app-settings-actions.ts`): remove the `workspace_name`, `brand_logo_url`, `brand_favicon_url`, `brand_short_name` writes (and their normalizers if now unused). Keep `product_label`, `assistant_name`, `workspace_profile`. Leave `revalidatePath` calls.

- [ ] **Step 4: Verify** `npx tsc --noEmit` clean (fix any now-unused imports/vars), `npx eslint` clean on the three files, `pnpm build` succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/app/settings/settings-forms.tsx src/app/settings/branding-settings.tsx src/app/settings/app-settings-actions.ts src/app/settings/settings-sections.ts
git commit -m "refactor(settings): slim Branding to app-level fields; identity moves to Brand Kit"
```

---

## Task 5: Repoint the render path to org identity

**Files:** `src/app/layout.tsx` (and `src/app/_components/console-frame.tsx` only if its `brand` prop shape needs a field)

- [ ] **Step 1: Read** `src/app/layout.tsx` (the `getAppSettings()` call + how `brand`/metadata/`data-*` are built) and `src/app/_components/console-frame.tsx` (the `brand` prop usage).

- [ ] **Step 2: In `layout.tsx`**, after the existing `getAppSettings()` call, additionally resolve the org identity from `business_profiles` (guarded), e.g.:
```ts
import { getBusinessProfile } from "@/lib/brand-kit/persistence";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

// inside the layout, after settings:
let identity: { displayName?: string; logoUrl?: string | null; faviconUrl?: string | null; shortMark?: string | null } = {};
if (isSupabaseAdminConfigured()) {
  try {
    const profile = await getBusinessProfile(await getCurrentOrgId());
    if (profile) {
      identity = {
        displayName: profile.displayName || undefined,
        logoUrl: profile.logoUrl,
        faviconUrl: profile.faviconUrl,
        shortMark: profile.shortMark,
      };
    }
  } catch {
    /* fall back to app_settings below */
  }
}
```
Then build the `brand`/metadata using `identity.displayName ?? settings.workspaceName`, `identity.logoUrl ?? settings.brandLogoUrl`, `identity.faviconUrl ?? settings.brandFaviconUrl`, `identity.shortMark ?? settings.brandShortName`. Keep `productLabel`, `assistantName`, and the `data-accent`/`data-density`/`data-motion` attributes reading from `settings` exactly as today (appearance stays global per scope).

- [ ] **Step 3:** If `getBusinessProfile`'s circuit-breaker/Supabase-down path can throw, ensure the `try/catch` keeps the page rendering on fallback (the repo already converts Supabase-down to fast AbortError; the catch above is the safety net — see the known "supabase unreachable = slow loads" behavior; do not add long retries).

- [ ] **Step 4: Verify** `npx tsc --noEmit` clean, `npx eslint src/app/layout.tsx` clean, `pnpm build` succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/app/layout.tsx src/app/_components/console-frame.tsx
git commit -m "feat(brand-kit): render brand identity from per-org business profile (fallback to app_settings)"
```

---

## Task 6: BSR branding data migration

**Files:** `scripts/migrate-bsr-branding.mjs`, `package.json`

Prod's BSR `business_profiles` row (seeded in Plan 1) has `display_name` but no logo/favicon/short_mark — those live in `app_settings`. Copy them so the render-path switch (Task 5) doesn't blank BSR's logo in prod.

- [ ] **Step 1: Read** `scripts/seed-bsr-brand-kit.mjs` for the env/client bootstrap; reuse it.

- [ ] **Step 2: Create `scripts/migrate-bsr-branding.mjs`** using the same bootstrap, then:
  - Look up the BSR org id (slug `big-shoulders-restoration`).
  - Read `app_settings` rows for keys `workspace_name`, `brand_logo_url`, `brand_favicon_url`, `brand_short_name` (select key,value; build a map).
  - `upsert` into `business_profiles` (onConflict `org_id`) ONLY the identity fields that are present/non-empty: `display_name` (from workspace_name, if set), `logo_url`, `favicon_url`, `short_mark`. Do not overwrite existing non-empty business_profiles values with empty ones (read current row first; only fill blanks).
  - Log what was copied. Upsert-only; no deletes.

- [ ] **Step 3:** Add `"migrate:bsr-branding": "node scripts/migrate-bsr-branding.mjs"` to `package.json` scripts.

- [ ] **Step 4: Verify** `node --check scripts/migrate-bsr-branding.mjs`; `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`.

- [ ] **Step 5: Commit**
```bash
git add scripts/migrate-bsr-branding.mjs package.json
git commit -m "feat(brand-kit): one-time BSR branding -> business_profiles migration script"
```

> **Operator step (post-merge, prod):** run `pnpm migrate:bsr-branding` (env pointed at prod) BEFORE/at the same time as the deploy goes live, so BSR's logo/name keep rendering. (A SQL equivalent can be provided at merge time.) Until then, BSR falls back to `app_settings` values via Task 5's fallback, so there is no hard regression — but run it to keep identity authoritative in `business_profiles`.

---

## Task 7: Full verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `pnpm test` → full suite green.
- [ ] **Step 3:** `npx eslint` on every file this plan created/modified → clean.
- [ ] **Step 4:** `pnpm build` → succeeds (RSC/type safety across the new Settings + layout changes).
- [ ] **Step 5:** `node --check scripts/migrate-bsr-branding.mjs` → valid.
- [ ] **Step 6:** Manual smoke (document, don't automate): with Supabase unconfigured locally, `/settings` still renders (Brand Kit form shows `NEUTRAL_DEFAULTS`), and the app shell renders fallback branding — confirming graceful degradation.
- [ ] **Step 7: Commit** any fixups.

---

## Done criteria for Plan 3a
- A wired "Brand Kit" Settings section reads/writes the org `business_profiles` (identity, voice, services, guardrails, proof) via an operator-gated, org-scoped action; includes industry-template prefill and logo upload.
- The app shell + page title + favicon render brand identity from `business_profiles` (fallback to `app_settings`/defaults).
- The old Branding section is slimmed to app-level fields; no duplicate identity editors.
- A `migrate:bsr-branding` script copies BSR's existing branding into `business_profiles`.
- `pnpm test`, `tsc`, eslint, and `pnpm build` all pass.

**Deferred (Plan 3b / later):** onboarding wizard; persona-definition editing; per-org appearance/theming + free-hex custom accent; Arc-refinement of the kit.

**Operator follow-up:** run `pnpm migrate:bsr-branding` against prod after merge.
