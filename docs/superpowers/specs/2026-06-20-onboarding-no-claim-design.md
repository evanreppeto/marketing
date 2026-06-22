# Harden Org Provisioning — No Claim-by-Name — Design

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** A create-intent signup must **always create a fresh organization** (unique slug, same display name) and never *claim* a pre-existing org just because the typed name slugifies to an existing org's slug. Joining an existing org stays exclusively the **invite** path.

## Problem

`createWorkspaceForUser` (`src/lib/auth/workspace-onboarding.ts`) currently does:
```ts
const orgSlug = slugify(organizationName);
const existingOrg = await findOrganizationBySlug(client, orgSlug);
if (existingOrg && (await organizationHasMemberships(client, existingOrg.id)))
  return { ok: false, status: "already_claimed", … };
const org = existingOrg ?? (await createOrganization(client, organizationName, orgSlug));
```
So a create-intent signup whose name slugifies to an existing **member-less** org **silently joins (claims) that org** — inheriting its data. This is exactly how registering "Big Shoulders Restoration" attached the new account to the pre-seeded `big-shoulders-restoration` org and surfaced its demo data. For a multi-tenant product, name collision must never cross tenants.

## What exists (reuse)

- `slugify(name)`, `findOrganizationBySlug(client, slug)`, `organizationHasMemberships(client, orgId)`, `createOrganization(client, name, slug)` — all in `workspace-onboarding.ts`.
- The existing-membership short-circuit at the top of `createWorkspaceForUser` (`getActiveMembershipForUser` → return that org) — **keep unchanged**.
- The invite/join path (`pending_invite_code` redeemed in `user-provisioning.ts`) targets a specific org by the invite, not by name — **keep unchanged**.
- `organizations.slug` is unique (looked up by slug; treated as unique) — used for the race-safety retry below.

## Behavior

- **Create intent + no existing membership:** always create a **new** org. Display name = exactly what the user typed. Slug = `slugify(name)`, or a disambiguated unique slug if that base is taken.
- **Slug already taken:** append a numeric suffix — `acme` → `acme-2` → `acme-3` … up to a small cap (e.g. 20); past the cap, append a short random token (`acme-x7k2`). The base slug being taken never blocks signup and never reuses the other org.
- **Never claim** a pre-existing org by slug. The `already_claimed` branch and the `existingOrg ?? …` fallback are removed from the create path.
- **Join intent** (invite): unchanged — redeems the invite, joins the invite's specific org/role.
- **Race safety:** if `createOrganization` fails with a unique-slug violation (two signups racing on the same name), retry with the next suffix (bounded retries) before surfacing an error.

## Architecture

In `src/lib/auth/workspace-onboarding.ts`:

1. **New pure-ish helper `uniqueOrgSlug(client, baseName): Promise<string>`:**
   - `base = slugify(baseName)`; if `!(await findOrganizationBySlug(client, base))` → return `base`.
   - else try `base-2 … base-{CAP}`, returning the first free one; if all taken, return `${base}-${shortRandom()}`.
   - `shortRandom()` = a few url-safe chars (e.g. from `crypto`), no `Math.random` reliance for collisions.

2. **`createWorkspaceForUser` create path:**
   - Replace the `existingOrg`/`already_claimed`/`existingOrg ?? create` block with:
     ```ts
     const orgSlug = await uniqueOrgSlug(client, organizationName);
     const org = await createOrganization(client, organizationName, orgSlug);
     ```
   - Wrap `createOrganization` in a bounded retry: on a unique-violation error, recompute `uniqueOrgSlug` and retry (≤3 attempts) → then fail with a clear message.
   - Keep the top-of-function `getActiveMembershipForUser` short-circuit (returns the user's existing org) and the rest of the flow (`upsertDefaultWorkspace`, `createOwnerMemberships`, `createWorkspaceDefaults`) unchanged.
   - `claimedExistingOrg` is now always `false` for the create path (or drop the field if unused elsewhere — verify usages first).

## Testing

- **`uniqueOrgSlug`** (mock `findOrganizationBySlug`): free base → base; base taken → `base-2`; `base`+`base-2` taken → `base-3`; all up to cap taken → random-suffixed (`base-…`). 
- **`createWorkspaceForUser`** (mock Supabase helpers):
  - create-intent with a name that collides with an existing org → a **new** org is created (`createOrganization` called; the existing org is NOT reused; no `already_claimed`).
  - existing-membership short-circuit still returns the user's current org (no new org).
  - unique-violation on first `createOrganization` → retries with a new slug and succeeds.
- Full `pnpm build`.

## Safety & scope

- Only `workspace-onboarding.ts` changes. Sign-in, sign-out, invite/join, workspace defaults — untouched.
- No data migration; existing orgs/users unaffected. A future "Big Shoulders Restoration" signup gets `big-shoulders-restoration-2` rather than claiming the existing org.
- No behavior change for invite-based joins (the only intended way to land in someone else's org).

## Out of scope

- Backfilling/renaming existing duplicate-slug orgs (none known beyond the seeded one, which is now Evan's).
- A custom org-slug picker UI (auto-disambiguation is sufficient).
- The demo-data gate (separate PR #182) and email invites (separate design).
