# Harden Org Provisioning (No Claim-by-Name) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create-intent signups always create a fresh org with a unique slug; never claim a pre-existing org by name collision. Join-by-invite unchanged.

**Architecture:** Add `uniqueOrgSlug` + a unique-slug-retry create wrapper to `src/lib/auth/workspace-onboarding.ts`; replace the `existingOrg ?? createOrganization` / `already_claimed` block in `createWorkspaceForUser` with it. One file.

**Tech Stack:** TypeScript, Vitest, Supabase.

**Test command:** `pnpm test <path>`.

**Verified facts (`src/lib/auth/workspace-onboarding.ts`):**
- `slugify(value)` lowercases, replaces non-alphanumerics with `-`, trims, `.slice(0,72)`, defaults `"workspace"`.
- `findOrganizationBySlug(client, slug)` → `OrganizationRow | null`.
- `createOrganization(client, name, slug)` inserts `{name, slug, status:"active"}` and **throws** the Supabase error on failure (a unique-slug collision surfaces as Postgres code `23505`).
- `createWorkspaceForUser` flow: top short-circuit `getActiveMembershipForUser` (return existing org) → `orgSlug = slugify(name)` → `existingOrg = findOrganizationBySlug` → `already_claimed` if it has memberships → `org = existingOrg ?? createOrganization(...)` → `upsertDefaultWorkspace` → `createOwnerMemberships` → `createWorkspaceDefaults` → return `{ ok, orgId, workspaceId, claimedExistingOrg }`.
- Result type field `claimedExistingOrg: boolean` — **grep its usages before changing** (likely a flag a caller reads).

---

## File Structure
- `src/lib/auth/workspace-onboarding.ts` (modify) + its test (`workspace-onboarding.test.ts` if present, else create)

---

## Task 1: `uniqueOrgSlug` + unique-slug create wrapper

**Files:** Modify `src/lib/auth/workspace-onboarding.ts`; test in the onboarding test file.

- [ ] **Step 1: Write failing tests** for `uniqueOrgSlug` (export it for testing). Mock `findOrganizationBySlug` (or inject a `slugExists` fn — see note). Cases:
  - base free → returns `slugify(name)`.
  - base taken, `-2` free → returns `base-2`.
  - base + `-2` taken, `-3` free → returns `base-3`.
  - base + `-2..-CAP` all taken → returns a `base-<random>` (matches `/^base-[a-z0-9]+$/`, not a plain number).
> Testability: give `uniqueOrgSlug(client, baseName)` and mock the module's `findOrganizationBySlug` via the client (the existing helper queries `client.from("organizations")…`). Mirror how the file's other tests mock the Supabase client. If that's awkward, refactor `uniqueOrgSlug` to take an injectable `exists: (slug) => Promise<boolean>` defaulting to `(s) => Boolean(await findOrganizationBySlug(client, s))`, and test the pure suffixing via the injected `exists`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (add near `createOrganization`):
```typescript
import { randomBytes } from "node:crypto";

const SLUG_SUFFIX_CAP = 20;

function shortSlugSuffix(): string {
  return randomBytes(3).toString("hex"); // 6 url-safe hex chars
}

/** A free org slug derived from the name: base, else base-2..base-CAP, else base-<rand>.
 *  Never returns a slug already in use. Base is trimmed so suffixed slugs stay ≤72 chars. */
export async function uniqueOrgSlug(client: TypedSupabaseClient, baseName: string): Promise<string> {
  const base = slugify(baseName);
  if (!(await findOrganizationBySlug(client, base))) return base;
  const root = base.slice(0, 64); // leave room for "-<suffix>"
  for (let n = 2; n <= SLUG_SUFFIX_CAP; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await findOrganizationBySlug(client, candidate))) return candidate;
  }
  return `${root}-${shortSlugSuffix()}`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/** Create an org with a unique slug, retrying on a slug race (unique violation). */
async function createOrganizationUnique(
  client: TypedSupabaseClient,
  name: string,
  baseName: string,
): Promise<OrganizationRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = await uniqueOrgSlug(client, baseName);
    try {
      return await createOrganization(client, name, slug);
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) continue; // raced; recompute + retry
      throw error;
    }
  }
  throw new Error("Could not allocate a unique organization slug.");
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/auth/workspace-onboarding.ts <test> && git commit -m "feat(auth): uniqueOrgSlug + unique-slug org create (race-safe)"`

---

## Task 2: Rewire `createWorkspaceForUser` (drop claim-by-name)

**Files:** Modify `src/lib/auth/workspace-onboarding.ts` + test.

- [ ] **Step 1: Grep `claimedExistingOrg` usages** — `rg -n "claimedExistingOrg" src` — note whether any caller branches on it. (Likely a UI flag; keep the field, always `false` now. Only remove it if zero usages.)

- [ ] **Step 2: Write failing tests** for `createWorkspaceForUser` (mock the Supabase client helpers — mirror the file's existing test style):
  - **No-claim:** create-intent, name slugifies to an EXISTING org that has no members → a NEW org is created (assert `createOrganization`/insert called with a disambiguated slug; the existing org id is NOT returned; no `already_claimed`).
  - **Existing membership short-circuit:** user already has an active membership → returns that org, no new org created.
  - **Race:** first `createOrganization` throws `{ code: "23505" }`, second succeeds → returns the second org (retry worked).

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Rewire** the create path in `createWorkspaceForUser`. Replace:
```typescript
    const orgSlug = slugify(organizationName);
    const existingOrg = await findOrganizationBySlug(client, orgSlug);
    const claimedExistingOrg = Boolean(existingOrg);

    if (existingOrg && (await organizationHasMemberships(client, existingOrg.id))) {
      return { ok: false, status: "already_claimed", message: "That organization already has members. Ask an owner or admin to invite you." };
    }

    const org = existingOrg ?? (await createOrganization(client, organizationName, orgSlug));
```
with:
```typescript
    const org = await createOrganizationUnique(client, organizationName, organizationName);
```
- Keep the rest (`upsertDefaultWorkspace`, `createOwnerMemberships`, `createWorkspaceDefaults`).
- In the return, set `claimedExistingOrg: false` (the create path never claims now). If Step 1 found zero usages, you may drop the field from the result type + return instead — but keeping it `false` is the low-risk default.
- Remove the now-unused `organizationHasMemberships` only if nothing else references it (grep first; otherwise leave it).
- The `already_claimed` status string can stay in the result-type union (harmless) or be removed if unused — leave it unless trivially clean.

- [ ] **Step 5: Run → PASS** (new + existing onboarding tests).
- [ ] **Step 6: Commit** — `git add src/lib/auth/workspace-onboarding.ts <test> && git commit -m "fix(auth): create-intent signups make a fresh org, never claim by name"`

---

## Task 3: Sweep + build

- [ ] **Step 1:** `pnpm test src/lib/auth/workspace-onboarding.test.ts` → pass.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `pnpm build` → succeeds (`pnpm install` first if deps missing). Fix only feature-caused failures (e.g. a dropped `claimedExistingOrg`/`already_claimed` reference if you removed them).
- [ ] **Step 3 (if fixups):** `git add -A && git commit -m "test(auth): onboarding-no-claim verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** `uniqueOrgSlug` + race-safe create → Task 1; remove claim-by-name from `createWorkspaceForUser` + keep short-circuit & invite path → Task 2; build → Task 3. Matches spec.
- **Placeholder scan:** none. Test-injectability for `uniqueOrgSlug` is given two concrete options (mock the client, or an injected `exists`).
- **Type/consistency:** `uniqueOrgSlug(client, baseName): Promise<string>`; `createOrganizationUnique(client, name, baseName): Promise<OrganizationRow>` feeds the unchanged `upsertDefaultWorkspace(client, org, …)`. `claimedExistingOrg` kept as `false` unless verified unused. Invite/join path and the top membership short-circuit untouched.
- **Safety:** create-intent never reuses an existing org; slug uniqueness is checked then race-retried on 23505; display name unchanged; no migration; only `workspace-onboarding.ts` touched. Existing orgs/users unaffected.
