# Brand Kit Foundation — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the per-org Business Profile ("Brand Kit") data layer — schema (dual-written to legacy + v2), pure domain logic (neutral defaults, industry templates, Arc-context assembly), a persistence/read-model layer, and a one-time seed of the existing BSR org — with no UI and no Arc rewiring yet.

**Architecture:** `src/domain/brand-kit.ts` holds pure, industry-agnostic logic (types, `NEUTRAL_DEFAULTS`, `INDUSTRY_TEMPLATES`, `assembleArcContext`) and is unit-tested. `src/lib/brand-kit/` wraps Supabase I/O (org-scoped via `getCurrentOrgId()`, guarded by `isSupabaseAdminConfigured()`). A new timestamped migration in `supabase/migrations/` plus an edit to the `supabase/v2` baseline create `business_profiles` and `persona_definitions`. The persona enum is **not** touched (see spec §3.3).

**Tech Stack:** Next.js 16 / React 19, TypeScript, Supabase (Postgres), Vitest, pnpm. Path alias `@/*` → `./src/*`. Tests live in `src/domain/__tests__/`.

**Source spec:** `docs/superpowers/specs/2026-06-16-business-profile-brand-kit-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260616140000_brand_kit_foundation.sql` (create) | Legacy migration: `business_profiles` + `persona_definitions` (no enum change) |
| `supabase/v2/migrations/20260612160000_v2_baseline.sql` (modify) | Add `business_profiles` to the clean baseline (it already has `persona_definitions`) |
| `src/domain/brand-kit.ts` (create) | Pure types, `NEUTRAL_DEFAULTS`, `NEUTRAL_PERSONAS`, validation, `parseBusinessProfile`, `INDUSTRY_TEMPLATES`, `getIndustryTemplate`, `assembleArcContext` |
| `src/domain/__tests__/brand-kit.test.ts` (create) | Unit tests for everything in `brand-kit.ts` |
| `src/domain/index.ts` (modify) | Re-export `./brand-kit` |
| `src/lib/brand-kit/persistence.ts` (create) | `getBusinessProfile`, `upsertBusinessProfile`, `listPersonaDefinitions` (org-scoped, guarded) |
| `src/lib/brand-kit/read-model.ts` (create) | `getBusinessContext(orgId)` assembling the Arc bundle, with neutral fallback |
| `scripts/seed-bsr-brand-kit.mjs` (create) | One-time seed of the existing BSR org's profile + persona rows |
| `package.json` (modify) | Add `seed:brand-kit-bsr` script |

---

## Task 1: Legacy migration — `business_profiles` + `persona_definitions`

**Files:**
- Create: `supabase/migrations/20260616140000_brand_kit_foundation.sql`

This migration is SQL, not unit-testable via Vitest. Verification is review + (for the operator) manual apply against the prod DB. The app degrades gracefully if it is not yet applied.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260616140000_brand_kit_foundation.sql` with exactly this content:

```sql
-- Brand Kit foundation: per-org business profile + persona definitions.
-- Industry-agnostic. Does NOT relax the persona_mapping enum (see spec §3.3);
-- arbitrary per-org persona keys arrive with the v2 baseline cutover.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  display_name text not null default '',
  legal_name text,
  tagline text,
  description text,
  industry text,
  website_url text,
  logo_url text,
  favicon_url text,
  short_mark text,
  service_areas jsonb not null default '[]'::jsonb,
  time_zone text,
  accent text not null default '#C8A24B',
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  motion text not null default 'standard' check (motion in ('standard', 'reduced')),
  tone text not null default 'balanced',
  voice_guidance text,
  preferred_phrases jsonb not null default '[]'::jsonb,
  banned_phrases jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  proof_points jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- Mirrors the v2 baseline persona_definitions shape. On legacy/prod these rows
-- describe the existing 12 enum persona keys; the enum itself is unchanged.
create table if not exists public.persona_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  audience_type text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create trigger persona_definitions_set_updated_at
  before update on public.persona_definitions
  for each row execute function public.set_updated_at();

-- Isolation is enforced in the app layer via the service-role client (which
-- bypasses RLS). Enable RLS as defense-in-depth and grant the app role.
alter table public.business_profiles enable row level security;
alter table public.persona_definitions enable row level security;

grant select, insert, update, delete on public.business_profiles to service_role;
grant select, insert, update, delete on public.persona_definitions to service_role;
```

- [ ] **Step 2: Verify it parses and matches conventions**

Run: `grep -c "create table" supabase/migrations/20260616140000_brand_kit_foundation.sql`
Expected: `2`

Open `supabase/migrations/20260612120000_crm_tenancy_and_interactions.sql` and confirm this new file uses the same `set_updated_at` trigger style and `service_role` grant style. There must be **no** `alter type ... persona_mapping`, no `alter column persona`, and no `drop type` anywhere in the file:

Run: `grep -ni "persona_mapping\|drop type\|alter column persona" supabase/migrations/20260616140000_brand_kit_foundation.sql`
Expected: no output (the enum is intentionally untouched).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260616140000_brand_kit_foundation.sql
git commit -m "feat(brand-kit): add business_profiles + persona_definitions migration (legacy)"
```

---

## Task 2: Add `business_profiles` to the v2 baseline

**Files:**
- Modify: `supabase/v2/migrations/20260612160000_v2_baseline.sql`

The v2 baseline already defines `persona_definitions` (around line 148). We only add `business_profiles`, matching v2 conventions (`default public.default_organization_id()` for `org_id`, `set_updated_at` trigger).

- [ ] **Step 1: Add the table definition**

In `supabase/v2/migrations/20260612160000_v2_baseline.sql`, immediately after the `persona_definitions` block ends (after its `create trigger persona_definitions_set_updated_at ... execute function public.set_updated_at();` statement, before the `-- ---------- CRM core ----------` comment), insert:

```sql
-- ---------- Brand Kit ----------

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.default_organization_id() references public.organizations(id) on delete cascade,
  display_name text not null default '',
  legal_name text,
  tagline text,
  description text,
  industry text,
  website_url text,
  logo_url text,
  favicon_url text,
  short_mark text,
  service_areas jsonb not null default '[]'::jsonb,
  time_zone text,
  accent text not null default '#C8A24B',
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  motion text not null default 'standard' check (motion in ('standard', 'reduced')),
  tone text not null default 'balanced',
  voice_guidance text,
  preferred_phrases jsonb not null default '[]'::jsonb,
  banned_phrases jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  proof_points jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Register the table in the baseline's table list**

Find the array of table-name string literals near line 798 (the block that lists `'persona_definitions', 'companies', 'contacts', ...`). Add `'business_profiles',` immediately after the `'persona_definitions',` entry so the baseline's RLS/grant loop covers it.

- [ ] **Step 3: Verify**

Run: `grep -c "business_profiles" supabase/v2/migrations/20260612160000_v2_baseline.sql`
Expected: at least `3` (table def, trigger, list entry).

- [ ] **Step 4: Commit**

```bash
git add supabase/v2/migrations/20260612160000_v2_baseline.sql
git commit -m "feat(brand-kit): add business_profiles to v2 baseline"
```

---

## Task 3: Domain types + neutral defaults

**Files:**
- Create: `src/domain/brand-kit.ts`
- Test: `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/brand-kit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  type BusinessProfile,
} from "@/domain/brand-kit";

describe("NEUTRAL_DEFAULTS", () => {
  it("is industry-agnostic: no services, no restoration assumptions, draft status", () => {
    expect(NEUTRAL_DEFAULTS.services).toEqual([]);
    expect(NEUTRAL_DEFAULTS.status).toBe("draft");
    expect(NEUTRAL_DEFAULTS.density).toBe("comfortable");
    expect(NEUTRAL_DEFAULTS.motion).toBe("standard");
    const serialized = JSON.stringify(NEUTRAL_DEFAULTS).toLowerCase();
    expect(serialized).not.toContain("restoration");
    expect(serialized).not.toContain("water");
  });

  it("ships universally-safe guardrails only", () => {
    expect(NEUTRAL_DEFAULTS.guardrails.disallowedClaims.length).toBeGreaterThan(0);
    const claims = NEUTRAL_DEFAULTS.guardrails.disallowedClaims.join(" ").toLowerCase();
    expect(claims).not.toContain("insurance");
  });

  it("provides generic starter personas", () => {
    const keys = NEUTRAL_PERSONAS.map((p) => p.key);
    expect(keys).toContain("decision_maker");
    expect(NEUTRAL_PERSONAS.every((p) => p.label.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: FAIL — cannot resolve `@/domain/brand-kit`.

- [ ] **Step 3: Write the types + neutral defaults**

Create `src/domain/brand-kit.ts`:

```ts
/**
 * Brand Kit — pure, industry-agnostic business-identity logic. No I/O.
 * Persistence lives in `src/lib/brand-kit/`. This module owns the shape of a
 * business profile, the neutral defaults a brand-new org starts from, the
 * quick-start industry templates, and the assembly of the Arc context bundle.
 */

export type DensityOption = "comfortable" | "compact";
export type MotionOption = "standard" | "reduced";
export type ProfileStatus = "draft" | "active";

export type ProofPoint = {
  kind: "testimonial" | "certification" | "stat";
  label: string;
  detail?: string;
};

export type BrandKitGuardrails = {
  /** Human-readable labels of claim types the business must not make. */
  disallowedClaims: string[];
  /** Free-form compliance guidance shown to Arc and reviewers. */
  complianceNotes: string;
};

export type PersonaDefinition = {
  key: string;
  label: string;
  audienceType: string;
  sortOrder: number;
  isActive: boolean;
  metadata: {
    description?: string;
    recommendedCta?: string;
    messageAngle?: string;
    proofPoints?: string[];
  };
};

export type BusinessProfile = {
  displayName: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  industry: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  shortMark: string | null;
  serviceAreas: string[];
  timeZone: string | null;
  accent: string;
  density: DensityOption;
  motion: MotionOption;
  tone: string;
  voiceGuidance: string | null;
  preferredPhrases: string[];
  bannedPhrases: string[];
  services: string[];
  proofPoints: ProofPoint[];
  guardrails: BrandKitGuardrails;
  status: ProfileStatus;
};

export const NEUTRAL_PERSONAS: PersonaDefinition[] = [
  {
    key: "decision_maker",
    label: "Decision maker",
    audienceType: "customer",
    sortOrder: 0,
    isActive: true,
    metadata: { description: "The person who chooses and pays for the service." },
  },
  {
    key: "referrer",
    label: "Referrer",
    audienceType: "partner",
    sortOrder: 1,
    isActive: true,
    metadata: { description: "Someone positioned to refer business your way." },
  },
  {
    key: "repeat_customer",
    label: "Repeat customer",
    audienceType: "customer",
    sortOrder: 2,
    isActive: true,
    metadata: { description: "An existing customer who may buy again." },
  },
];

export const NEUTRAL_DEFAULTS: BusinessProfile = {
  displayName: "",
  legalName: null,
  tagline: null,
  description: null,
  industry: null,
  websiteUrl: null,
  logoUrl: null,
  faviconUrl: null,
  shortMark: null,
  serviceAreas: [],
  timeZone: null,
  accent: "#C8A24B",
  density: "comfortable",
  motion: "standard",
  tone: "balanced",
  voiceGuidance: null,
  preferredPhrases: [],
  bannedPhrases: [],
  services: [],
  proofPoints: [],
  guardrails: {
    disallowedClaims: [
      "False or unverifiable claims",
      "Misleading pricing or fake urgency",
      "Guarantees of outcomes outside the business's control",
    ],
    complianceNotes:
      "Keep claims truthful and substantiated. Avoid promises the business cannot guarantee.",
  },
  status: "draft",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts
git commit -m "feat(brand-kit): domain types + industry-agnostic neutral defaults"
```

---

## Task 4: `parseBusinessProfile` + `validateBusinessProfile`

**Files:**
- Modify: `src/domain/brand-kit.ts`
- Test: `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/__tests__/brand-kit.test.ts`:

```ts
import { parseBusinessProfile, validateBusinessProfile } from "@/domain/brand-kit";

describe("parseBusinessProfile", () => {
  it("maps a snake_case DB row to a BusinessProfile, applying defaults for nulls", () => {
    const profile = parseBusinessProfile({
      display_name: "Acme Co",
      services: ["consulting"],
      accent: null,
      density: null,
      guardrails: { disallowedClaims: ["x"], complianceNotes: "y" },
      status: "active",
    });
    expect(profile.displayName).toBe("Acme Co");
    expect(profile.services).toEqual(["consulting"]);
    expect(profile.accent).toBe(NEUTRAL_DEFAULTS.accent);
    expect(profile.density).toBe("comfortable");
    expect(profile.guardrails.complianceNotes).toBe("y");
    expect(profile.status).toBe("active");
  });

  it("falls back to neutral defaults when given an empty object", () => {
    const profile = parseBusinessProfile({});
    expect(profile.status).toBe("draft");
    expect(profile.services).toEqual([]);
    expect(profile.guardrails.disallowedClaims).toEqual(
      NEUTRAL_DEFAULTS.guardrails.disallowedClaims,
    );
  });
});

describe("validateBusinessProfile", () => {
  it("rejects an empty display name", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("display_name_required");
  });

  it("rejects a non-hex accent", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "Acme", accent: "blue" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("accent_invalid");
  });

  it("accepts a valid profile", () => {
    const result = validateBusinessProfile({ ...NEUTRAL_DEFAULTS, displayName: "Acme", accent: "#1A2B3C" });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: FAIL — `parseBusinessProfile`/`validateBusinessProfile` not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/brand-kit.ts`:

```ts
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Map a raw `business_profiles` row (snake_case, jsonb) into a BusinessProfile. */
export function parseBusinessProfile(row: Record<string, unknown>): BusinessProfile {
  const guardrailsRaw = (row.guardrails ?? {}) as Record<string, unknown>;
  const density = row.density === "compact" ? "compact" : "comfortable";
  const motion = row.motion === "reduced" ? "reduced" : "standard";
  const status = row.status === "active" ? "active" : "draft";
  return {
    displayName: asString(row.display_name, NEUTRAL_DEFAULTS.displayName),
    legalName: asNullableString(row.legal_name),
    tagline: asNullableString(row.tagline),
    description: asNullableString(row.description),
    industry: asNullableString(row.industry),
    websiteUrl: asNullableString(row.website_url),
    logoUrl: asNullableString(row.logo_url),
    faviconUrl: asNullableString(row.favicon_url),
    shortMark: asNullableString(row.short_mark),
    serviceAreas: asStringArray(row.service_areas),
    timeZone: asNullableString(row.time_zone),
    accent: asString(row.accent, NEUTRAL_DEFAULTS.accent),
    density,
    motion,
    tone: asString(row.tone, NEUTRAL_DEFAULTS.tone),
    voiceGuidance: asNullableString(row.voice_guidance),
    preferredPhrases: asStringArray(row.preferred_phrases),
    bannedPhrases: asStringArray(row.banned_phrases),
    services: asStringArray(row.services),
    proofPoints: Array.isArray(row.proof_points) ? (row.proof_points as ProofPoint[]) : [],
    guardrails: {
      disallowedClaims:
        asStringArray(guardrailsRaw.disallowedClaims).length > 0
          ? asStringArray(guardrailsRaw.disallowedClaims)
          : NEUTRAL_DEFAULTS.guardrails.disallowedClaims,
      complianceNotes: asString(
        guardrailsRaw.complianceNotes,
        NEUTRAL_DEFAULTS.guardrails.complianceNotes,
      ),
    },
    status,
  };
}

export type ProfileValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Validate a BusinessProfile prior to persistence. */
export function validateBusinessProfile(profile: BusinessProfile): ProfileValidationResult {
  const errors: string[] = [];
  if (profile.displayName.trim().length === 0) errors.push("display_name_required");
  if (!HEX_COLOR.test(profile.accent)) errors.push("accent_invalid");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS (all tests including the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts
git commit -m "feat(brand-kit): parse + validate business profile"
```

---

## Task 5: Industry templates (broad quick-start buckets)

**Files:**
- Modify: `src/domain/brand-kit.ts`
- Test: `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/__tests__/brand-kit.test.ts`:

```ts
import { INDUSTRY_TEMPLATES, getIndustryTemplate } from "@/domain/brand-kit";

describe("INDUSTRY_TEMPLATES", () => {
  it("includes broad buckets and a neutral start, all equal citizens", () => {
    const ids = INDUSTRY_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("neutral");
    expect(ids).toContain("home_property_services");
    expect(ids).toContain("professional_services");
    // restoration is NOT a top-level bucket; it is only a flavor under home/property
    expect(ids).not.toContain("restoration");
    expect(INDUSTRY_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it("every non-neutral template pre-fills personas and services", () => {
    for (const tpl of INDUSTRY_TEMPLATES) {
      if (tpl.id === "neutral") continue;
      expect(tpl.personas.length).toBeGreaterThan(0);
      expect(tpl.profile.services && tpl.profile.services.length).toBeGreaterThan(0);
    }
  });

  it("getIndustryTemplate returns the neutral template for an unknown id", () => {
    expect(getIndustryTemplate("does_not_exist").id).toBe("neutral");
    expect(getIndustryTemplate("professional_services").id).toBe("professional_services");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: FAIL — `INDUSTRY_TEMPLATES`/`getIndustryTemplate` not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/brand-kit.ts`:

```ts
export type IndustryTemplate = {
  id: string;
  label: string;
  /** Partial overrides applied on top of NEUTRAL_DEFAULTS. */
  profile: Partial<BusinessProfile>;
  personas: PersonaDefinition[];
};

function persona(
  key: string,
  label: string,
  audienceType: string,
  sortOrder: number,
  description: string,
): PersonaDefinition {
  return { key, label, audienceType, sortOrder, isActive: true, metadata: { description } };
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: "neutral",
    label: "Start neutral / from scratch",
    profile: {},
    personas: NEUTRAL_PERSONAS,
  },
  {
    id: "home_property_services",
    label: "Home & Property Services",
    profile: {
      tone: "reassuring",
      services: ["Repairs", "Maintenance", "Emergency response", "Inspections"],
    },
    personas: [
      persona("homeowner", "Homeowner", "customer", 0, "Owner-occupant needing service at their home."),
      persona("property_manager", "Property manager", "customer", 1, "Manages multiple properties and recurring work."),
      persona("trade_partner", "Trade partner", "partner", 2, "Adjacent trade that can refer overflow work."),
    ],
  },
  {
    id: "professional_services",
    label: "Professional & B2B Services",
    profile: {
      tone: "professional",
      services: ["Consulting", "Advisory", "Managed services", "Project delivery"],
    },
    personas: [
      persona("buyer", "Economic buyer", "customer", 0, "Holds budget authority for the engagement."),
      persona("champion", "Internal champion", "customer", 1, "Advocates for the solution inside the account."),
      persona("referral_partner", "Referral partner", "partner", 2, "Sends qualified introductions."),
    ],
  },
  {
    id: "health_wellness",
    label: "Health & Wellness",
    profile: {
      tone: "warm",
      services: ["Appointments", "Programs", "Memberships", "Consultations"],
    },
    personas: [
      persona("new_patient", "New patient/client", "customer", 0, "First-time visitor evaluating the practice."),
      persona("returning_client", "Returning client", "customer", 1, "Existing client booking again."),
      persona("referring_provider", "Referring provider", "partner", 2, "Provider who refers patients."),
    ],
  },
  {
    id: "retail_ecommerce",
    label: "Retail & E-commerce",
    profile: {
      tone: "friendly",
      services: ["Products", "Collections", "Subscriptions", "Promotions"],
    },
    personas: [
      persona("first_time_shopper", "First-time shopper", "customer", 0, "Has not purchased before."),
      persona("loyal_customer", "Loyal customer", "customer", 1, "Repeat buyer eligible for loyalty offers."),
      persona("cart_abandoner", "Cart abandoner", "customer", 2, "Added to cart but did not check out."),
    ],
  },
  {
    id: "real_estate_property",
    label: "Real Estate & Property",
    profile: {
      tone: "professional",
      services: ["Listings", "Buyer representation", "Leasing", "Property management"],
    },
    personas: [
      persona("seller", "Seller", "customer", 0, "Owner looking to list or sell."),
      persona("buyer", "Buyer", "customer", 1, "Prospective purchaser."),
      persona("investor", "Investor", "customer", 2, "Acquires property for return."),
    ],
  },
  {
    id: "hospitality_local",
    label: "Hospitality & Local",
    profile: {
      tone: "friendly",
      services: ["Reservations", "Events", "Catering", "Local offers"],
    },
    personas: [
      persona("first_time_guest", "First-time guest", "customer", 0, "Trying the venue for the first time."),
      persona("regular", "Regular", "customer", 1, "Frequent visitor."),
      persona("event_planner", "Event planner", "customer", 2, "Books group or private events."),
    ],
  },
];

const NEUTRAL_TEMPLATE = INDUSTRY_TEMPLATES[0];

export function getIndustryTemplate(id: string): IndustryTemplate {
  return INDUSTRY_TEMPLATES.find((t) => t.id === id) ?? NEUTRAL_TEMPLATE;
}

/** Apply a template's partial overrides on top of NEUTRAL_DEFAULTS. */
export function applyIndustryTemplate(id: string): BusinessProfile {
  const tpl = getIndustryTemplate(id);
  return { ...NEUTRAL_DEFAULTS, ...tpl.profile, industry: tpl.id === "neutral" ? null : tpl.id };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts
git commit -m "feat(brand-kit): broad industry quick-start templates"
```

---

## Task 6: `assembleArcContext` — the bundle Arc consumes

**Files:**
- Modify: `src/domain/brand-kit.ts`
- Test: `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/__tests__/brand-kit.test.ts`:

```ts
import { assembleArcContext, type ArcBusinessContext } from "@/domain/brand-kit";

describe("assembleArcContext", () => {
  it("derives the business name and carries voice, services, and guardrails", () => {
    const profile: BusinessProfile = { ...NEUTRAL_DEFAULTS, displayName: "Acme Co", services: ["consulting"], tone: "professional" };
    const ctx: ArcBusinessContext = assembleArcContext(profile, NEUTRAL_PERSONAS);
    expect(ctx.businessName).toBe("Acme Co");
    expect(ctx.services).toEqual(["consulting"]);
    expect(ctx.tone).toBe("professional");
    expect(ctx.guardrails.disallowedClaims.length).toBeGreaterThan(0);
    expect(ctx.personas.map((p) => p.key)).toContain("decision_maker");
  });

  it("uses a safe placeholder name when displayName is blank", () => {
    const ctx = assembleArcContext(NEUTRAL_DEFAULTS, []);
    expect(ctx.businessName).toBe("the business");
    expect(ctx.personas).toEqual([]);
  });

  it("only includes active personas, sorted by sortOrder", () => {
    const personas: PersonaDefinition[] = [
      { key: "b", label: "B", audienceType: "customer", sortOrder: 2, isActive: true, metadata: {} },
      { key: "a", label: "A", audienceType: "customer", sortOrder: 1, isActive: true, metadata: {} },
      { key: "x", label: "X", audienceType: "customer", sortOrder: 0, isActive: false, metadata: {} },
    ];
    const ctx = assembleArcContext({ ...NEUTRAL_DEFAULTS, displayName: "Acme" }, personas);
    expect(ctx.personas.map((p) => p.key)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: FAIL — `assembleArcContext`/`ArcBusinessContext` not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/brand-kit.ts`:

```ts
export type ArcBusinessContext = {
  businessName: string;
  industry: string | null;
  services: string[];
  tone: string;
  voiceGuidance: string | null;
  preferredPhrases: string[];
  bannedPhrases: string[];
  proofPoints: ProofPoint[];
  personas: PersonaDefinition[];
  guardrails: BrandKitGuardrails;
};

/**
 * Assemble the read-only context bundle Arc and the UI consume. Pure: callers
 * pass a profile + persona rows; this never reaches I/O. Inactive personas are
 * dropped and the rest are sorted by sortOrder.
 */
export function assembleArcContext(
  profile: BusinessProfile,
  personas: PersonaDefinition[],
): ArcBusinessContext {
  const businessName = profile.displayName.trim().length > 0 ? profile.displayName.trim() : "the business";
  return {
    businessName,
    industry: profile.industry,
    services: profile.services,
    tone: profile.tone,
    voiceGuidance: profile.voiceGuidance,
    preferredPhrases: profile.preferredPhrases,
    bannedPhrases: profile.bannedPhrases,
    proofPoints: profile.proofPoints,
    personas: personas.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    guardrails: profile.guardrails,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts
git commit -m "feat(brand-kit): assemble Arc business-context bundle"
```

---

## Task 7: Re-export from the domain barrel

**Files:**
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Add the export**

In `src/domain/index.ts`, add this line after the existing `export * from "./campaign-performance";` line (keep alphabetical-ish grouping is not required; just append):

```ts
export * from "./brand-kit";
```

- [ ] **Step 2: Verify the barrel import resolves**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS (unchanged — confirms no circular/duplicate export breakage).

Run: `npx tsc --noEmit`
Expected: no new errors referencing `brand-kit` or `src/domain/index.ts`. (Note: `pnpm lint` does NOT typecheck — always run `tsc`/`pnpm build`.)

- [ ] **Step 3: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat(brand-kit): export brand-kit from domain barrel"
```

---

## Task 8: Persistence layer

**Files:**
- Create: `src/lib/brand-kit/persistence.ts`

This is I/O — guarded by `isSupabaseAdminConfigured()`, scoped by `org_id`. It follows the vault/campaigns reference shape (see `src/lib/vault/persistence.ts`). No Vitest unit test (no Supabase in CI); verification is `tsc`. The pure mapping it depends on (`parseBusinessProfile`) is already tested in Task 4.

- [ ] **Step 1: Implement**

Create `src/lib/brand-kit/persistence.ts`:

```ts
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import {
  parseBusinessProfile,
  type BusinessProfile,
  type PersonaDefinition,
} from "@/domain";

/** Read the Brand Kit for an org, or null if none exists / Supabase unconfigured. */
export async function getBusinessProfile(orgId: string): Promise<BusinessProfile | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) throw new Error(`Failed to read business profile: ${error.message}`);
  return data ? parseBusinessProfile(data) : null;
}

/** Insert or update the Brand Kit for an org. Returns the persisted profile. */
export async function upsertBusinessProfile(
  orgId: string,
  profile: BusinessProfile,
): Promise<BusinessProfile> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase is not configured; cannot persist business profile.");
  }
  const supabase = getSupabaseAdminClient();
  const row = {
    org_id: orgId,
    display_name: profile.displayName,
    legal_name: profile.legalName,
    tagline: profile.tagline,
    description: profile.description,
    industry: profile.industry,
    website_url: profile.websiteUrl,
    logo_url: profile.logoUrl,
    favicon_url: profile.faviconUrl,
    short_mark: profile.shortMark,
    service_areas: profile.serviceAreas,
    time_zone: profile.timeZone,
    accent: profile.accent,
    density: profile.density,
    motion: profile.motion,
    tone: profile.tone,
    voice_guidance: profile.voiceGuidance,
    preferred_phrases: profile.preferredPhrases,
    banned_phrases: profile.bannedPhrases,
    services: profile.services,
    proof_points: profile.proofPoints,
    guardrails: profile.guardrails,
    status: profile.status,
  };
  const { data, error } = await supabase
    .from("business_profiles")
    .upsert(row, { onConflict: "org_id" })
    .select("*")
    .single<Record<string, unknown>>();
  if (error) throw new Error(`Failed to upsert business profile: ${error.message}`);
  return parseBusinessProfile(data);
}

/** List a org's persona definitions, sorted by sort_order. Empty if unconfigured. */
export async function listPersonaDefinitions(orgId: string): Promise<PersonaDefinition[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("persona_definitions")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to list persona definitions: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    key: String(r.key),
    label: String(r.label),
    audienceType: String(r.audience_type ?? "customer"),
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    isActive: r.is_active !== false,
    metadata: (r.metadata ?? {}) as PersonaDefinition["metadata"],
  }));
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/brand-kit/persistence.ts`. If Supabase generated types (`database.types.ts`) don't yet know the new tables, the `.from("business_profiles")` calls may error — see Task 11 (regenerate types). If you hit that error now, proceed to Task 11 first, then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brand-kit/persistence.ts
git commit -m "feat(brand-kit): persistence layer for profile + personas"
```

---

## Task 9: Read-model — `getBusinessContext`

**Files:**
- Create: `src/lib/brand-kit/read-model.ts`

- [ ] **Step 1: Implement**

Create `src/lib/brand-kit/read-model.ts`:

```ts
import {
  assembleArcContext,
  NEUTRAL_DEFAULTS,
  NEUTRAL_PERSONAS,
  type ArcBusinessContext,
} from "@/domain";
import { getBusinessProfile, listPersonaDefinitions } from "./persistence";

/**
 * Assemble the Arc business-context bundle for an org. Falls back to neutral
 * defaults when no profile exists or Supabase is unconfigured, so Arc and the
 * UI always receive a usable, industry-agnostic context (graceful degradation).
 */
export async function getBusinessContext(orgId: string): Promise<ArcBusinessContext> {
  const profile = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
  const personas = await listPersonaDefinitions(orgId);
  return assembleArcContext(profile, personas.length > 0 ? personas : NEUTRAL_PERSONAS);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/brand-kit/read-model.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brand-kit/read-model.ts
git commit -m "feat(brand-kit): getBusinessContext read-model with neutral fallback"
```

---

## Task 10: One-time BSR seed script

**Files:**
- Create: `scripts/seed-bsr-brand-kit.mjs`
- Modify: `package.json`

This seeds the **existing** BSR org's `business_profiles` + `persona_definitions` with today's hardcoded values so prod behavior is preserved when Plan 2 rewires Arc. Restoration lives only here as data, not in `src/`.

- [ ] **Step 1: Read the existing seed bootstrap to match conventions**

Open `scripts/seed-arc-demo.mjs` and note its top section: how it loads env vars (Supabase URL + service role key) and constructs the `@supabase/supabase-js` client. Reuse that exact bootstrap.

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-bsr-brand-kit.mjs`. Use the same env/client bootstrap as `seed-arc-demo.mjs` (Supabase URL from `NEXT_PUBLIC_SUPABASE_URL`, key from `SUPABASE_SERVICE_ROLE_KEY`), then:

```js
// ... after constructing `supabase` admin client identically to seed-arc-demo.mjs ...

const ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? "big-shoulders-restoration";

const { data: org, error: orgErr } = await supabase
  .from("organizations")
  .select("id")
  .eq("slug", ORG_SLUG)
  .maybeSingle();
if (orgErr) throw orgErr;
if (!org) throw new Error(`Org not found for slug ${ORG_SLUG}`);

const profile = {
  org_id: org.id,
  display_name: "Big Shoulders Restoration",
  industry: "home_property_services",
  tone: "reassuring",
  services: ["Water mitigation", "Documentation", "Rebuild coordination"],
  guardrails: {
    disallowedClaims: [
      "Insurance outcome promise",
      "Claim approval promise",
      "Guaranteed insurance result",
      "Unsupported guarantee",
    ],
    complianceNotes:
      "Coverage-neutral language required. No claim approval or payout promises.",
  },
  status: "active",
  onboarding_completed_at: new Date().toISOString(),
};

const { error: upErr } = await supabase
  .from("business_profiles")
  .upsert(profile, { onConflict: "org_id" });
if (upErr) throw upErr;

const personas = [
  ["persona_homeowner_emergency", "Homeowner — Emergency", "customer", 0],
  ["persona_homeowner_preventative", "Homeowner — Preventative", "customer", 1],
  ["persona_homeowner_rebuild", "Homeowner — Rebuild", "customer", 2],
  ["persona_landlord", "Landlord", "customer", 3],
  ["persona_hoa_board", "HOA Board", "customer", 4],
  ["persona_property_manager", "Property Manager", "customer", 5],
  ["persona_insurance_agent", "Insurance Agent", "partner", 6],
  ["persona_listing_agent", "Listing Agent", "partner", 7],
  ["persona_buyers_agent", "Buyer's Agent", "partner", 8],
  ["persona_plumbing_partner", "Plumbing Partner", "partner", 9],
  ["persona_hvac_roof_electrical_partner", "HVAC/Roof/Electrical Partner", "partner", 10],
  ["persona_gc_remodeler_partner", "GC / Remodeler Partner", "partner", 11],
].map(([key, label, audience_type, sort_order]) => ({
  org_id: org.id,
  key,
  label,
  audience_type,
  sort_order,
  is_active: true,
  metadata: {},
}));

const { error: pErr } = await supabase
  .from("persona_definitions")
  .upsert(personas, { onConflict: "org_id,key" });
if (pErr) throw pErr;

console.log(`Seeded Brand Kit + ${personas.length} personas for ${ORG_SLUG}`);
```

- [ ] **Step 3: Register the npm script**

In `package.json`, add to `scripts` (after `"seed:brain"`):

```json
"seed:brand-kit-bsr": "node scripts/seed-bsr-brand-kit.mjs",
```

- [ ] **Step 4: Verify the script is syntactically valid**

Run: `node --check scripts/seed-bsr-brand-kit.mjs`
Expected: no output (valid). (Running it for real requires prod Supabase env vars and is an operator step, not part of CI.)

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-bsr-brand-kit.mjs package.json
git commit -m "feat(brand-kit): one-time BSR brand-kit seed script"
```

---

## Task 11: Regenerate Supabase types + full verification

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (generated)

The persistence layer types `.from("business_profiles")`/`.from("persona_definitions")` against the generated `database.types.ts`. After the migration exists, regenerate so the new tables are known.

- [ ] **Step 1: Regenerate types**

The repo's V2 README step 4 references regenerating `src/lib/supabase/database.types.ts`. Use the project's existing generation method. If a script exists:

Run: `grep -n "gen.*types\|database.types" package.json`

If a `db:types` (or similar) script exists, run it. Otherwise, generate via the Supabase CLI against the project that has these tables applied:

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: file updates to include `business_profiles` and `persona_definitions`.

If you cannot apply the migration to a reachable DB in this environment, add the two table types to `database.types.ts` by hand to match the migration columns (so `tsc` passes), and note in the commit that a full regen is pending an operator apply.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full domain test suite**

Run: `pnpm test src/domain/__tests__/brand-kit.test.ts`
Expected: PASS.

Run: `pnpm test`
Expected: the full suite passes (no regressions from the new export).

- [ ] **Step 4: Lint only the files this plan touched**

(`pnpm lint` scans vendored/generated files and reports ~31k pre-existing problems — scope to changed files.)

Run: `npx eslint src/domain/brand-kit.ts src/lib/brand-kit/persistence.ts src/lib/brand-kit/read-model.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(brand-kit): regenerate supabase types for brand-kit tables"
```

---

## Done criteria for Plan 1

- `business_profiles` + `persona_definitions` exist in both the legacy migration and the v2 baseline; the persona enum is untouched.
- `src/domain/brand-kit.ts` is fully unit-tested (neutral defaults, parse, validate, templates, context assembly) and exported via `@/domain`.
- `src/lib/brand-kit/{persistence,read-model}.ts` compile and follow the guarded, org-scoped reference shape.
- A `seed:brand-kit-bsr` script can populate the existing BSR org so prod won't regress when Plan 2 rewires Arc.
- `pnpm test`, `npx tsc --noEmit`, and scoped `eslint` all pass.

**Next:** Plan 2 (Arc business-context wiring) consumes `getBusinessContext` to de-restoration `draft-engine.ts`, `guardrails.ts`, the orchestrators, and the `RESTORATION_FOCUS` consumers.
