# Per-Org Persona Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lead-ingestion persona validation read each organization's own persona set (from the `persona_definitions` table) instead of a hardcoded enum + code constant, and give operators a Settings surface to manage their org's personas — the first productization slice.

**Architecture:** The V2 baseline SQL drops the `persona_mapping` enum so persona columns become free text. The pure domain validator gains an injected `allowedKeys` parameter (defaulting to the retained BSR seed list for backward compatibility). A new `src/lib/personas/` read-model + persistence layer does the org-scoped I/O the domain can't, the ingest route feeds the org's keys into validation, and a minimal Settings → Personas panel manages the rows. Broad list-consumers (CRM forms, Hermes contracts) deliberately stay on the BSR default this slice.

**Tech Stack:** Supabase Postgres (SQL migration), Next.js 16 server components + server actions, `@supabase/supabase-js`, TypeScript, Vitest, Zod.

**Reference spec:** `docs/superpowers/specs/2026-06-12-per-org-persona-taxonomy-design.md`

**Conventions to follow:**
- Layering: `src/domain/` (pure, no I/O) → `src/lib/<feature>/` (I/O) → `src/app/` (views + actions).
- Persistence/read-model pattern: see `src/lib/interactions/{persistence,read-model}.ts`. Guard with `isSupabaseAdminConfigured()`, scope every query by `org_id` from `getCurrentOrgId()`.
- Server-action pattern: see `src/app/settings/app-settings-actions.ts` (`"use server"`, `requireOperator()`, `isSupabaseAdminConfigured()`, `revalidatePath`, return `{ ok, message }`).
- Run lint scoped to changed files only: `pnpm exec eslint <paths>` (the full `pnpm lint` reports ~31k pre-existing vendor problems).
- `pnpm lint` does NOT typecheck. Use `pnpm build` (or `pnpm exec tsc --noEmit`) to catch type errors.

---

## Task 1: Drop the `persona_mapping` enum from the V2 baseline

The V2 baseline SQL is not yet applied to any database, so the enum is removed at the source rather than migrated. Every `persona` column becomes `text`; the BSR personas remain as seed rows.

**Files:**
- Modify: `supabase/v2/migrations/20260612160000_v2_baseline.sql`

- [ ] **Step 1: Remove the enum type definition**

Delete this block (the `create type public.persona_mapping as enum (...)` statement spanning the twelve personas plus `unassigned_persona`):

```sql
create type public.persona_mapping as enum (
  'persona_homeowner_emergency',
  'persona_homeowner_preventative',
  'persona_homeowner_rebuild',
  'persona_landlord',
  'persona_hoa_board',
  'persona_property_manager',
  'persona_insurance_agent',
  'persona_listing_agent',
  'persona_buyers_agent',
  'persona_plumbing_partner',
  'persona_hvac_roof_electrical_partner',
  'persona_gc_remodeler_partner',
  'unassigned_persona'
);
```

- [ ] **Step 2: Change the persona columns that default to unassigned**

Replace every occurrence of this exact column definition (it appears for `companies`, `contacts`, `properties`, `campaigns`, `jobs`, `outcomes`):

```sql
  persona public.persona_mapping not null default 'unassigned_persona',
```

with:

```sql
  persona text not null default 'unassigned_persona',
```

(Use a replace-all — all six are identical.)

- [ ] **Step 3: Change the non-defaulted persona columns**

Replace every occurrence of this exact line (it appears for `leads`, `persona_snapshots`, `persona_knowledge_entries`):

```sql
  persona public.persona_mapping not null,
```

with:

```sql
  persona text not null,
```

- [ ] **Step 4: Change the persona_definitions key column**

Replace:

```sql
  key public.persona_mapping not null,
```

with:

```sql
  key text not null,
```

- [ ] **Step 5: Drop the hardcoded audience_type check**

In the `persona_definitions` table, replace:

```sql
  audience_type text not null check (audience_type in ('homeowner', 'property', 'insurance', 'real_estate', 'trade_partner')),
```

with:

```sql
  audience_type text not null,
```

- [ ] **Step 6: Verify no enum references remain**

Run:

```powershell
Select-String -Path supabase/v2/migrations/20260612160000_v2_baseline.sql -Pattern "persona_mapping"
```

Expected: **no matches**. (The `leads_persona_not_unassigned_check` constraint and the BSR persona seed `insert` remain untouched — they operate on text and are still valid.)

- [ ] **Step 7: Commit**

```powershell
git add supabase/v2/migrations/20260612160000_v2_baseline.sql
git commit -m "feat(personas): make persona columns text in v2 baseline (drop enum)"
```

---

## Task 2: Inject the allowed set into the domain validator

The domain stops being the validation *authority* while keeping the BSR list as a default. `validateLeadIngestionPersona` gains an `allowedKeys` parameter; the success type loosens to `string` because an org's persona may not be one of the twelve.

**Files:**
- Modify: `src/domain/personas.ts`
- Test: `src/domain/__tests__/personas.test.ts`

- [ ] **Step 1: Write the failing tests for injected sets**

Append this block to `src/domain/__tests__/personas.test.ts` (inside the file, after the existing `describe`):

```typescript
import { isAllowedPersona } from "../personas";

describe("injected allowed persona sets", () => {
  const orgKeys = ["persona_wedding_lead", "persona_corporate_event"] as const;

  it("accepts a persona in the org's set", () => {
    expect(validateLeadIngestionPersona("persona_wedding_lead", orgKeys)).toEqual({
      ok: true,
      persona: "persona_wedding_lead",
    });
    expect(isAllowedPersona("persona_wedding_lead", orgKeys)).toBe(true);
  });

  it("rejects a persona not in the org's set, even an official BSR one", () => {
    expect(validateLeadIngestionPersona("persona_plumbing_partner", orgKeys)).toEqual({
      ok: false,
      code: "persona_unknown",
      message: "Unknown persona tag: persona_plumbing_partner",
    });
    expect(isAllowedPersona("persona_plumbing_partner", orgKeys)).toBe(false);
  });

  it("still rejects the internal unassigned sentinel regardless of set", () => {
    expect(validateLeadIngestionPersona("unassigned_persona", orgKeys)).toEqual({
      ok: false,
      code: "persona_internal_only",
      message: "unassigned_persona is internal-only and cannot ingest new leads.",
    });
  });

  it("falls back to the BSR default set when allowedKeys is omitted", () => {
    expect(validateLeadIngestionPersona("persona_plumbing_partner")).toEqual({
      ok: true,
      persona: "persona_plumbing_partner",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
pnpm test src/domain/__tests__/personas.test.ts
```

Expected: FAIL — `isAllowedPersona` is not exported and `validateLeadIngestionPersona` ignores the second argument.

- [ ] **Step 3: Update the domain module**

In `src/domain/personas.ts`:

(a) Change the doc intent of the constant by replacing the first line:

```typescript
export const OFFICIAL_PERSONA_MAPPINGS = [
```

with:

```typescript
/**
 * BSR default/seed persona taxonomy. This is the product's *default* set and the
 * fallback for callers that have not been made org-aware — it is NOT the global
 * validation authority. Per-org validity comes from `persona_definitions` rows
 * loaded via `src/lib/personas/read-model.ts`.
 */
export const OFFICIAL_PERSONA_MAPPINGS = [
```

(b) Loosen the success branch of the result type. Replace:

```typescript
export type PersonaValidationResult =
  | {
      ok: true;
      persona: LeadIngestionPersonaMapping;
    }
```

with:

```typescript
export type PersonaValidationResult =
  | {
      ok: true;
      persona: string;
    }
```

(c) Add an injected-set membership helper immediately after the existing `isAllowedForLeadIngestion` function:

```typescript
export function isAllowedPersona(
  persona: unknown,
  allowedKeys: readonly string[],
): persona is string {
  return typeof persona === "string" && allowedKeys.includes(persona);
}
```

(d) Replace the whole `validateLeadIngestionPersona` function with this injected version (same checks and order; the unknown check now tests `allowedKeys`):

```typescript
export function validateLeadIngestionPersona(
  persona: unknown,
  allowedKeys: readonly string[] = OFFICIAL_PERSONA_MAPPINGS,
): PersonaValidationResult {
  if (persona == null || persona === "") {
    return {
      ok: false,
      code: "persona_required",
      message: "Lead ingestion requires a verified operational persona tag.",
    };
  }

  if (isInternalPersonaFallback(persona)) {
    return {
      ok: false,
      code: "persona_internal_only",
      message: "unassigned_persona is internal-only and cannot ingest new leads.",
    };
  }

  if (typeof persona !== "string") {
    return {
      ok: false,
      code: "persona_invalid_type",
      message: "Persona tag must be a string literal.",
    };
  }

  if (!allowedKeys.includes(persona)) {
    return {
      ok: false,
      code: "persona_unknown",
      message: `Unknown persona tag: ${persona}`,
    };
  }

  return {
    ok: true,
    persona,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
pnpm test src/domain/__tests__/personas.test.ts
```

Expected: PASS (both the original cases and the new injected-set cases).

- [ ] **Step 5: Confirm `isAllowedPersona` is exported through the domain barrel**

`src/domain/index.ts` re-exports `./personas` with `export *`. Confirm by running:

```powershell
Select-String -Path src/domain/index.ts -Pattern "personas"
```

Expected: a `export * from "./personas"` (or equivalent) line is present — no change needed. If personas are re-exported by name instead of `*`, add `isAllowedPersona` to that list.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/personas.ts src/domain/__tests__/personas.test.ts
git commit -m "feat(personas): inject allowed set into lead-ingestion validator"
```

---

## Task 3: Thread the allowed set through `parseLeadIngestionPayload`

`parseLeadIngestionPayload` gains a third, backward-compatible parameter so the route can pass the org's persona keys. Existing one- and two-argument callers are unaffected.

**Files:**
- Modify: `src/domain/lead-ingestion.ts`
- Test: `src/domain/__tests__/lead-ingestion.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/__tests__/lead-ingestion.test.ts`:

```typescript
describe("parseLeadIngestionPayload with an org persona set", () => {
  const basePayload = {
    persona: "persona_wedding_lead",
    source: "website",
    lossSignals: ["ceremony tent flooded"],
    contact: { firstName: "Dana", email: "dana@example.com" },
  };

  it("accepts a persona that is in the provided org set", () => {
    const result = parseLeadIngestionPayload(basePayload, undefined, [
      "persona_wedding_lead",
      "persona_corporate_event",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.persona).toBe("persona_wedding_lead");
  });

  it("rejects a persona that is not in the provided org set", () => {
    const result = parseLeadIngestionPayload(basePayload, undefined, ["persona_corporate_event"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(400);
      expect(result.errors[0]).toMatchObject({ code: "persona_unknown", path: ["persona"] });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
pnpm test src/domain/__tests__/lead-ingestion.test.ts
```

Expected: FAIL — the third argument is ignored, so `persona_wedding_lead` is rejected as unknown against the default BSR set.

- [ ] **Step 3: Add the parameter and pass it through**

In `src/domain/lead-ingestion.ts`:

(a) Add `OFFICIAL_PERSONA_MAPPINGS` to the personas import. Replace:

```typescript
import { validateLeadIngestionPersona } from "./personas";
```

with:

```typescript
import { OFFICIAL_PERSONA_MAPPINGS, validateLeadIngestionPersona } from "./personas";
```

(b) Add the third parameter to the function signature. Replace:

```typescript
export function parseLeadIngestionPayload(
  payload: unknown,
  calculatedAt?: Date | string,
): LeadIngestionResult {
```

with:

```typescript
export function parseLeadIngestionPayload(
  payload: unknown,
  calculatedAt?: Date | string,
  allowedPersonaKeys: readonly string[] = OFFICIAL_PERSONA_MAPPINGS,
): LeadIngestionResult {
```

(c) Pass it to the validator. Replace:

```typescript
  const persona = validateLeadIngestionPersona(parsed.data.persona);
```

with:

```typescript
  const persona = validateLeadIngestionPersona(parsed.data.persona, allowedPersonaKeys);
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
pnpm test src/domain/__tests__/lead-ingestion.test.ts
```

Expected: PASS. The existing lead-ingestion tests (which call with one or two args) still pass via the default.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/lead-ingestion.ts src/domain/__tests__/lead-ingestion.test.ts
git commit -m "feat(personas): accept per-org persona keys in lead parse"
```

---

## Task 4: Persona read-model (`src/lib/personas/read-model.ts`)

Org-scoped reads for the allowed set (ingestion) and the full rows (management UI). The client helper is typed as the plain `SupabaseClient` (no `Database` generic) so it compiles against `persona_definitions.key` even though the committed generated types still type that column as the old enum union. Regenerate `database.types.ts` after the V2 schema is applied to a project.

**Files:**
- Create: `src/lib/personas/read-model.ts`
- Test: `src/lib/personas/read-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/personas/read-model.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getOrgPersonaKeys, listOrgPersonas } from "./read-model";

const ORG = "00000000-0000-0000-0000-000000000001";

describe("getOrgPersonaKeys", () => {
  it("returns active persona keys scoped by org", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: {
        data: [{ key: "persona_wedding_lead" }, { key: "persona_corporate_event" }],
        error: null,
      },
    });

    const keys = await getOrgPersonaKeys(ORG, supabase);
    expect(keys).toEqual(["persona_wedding_lead", "persona_corporate_event"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", ORG]);
    expect(supabase.calls).toContainEqual(["eq", "is_active", true]);
  });

  it("throws on a query error", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: { data: null, error: { message: "boom" } },
    });
    await expect(getOrgPersonaKeys(ORG, supabase)).rejects.toThrow("boom");
  });
});

describe("listOrgPersonas", () => {
  it("maps rows to camelCase persona definitions", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: {
        data: [
          {
            id: "p1",
            key: "persona_wedding_lead",
            label: "Wedding Lead",
            audience_type: "events",
            sort_order: 10,
            is_active: true,
          },
        ],
        error: null,
      },
    });

    const personas = await listOrgPersonas(ORG, supabase);
    expect(personas[0]).toEqual({
      id: "p1",
      key: "persona_wedding_lead",
      label: "Wedding Lead",
      audienceType: "events",
      sortOrder: 10,
      isActive: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
pnpm test src/lib/personas/read-model.test.ts
```

Expected: FAIL — module `./read-model` does not exist.

- [ ] **Step 3: Implement the read-model**

Create `src/lib/personas/read-model.ts`:

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersonaDefinition = {
  id: string;
  key: string;
  label: string;
  audienceType: string;
  sortOrder: number;
  isActive: boolean;
};

// Plain (untyped) client so `persona_definitions.key` is treated as text. The
// committed generated types still type that column as the legacy enum union;
// regenerate database.types.ts once the V2 schema is applied.
function client(injected?: SupabaseClient): SupabaseClient {
  return injected ?? (getSupabaseAdminClient() as unknown as SupabaseClient);
}

/** Active persona keys for an org — the allowed set for lead-ingestion validation. */
export async function getOrgPersonaKeys(
  orgId: string,
  injected?: SupabaseClient,
): Promise<string[]> {
  if (!injected && !isSupabaseAdminConfigured()) return [];
  const { data, error } = await client(injected)
    .from("persona_definitions")
    .select("key")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ key: string }>).map((row) => row.key);
}

/** Full persona rows for an org — for the management UI and read surfaces. */
export async function listOrgPersonas(
  orgId: string,
  injected?: SupabaseClient,
): Promise<PersonaDefinition[]> {
  if (!injected && !isSupabaseAdminConfigured()) return [];
  const { data, error } = await client(injected)
    .from("persona_definitions")
    .select("id,key,label,audience_type,sort_order,is_active")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    key: string;
    label: string;
    audience_type: string;
    sort_order: number;
    is_active: boolean;
  }>).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    audienceType: row.audience_type,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
pnpm test src/lib/personas/read-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/personas/read-model.ts src/lib/personas/read-model.test.ts
git commit -m "feat(personas): add org-scoped persona read-model"
```

---

## Task 5: Persona persistence (`src/lib/personas/persistence.ts`)

CRUD for `persona_definitions`, org-scoped, mirroring `src/lib/interactions/persistence.ts`. The functions accept an optional injected client for testability.

**Files:**
- Create: `src/lib/personas/persistence.ts`
- Test: `src/lib/personas/persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/personas/persistence.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/auth/org", () => ({
  getCurrentOrgId: vi.fn(async () => "00000000-0000-0000-0000-000000000001"),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => {
    throw new Error("should use injected client in tests");
  },
}));

import { createPersona, setPersonaActive, updatePersona } from "./persistence";

const ORG = "00000000-0000-0000-0000-000000000001";

describe("createPersona", () => {
  it("inserts a persona row scoped to the current org", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: { data: { id: "p1" }, error: null },
    });

    const result = await createPersona(
      { key: "persona_wedding_lead", label: "Wedding Lead", audienceType: "events", sortOrder: 10 },
      supabase,
    );

    expect(result).toEqual({ ok: true, id: "p1" });
    expect(supabase.calls).toContainEqual([
      "insert",
      {
        org_id: ORG,
        key: "persona_wedding_lead",
        label: "Wedding Lead",
        audience_type: "events",
        sort_order: 10,
        is_active: true,
      },
    ]);
  });

  it("returns an error result when the insert fails", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: { data: null, error: { message: "duplicate key" } },
    });
    const result = await createPersona(
      { key: "persona_dupe", label: "Dupe", audienceType: "events", sortOrder: 0 },
      supabase,
    );
    expect(result).toEqual({ ok: false, error: "duplicate key" });
  });
});

describe("updatePersona / setPersonaActive", () => {
  it("updates label/audience/sort scoped by id and org", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: { data: { id: "p1" }, error: null },
    });
    const result = await updatePersona(
      "p1",
      { label: "Renamed", audienceType: "events", sortOrder: 5 },
      supabase,
    );
    expect(result).toEqual({ ok: true, id: "p1" });
    expect(supabase.calls).toContainEqual(["eq", "id", "p1"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", ORG]);
  });

  it("toggles is_active", async () => {
    const supabase = createSupabaseQueryMock({
      persona_definitions: { data: { id: "p1" }, error: null },
    });
    const result = await setPersonaActive("p1", false, supabase);
    expect(result).toEqual({ ok: true, id: "p1" });
    expect(supabase.calls).toContainEqual(["update", { is_active: false }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
pnpm test src/lib/personas/persistence.test.ts
```

Expected: FAIL — module `./persistence` does not exist.

- [ ] **Step 3: Implement persistence**

Create `src/lib/personas/persistence.ts`:

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersonaInput = {
  key: string;
  label: string;
  audienceType: string;
  sortOrder: number;
  isActive?: boolean;
};

export type PersonaUpdate = {
  label: string;
  audienceType: string;
  sortOrder: number;
};

export type PersistResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

// Plain (untyped) client so a free-text persona key compiles against the
// still-enum-typed generated column. Regenerate types after the V2 cutover.
function client(injected?: SupabaseClient): SupabaseClient {
  return injected ?? (getSupabaseAdminClient() as unknown as SupabaseClient);
}

export async function createPersona(
  input: PersonaInput,
  injected?: SupabaseClient,
): Promise<PersistResult> {
  if (!injected && !isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await client(injected)
    .from("persona_definitions")
    .insert({
      org_id: orgId,
      key: input.key,
      label: input.label,
      audience_type: input.audienceType,
      sort_order: input.sortOrder,
      is_active: input.isActive ?? true,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updatePersona(
  id: string,
  input: PersonaUpdate,
  injected?: SupabaseClient,
): Promise<PersistResult> {
  if (!injected && !isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await client(injected)
    .from("persona_definitions")
    .update({ label: input.label, audience_type: input.audienceType, sort_order: input.sortOrder })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function setPersonaActive(
  id: string,
  isActive: boolean,
  injected?: SupabaseClient,
): Promise<PersistResult> {
  if (!injected && !isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await client(injected)
    .from("persona_definitions")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
pnpm test src/lib/personas/persistence.test.ts
```

Expected: PASS. If `createSupabaseQueryMock` does not record `["insert", ...]` / `["update", ...]` calls, adjust the assertions to match the helper's recorded call shape (inspect `src/lib/repos/__tests__/test-helpers.ts`) — the behavioral result assertions (`{ ok: true, id }`) are the load-bearing ones.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/personas/persistence.ts src/lib/personas/persistence.test.ts
git commit -m "feat(personas): add org-scoped persona persistence"
```

---

## Task 6: Wire the ingest route to the org's persona set

The route loads the org's active persona keys (when Supabase is configured) and feeds them to the parser. When unconfigured, or when the org has no personas, it falls back to the BSR default — preserving today's behavior and avoiding lockout.

**Files:**
- Modify: `src/app/api/v1/leads/ingest/route.ts`

- [ ] **Step 1: Import the read-model**

Add this import alongside the existing imports near the top of the file:

```typescript
import { getOrgPersonaKeys } from "@/lib/personas/read-model";
```

- [ ] **Step 2: Resolve the allowed keys before parsing**

Replace this line:

```typescript
  const result = parseLeadIngestionPayload(payload);
```

with:

```typescript
  let allowedPersonaKeys: readonly string[] | undefined;
  if (isSupabaseAdminConfigured()) {
    try {
      const keys = await getOrgPersonaKeys(await getCurrentOrgId());
      // Fall back to the BSR default set if this org has no personas defined yet,
      // so ingestion never hard-locks on an empty taxonomy.
      allowedPersonaKeys = keys.length > 0 ? keys : undefined;
    } catch {
      allowedPersonaKeys = undefined;
    }
  }

  const result = parseLeadIngestionPayload(payload, undefined, allowedPersonaKeys);
```

(`getCurrentOrgId` is already imported in this file. Passing `undefined` for `allowedPersonaKeys` makes `parseLeadIngestionPayload` use its BSR default — identical to today's behavior.)

- [ ] **Step 3: Typecheck the route**

Run:

```powershell
pnpm exec tsc --noEmit
```

Expected: no new type errors from `route.ts`. (If pre-existing unrelated errors appear, confirm they are not in the files this plan touches.)

- [ ] **Step 4: Lint the changed file**

Run:

```powershell
pnpm exec eslint src/app/api/v1/leads/ingest/route.ts src/lib/personas/read-model.ts src/lib/personas/persistence.ts
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/v1/leads/ingest/route.ts
git commit -m "feat(personas): validate ingest against the org persona set"
```

---

## Task 7: Settings → Personas management UI

A minimal panel to list, add, edit, and activate/deactivate the org's personas. Follows the existing settings panel + server-action pattern.

**Files:**
- Modify: `src/app/settings/settings-sections.ts`
- Modify: `src/app/settings/page.tsx`
- Create: `src/app/settings/persona-settings-actions.ts`
- Create: `src/app/settings/personas-settings.tsx`
- Create: `src/app/settings/persona-settings-forms.tsx`

- [ ] **Step 1: Add the Personas tab**

In `src/app/settings/settings-sections.ts`, add a `personas` entry to `SETTINGS_SECTIONS` (place it after `branding`):

```typescript
  { id: "branding", label: "Branding" },
  { id: "personas", label: "Personas" },
  { id: "appearance", label: "Appearance" },
```

- [ ] **Step 2: Create the server actions**

Create `src/app/settings/persona-settings-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { createPersona, setPersonaActive, updatePersona } from "@/lib/personas/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersonaActionState = { ok: boolean; message: string } | null;

const NOT_CONFIGURED: PersonaActionState = {
  ok: false,
  message: "Supabase isn't configured, so personas can't be saved.",
};

/** Normalize a free-text key into a stable `persona_*` slug. */
function normalizeKey(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base.startsWith("persona_") ? base : `persona_${base}`;
}

export async function createPersonaAction(
  _previous: PersonaActionState,
  formData: FormData,
): Promise<PersonaActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const label = String(formData.get("label") ?? "").trim();
  const audienceType = String(formData.get("audienceType") ?? "").trim() || "general";
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  const keyRaw = String(formData.get("key") ?? "").trim();

  if (!label) return { ok: false, message: "Label can't be empty." };
  const key = normalizeKey(keyRaw || label);
  if (key === "persona_" || key === "persona_unassigned_persona") {
    return { ok: false, message: "Enter a valid persona key." };
  }

  const result = await createPersona({ key, label, audienceType, sortOrder });
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/settings");
  return { ok: true, message: `Persona "${label}" added.` };
}

export async function updatePersonaAction(
  _previous: PersonaActionState,
  formData: FormData,
): Promise<PersonaActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const audienceType = String(formData.get("audienceType") ?? "").trim() || "general";
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;

  if (!id) return { ok: false, message: "Missing persona id." };
  if (!label) return { ok: false, message: "Label can't be empty." };

  const result = await updatePersona(id, { label, audienceType, sortOrder });
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/settings");
  return { ok: true, message: "Persona updated." };
}

export async function togglePersonaActiveAction(
  _previous: PersonaActionState,
  formData: FormData,
): Promise<PersonaActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "1";
  if (!id) return { ok: false, message: "Missing persona id." };

  const result = await setPersonaActive(id, isActive);
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/settings");
  return { ok: true, message: isActive ? "Persona activated." : "Persona deactivated." };
}
```

- [ ] **Step 3: Create the client form/list component**

Create `src/app/settings/persona-settings-forms.tsx`:

```typescript
"use client";

import { useActionState } from "react";

import { type PersonaDefinition } from "@/lib/personas/read-model";

import { Button } from "../_components/page-header";
import {
  createPersonaAction,
  togglePersonaActiveAction,
  updatePersonaAction,
  type PersonaActionState,
} from "./persona-settings-actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

function Feedback({ state }: { state: PersonaActionState }) {
  if (!state) return null;
  return (
    <span
      className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}
    >
      {state.message}
    </span>
  );
}

function PersonaRow({ persona }: { persona: PersonaDefinition }) {
  const [editState, editAction, saving] = useActionState(updatePersonaAction, null);
  const [toggleState, toggleAction, toggling] = useActionState(togglePersonaActiveAction, null);

  return (
    <li className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
      <form action={editAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end">
        <input name="id" type="hidden" value={persona.id} />
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Label</span>
          <input className={inputClass} defaultValue={persona.label} name="label" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Audience</span>
          <input className={inputClass} defaultValue={persona.audienceType} name="audienceType" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Order</span>
          <input className={inputClass} defaultValue={persona.sortOrder} name="sortOrder" type="number" />
        </label>
        <Button disabled={saving} size="sm" type="submit" variant="primary">
          Save
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="text-xs text-[var(--text-muted)]">{persona.key}</code>
        <div className="flex items-center gap-3">
          <Feedback state={editState ?? toggleState} />
          <form action={toggleAction}>
            <input name="id" type="hidden" value={persona.id} />
            <input name="isActive" type="hidden" value={persona.isActive ? "0" : "1"} />
            <Button disabled={toggling} size="sm" type="submit">
              {persona.isActive ? "Deactivate" : "Activate"}
            </Button>
          </form>
        </div>
      </div>
    </li>
  );
}

export function PersonaManager({ personas }: { personas: PersonaDefinition[] }) {
  const [createState, createAction, creating] = useActionState(createPersonaAction, null);

  return (
    <div className="grid gap-6">
      {personas.length > 0 ? (
        <ul className="grid gap-3">
          {personas.map((persona) => (
            <PersonaRow key={persona.id} persona={persona} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No personas yet. Add the audience personas this workspace markets to.
        </p>
      )}

      <form
        action={createAction}
        className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 sm:grid-cols-[1fr_1fr_1fr_5rem_auto] sm:items-end"
      >
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Label</span>
          <input className={inputClass} name="label" placeholder="Wedding lead" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Key (optional)</span>
          <input className={inputClass} name="key" placeholder="auto from label" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Audience</span>
          <input className={inputClass} name="audienceType" placeholder="events" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Order</span>
          <input className={inputClass} defaultValue={0} name="sortOrder" type="number" />
        </label>
        <Button disabled={creating} size="sm" type="submit" variant="primary">
          Add persona
        </Button>
      </form>
      <Feedback state={createState} />
    </div>
  );
}
```

- [ ] **Step 4: Create the server panel**

Create `src/app/settings/personas-settings.tsx`:

```typescript
import { getCurrentOrgId } from "@/lib/auth/org";
import { listOrgPersonas } from "@/lib/personas/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { PersonaManager } from "./persona-settings-forms";
import { SettingsSection } from "./settings-section";

export async function PersonasSettings() {
  const personas = isSupabaseAdminConfigured() ? await listOrgPersonas(await getCurrentOrgId()) : [];

  return (
    <SettingsSection
      description="Define the audience personas this workspace markets to. Lead ingestion validates against the active personas listed here."
      title="Personas"
    >
      <PersonaManager personas={personas} />
    </SettingsSection>
  );
}
```

- [ ] **Step 5: Mount the panel in the settings page**

In `src/app/settings/page.tsx`:

(a) Add the import alongside the other panel imports:

```typescript
import { PersonasSettings } from "./personas-settings";
```

(b) Add the panel to the `panels` map (after the `branding` entry):

```typescript
            branding: <BrandingSettings />,
            personas: <PersonasSettings />,
            appearance: <AppearanceSettings />,
```

- [ ] **Step 6: Typecheck and lint**

Run:

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint src/app/settings/persona-settings-actions.ts src/app/settings/persona-settings-forms.tsx src/app/settings/personas-settings.tsx src/app/settings/page.tsx src/app/settings/settings-sections.ts
```

Expected: no errors. If `SettingsSection`'s prop names differ from `title`/`description`, match them to `src/app/settings/settings-section.tsx`. If `Button` rejects a `variant`/`size` value, match the allowed values in `src/app/_components/page-header.tsx`.

- [ ] **Step 7: Commit**

```powershell
git add src/app/settings/settings-sections.ts src/app/settings/page.tsx src/app/settings/persona-settings-actions.ts src/app/settings/personas-settings.tsx src/app/settings/persona-settings-forms.tsx
git commit -m "feat(personas): add Settings persona management panel"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
pnpm test
```

Expected: PASS, including `src/domain/__tests__/personas.test.ts`, `src/domain/__tests__/lead-ingestion.test.ts`, `src/lib/personas/read-model.test.ts`, and `src/lib/personas/persistence.test.ts`.

- [ ] **Step 2: Typecheck the whole app**

Run:

```powershell
pnpm build
```

Expected: build succeeds. (`pnpm lint` does not typecheck — `pnpm build` is the gate for the typed Supabase column changes.)

- [ ] **Step 3: Record the type-regeneration follow-up**

After the V2 schema is applied to a Supabase project (per `docs/superpowers/plans/2026-06-12-database-v2-baseline.md`), regenerate `src/lib/supabase/database.types.ts` so `persona` columns and `persona_definitions.key` become `string`. At that point the `as unknown as SupabaseClient` casts in `src/lib/personas/{read-model,persistence}.ts` can be reviewed and, if the generated types are accurate, simplified. This step is a note for that later cutover — no code change now.

- [ ] **Step 4: Final commit (if anything was adjusted during verification)**

```powershell
git add -A
git commit -m "chore(personas): verification fixes for per-org taxonomy slice"
```

---

## Self-Review Notes

- **Spec coverage:** schema enum removal (Task 1) ✓; domain injected validator (Task 2) ✓; read-model (Task 4) ✓; persistence/CRUD (Task 5) ✓; ingestion contract with preserved response codes (Tasks 3, 6) ✓; management UI (Task 7) ✓; generated-types follow-up (Task 8 Step 3) ✓.
- **Deliberately out of scope** (per amended spec): the ~20 `OFFICIAL_PERSONA_MAPPINGS` consumers in CRM forms, Hermes contracts, mark promote, vault, and competitor-intel stay on the BSR default; per-org settings/connections; real tenant auth/token→org; the vault knowledge layer.
- **Type-name consistency:** `getOrgPersonaKeys`, `listOrgPersonas`, `PersonaDefinition`, `createPersona`, `updatePersona`, `setPersonaActive`, `PersonaInput`, `PersonaUpdate`, `PersistResult`, `createPersonaAction`, `updatePersonaAction`, `togglePersonaActiveAction`, `PersonaActionState`, `PersonaManager`, `PersonasSettings` are used consistently across tasks.
