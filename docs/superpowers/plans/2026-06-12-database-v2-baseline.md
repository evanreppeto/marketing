# Database V2 Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fresh Supabase V2 baseline for the rebuilt Growth Engine with BSR as the only seeded organization and no fake business data.

**Architecture:** V2 is built in a separate `supabase/v2/` track so legacy migrations stay intact while the fresh project is prepared. The schema keeps current app-facing table and column names where practical, adds `org_id` defaults for SaaS readiness, and uses explicit RLS/grants for Supabase Data API compatibility.

**Tech Stack:** Supabase Postgres, SQL migrations, Next.js 16 app using `@supabase/supabase-js`, TypeScript database types generated from Supabase.

---

## File Structure

- Create: `docs/superpowers/specs/2026-06-12-database-v2-baseline-design.md`
  - Captures product decisions, seed rules, table groups, security, and cutover.
- Create: `docs/superpowers/plans/2026-06-12-database-v2-baseline.md`
  - Step-by-step implementation and cutover checklist.
- Create: `supabase/v2/README.md`
  - Operational notes for applying V2 to a fresh Supabase project.
- Create: `supabase/v2/migrations/20260612160000_v2_baseline.sql`
  - Fresh baseline schema, RLS, grants, and allowed seed rows.

## Task 1: Preserve Legacy State And Prepare V2 Track

**Files:**
- Create: `supabase/v2/README.md`

- [ ] **Step 1: Confirm checkout state**

Run:

```powershell
git status --short --branch
```

Expected: existing unrelated working-tree changes may be present. Do not revert
or stage them.

- [ ] **Step 2: Create V2 README**

Create `supabase/v2/README.md` with:

```markdown
# Supabase V2 Baseline

This folder contains the clean database baseline for a fresh Supabase project.
It is intentionally separate from `supabase/migrations/` while the current app
branch still contains legacy migration history.

Do not apply these files to the old production project unless the team has
taken a backup and explicitly decided to reset that project in place.

Recommended path:

1. Create a new Supabase project.
2. Apply `migrations/20260612160000_v2_baseline.sql`.
3. Confirm the only seeded organization is Big Shoulders Restoration.
4. Regenerate `src/lib/supabase/database.types.ts`.
5. Point local and deployment env vars at the new project.
```

- [ ] **Step 3: Commit V2 track docs**

Run:

```powershell
git add docs/superpowers/specs/2026-06-12-database-v2-baseline-design.md docs/superpowers/plans/2026-06-12-database-v2-baseline.md supabase/v2/README.md
git commit -m "docs(database): define v2 baseline reset"
```

Expected: commit includes only the V2 docs.

## Task 2: Create Fresh Baseline SQL

**Files:**
- Create: `supabase/v2/migrations/20260612160000_v2_baseline.sql`

- [ ] **Step 1: Write the baseline migration**

Create the SQL file with these sections in order:

1. Extensions and helper functions.
2. Organization seed and default organization resolver.
3. Enums.
4. Foundation tables.
5. CRM tables.
6. Activity tables.
7. Campaign and approval tables.
8. Agent, Arc, and Vault tables.
9. Persona/guardrail tables.
10. Indexes.
11. RLS enablement.
12. Explicit Data API grants.
13. Allowed seed rows only.

- [ ] **Step 2: Static SQL sanity checks**

Run:

```powershell
Select-String -Path supabase/v2/migrations/20260612160000_v2_baseline.sql -Pattern "fake|demo|sample"
Select-String -Path supabase/v2/migrations/20260612160000_v2_baseline.sql -Pattern "create table public\\."
```

Expected: first command returns no fake/demo/sample seed rows; second command
prints the expected table list.

- [ ] **Step 3: Optional parse check with psql**

If a disposable Supabase or Postgres database is available, run:

```powershell
psql "$env:DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 -f supabase/v2/migrations/20260612160000_v2_baseline.sql
```

Expected: no SQL errors. Skip this step if there is no disposable database.

- [ ] **Step 4: Commit SQL baseline**

Run:

```powershell
git add supabase/v2/migrations/20260612160000_v2_baseline.sql
git commit -m "feat(database): add v2 Supabase baseline"
```

Expected: commit includes only the V2 baseline SQL.

## Task 3: Create Fresh Supabase Project

**Files:**
- No repo files.

- [ ] **Step 1: Create the project**

In Supabase, create a new project for Growth Engine V2.

Recommended naming:

```text
big-shoulders-growth-engine-v2
```

Choose the same region you expect to deploy from unless there is a specific
latency or compliance reason to choose another.

- [ ] **Step 2: Apply baseline**

Apply the baseline SQL to the new project using the Supabase SQL editor, CLI, or
another trusted SQL client.

Expected: SQL succeeds and creates the empty product schema.

- [ ] **Step 3: Verify allowed seed data**

Run in the Supabase SQL editor:

```sql
select slug, name from public.organizations;
select key from public.persona_definitions order by sort_order;
select provider from public.connections order by provider;

select count(*) as companies from public.companies;
select count(*) as campaigns from public.campaigns;
select count(*) as approvals from public.approval_items;
select count(*) as arc_messages from public.arc_messages;
```

Expected:

- One organization: `big-shoulders-restoration`.
- Twelve persona rows.
- Five connection registry rows.
- Counts for companies, campaigns, approvals, and Arc messages are all `0`.

## Task 4: Point The App At V2 And Regenerate Types

**Files:**
- Modify: `.env.local`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Update local env**

Update local env values to the V2 project:

```env
NEXT_PUBLIC_SUPABASE_URL=<v2-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<v2-publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<v2-service-role-key>
```

- [ ] **Step 2: Regenerate database types**

Run the Supabase CLI help first, because CLI syntax changes:

```powershell
supabase --help
supabase gen --help
```

Then regenerate the database types using the current CLI-supported command for
the V2 project and write them to:

```text
src/lib/supabase/database.types.ts
```

- [ ] **Step 3: Typecheck**

Run:

```powershell
pnpm exec tsc --noEmit
```

Expected: if types expose app/schema mismatches, fix the app or baseline in the
smallest possible slice.

## Task 5: Smoke Test Empty Workspace

**Files:**
- Modify only if smoke tests reveal missing columns or incompatible query shapes.

- [ ] **Step 1: Test settings**

Run:

```powershell
pnpm dev
```

Open `/settings`. Expected: settings and connection rows render without fake
data.

- [ ] **Step 2: Test CRM empty state**

Open `/crm`. Expected: CRM pages render empty states, not missing-table errors.

- [ ] **Step 3: Test campaign creation**

Create one real operator campaign only if you are ready for a real BSR record.
Expected: campaign, assets, approval rows, and campaign events are created under
the BSR organization.

- [ ] **Step 4: Test Arc first thread**

Send one real Arc message only if the new project is meant to store it.
Expected: one conversation and one operator message are created under BSR.

## Task 6: Decide Legacy Migration Replacement

**Files:**
- Potentially modify later: `supabase/migrations/`

- [ ] **Step 1: Choose repository migration strategy**

After V2 is proven, choose one:

1. Keep `supabase/v2/` as the V2 source and leave legacy migrations untouched.
2. Move legacy migrations to an archive folder and make the V2 baseline the new
   `supabase/migrations/` root.
3. Keep both until the old Supabase project is retired.

Recommended: option 3 until the V2 project has passed smoke tests and deployment
has been pointed at it.

## Self-Review

- The plan creates a fresh database track without mutating legacy migrations.
- The baseline allows BSR seed/config data only.
- The app can test current write paths because `org_id` defaults to the seeded
  BSR organization.
- The plan does not add self-serve SaaS, billing, public dispatch, or fake data.
