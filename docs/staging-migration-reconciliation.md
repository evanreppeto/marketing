# Staging migration-history reconciliation

**Status:** ✅ reconciled 2026-07-10 (verified live) · **Target:** `marketing-staging` (`zheuujpxsxmisnrlsriv`, org `dkpvddxxyxyniqlfubnf`)

> **Executed 2026-07-10.** The live ledger held two things the initial diagnosis didn't know about
> (a 4th drifted row, and an orphan migration). Final state: staging's ledger equals the repo folder
> (8 rows, all at repo versions), all DDL materialized. See **Execution log** at the bottom. The
> runbook below is retained as the reusable procedure.

## Problem

Staging's `supabase_migrations.schema_migrations` ledger has **drifted** from the repo's
`supabase/migrations/` folder. Two symptoms:

1. **Renumbered versions.** Three incrementals were recorded on staging under
   apply-time timestamps instead of their repo filename prefixes:

   | Repo file (canonical version) | Recorded on staging |
   |---|---|
   | `20260708120000_workspace_media_config` | `20260708201051_workspace_media_config` |
   | `20260708130000_arc_conversation_summary` | `20260708201059_arc_conversation_summary` |
   | `20260708140000_campaign_tenancy_sharing` | `20260708203809_campaign_tenancy_sharing` |

2. **Missing migration.** `20260708163000_app_settings_per_workspace` is in the repo folder
   but **absent** from staging's applied history.

### Root cause

The three drifted rows were applied through the Supabase MCP `apply_migration`, which stamps the
ledger `version` with the **moment it runs** (`20260708201051` = 20:10:51) rather than the repo
filename prefix (`20260708120000`). `app_settings_per_workspace` was simply never applied to staging.

### Why it matters

`supabase db push` / `migration list` reconcile **by version string**, not by DDL content. Because
the repo versions (`…120000/130000/140000/163000`) don't match the recorded versions
(`…201051/201059/203809`, + none for `163000`), the CLI treats all four repo files as *un-applied*
and tries to run them. Three of them survive that only because their DDL is idempotent; the fourth is
a real, needed, **non-idempotent** change (see below). Either way the ledger is not a faithful record,
which is exactly the "single source of truth" property we need.

## Decision

**Repair staging's ledger to match the repo folder. Do not re-baseline, do not touch the baseline.**

- The repo folder is already the correct desired end-state and is left **unchanged** (verified
  fresh-DB-clean below). Re-baselining would fold these incrementals into
  `00000000000000_baseline.sql` and change shipped baseline semantics — out of scope and disallowed.
- The fix is entirely operational: align three ledger `version` strings and add the missing
  `app_settings_per_workspace` row (applying its DDL first **iff** it isn't already applied).

## The repo folder is already clean for a fresh DB (verified)

Apply order on a new DB is lexicographic by version; every dependency is satisfied by the baseline:

| # | Migration | Idempotent? | Preconditions (all present in baseline) |
|---|---|---|---|
| 0 | `00000000000000_baseline` | — | — |
| 1 | `20260708120000_workspace_media_config` | **yes** (`create table/index if not exists`, `drop trigger if exists`) | `set_updated_at()` fn |
| 2 | `20260708130000_arc_conversation_summary` | **yes** (`add column if not exists`) | `arc_conversations` |
| 3 | `20260708140000_campaign_tenancy_sharing` | **yes** (`add column/table/index if not exists`) | `campaigns`, `workspaces`, `auth.users` |
| 4 | `20260708163000_app_settings_per_workspace` | **NO** (`drop constraint` / `add constraint`, unguarded) | `app_settings` with PK `app_settings_pkey (key)` — baseline line 1419 |
| 5 | `20260710170000_reconcile_dispatch_tables` | **yes** (`add column/index if not exists`, `drop … if exists`) | `campaign_dispatches`, `outbound_dispatches`, `weather_event_targets` |

All version prefixes are unique (the pre-baseline "duplicate prefix" blocker is gone post-#351).
No repo change is required.

## Repair runbook (run against staging via the Supabase MCP)

> Run every step against **`zheuujpxsxmisnrlsriv` only**. All statements are idempotent and safe to
> re-run. Prefer running the mutation as one `execute_sql` call (single implicit transaction).

### Step 0 — Investigate (read-only). Confirm the ledger matches the assumptions above.

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Expect to see the three drifted versions, **no** `20260708163000`, and the baseline
(`00000000000000`). Note the exact `name` values — the repair below matches on `name`; if `name` is
null/blank on staging, substitute the WHERE clauses with the exact drifted `version` strings from the
table in "Problem".

### Step 1 — Confirm `app_settings` DDL state (read-only). Decides apply-vs-record.

```sql
select array_agg(att.attname order by k.ord) as pk_columns
from pg_constraint con
join pg_class rel      on rel.oid = con.conrelid
join pg_namespace nsp  on nsp.oid = rel.relnamespace
join unnest(con.conkey) with ordinality k(attnum, ord) on true
join pg_attribute att  on att.attrelid = rel.oid and att.attnum = k.attnum
where nsp.nspname = 'public' and rel.relname = 'app_settings' and con.contype = 'p';
```

- `{key}` → the per-workspace change is **not** applied. Step 2 will run the DDL, then record it.
- `{org_id,key}` → DDL already present (applied out-of-band). Step 2 will **only** record the ledger
  row and skip the DDL.

The repair in Step 2 makes this decision itself, so it is correct in either case.

### Step 2 — Repair (mutating). Idempotent; safe to re-run.

```sql
-- 2a. Align the three renumbered incrementals to their repo filename versions.
--     Matched by name so it works regardless of the exact drifted timestamp.
update supabase_migrations.schema_migrations
   set version = '20260708120000'
 where name = 'workspace_media_config'   and version <> '20260708120000';

update supabase_migrations.schema_migrations
   set version = '20260708130000'
 where name = 'arc_conversation_summary' and version <> '20260708130000';

update supabase_migrations.schema_migrations
   set version = '20260708140000'
 where name = 'campaign_tenancy_sharing' and version <> '20260708140000';

-- 2b. Defensive: reconcile_dispatch_tables was applied to staging on 2026-07-10 and may have
--     drifted the same way. No-op if it's already recorded at the canonical version.
update supabase_migrations.schema_migrations
   set version = '20260710170000'
 where name = 'reconcile_dispatch_tables' and version <> '20260710170000';

-- 2c. app_settings_per_workspace: apply the DDL ONLY if the PK is still (key), then record the row
--     at the repo version. The guard makes this safe whether or not the change is already applied.
do $$
declare pk_cols text[];
begin
  select array_agg(att.attname order by k.ord)
    into pk_cols
  from pg_constraint con
  join pg_class rel      on rel.oid = con.conrelid
  join pg_namespace nsp  on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality k(attnum, ord) on true
  join pg_attribute att  on att.attrelid = rel.oid and att.attnum = k.attnum
  where nsp.nspname = 'public' and rel.relname = 'app_settings' and con.contype = 'p';

  if pk_cols = array['key'] then
    alter table public.app_settings drop constraint app_settings_pkey;
    alter table public.app_settings add constraint app_settings_pkey primary key (org_id, key);
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260708163000',
  'app_settings_per_workspace',
  array[
    'alter table public.app_settings drop constraint app_settings_pkey',
    'alter table public.app_settings add constraint app_settings_pkey primary key (org_id, key)'
  ]
)
on conflict (version) do nothing;
```

`app_settings` promotion is data-safe: `key` was previously the PK (so all keys are unique), which
makes the new `(org_id, key)` composite trivially unique — no dedup needed.

### Step 3 — Verify (read-only). The ledger should now equal the repo folder exactly.

```sql
select version, name
from supabase_migrations.schema_migrations
where version >= '00000000000000'
order by version;
-- Expect: 00000000000000, 20260708120000, 20260708130000, 20260708140000,
--         20260708163000, 20260710170000  (+ any later migrations added after this doc)

-- app_settings PK is now composite:
select array_agg(att.attname order by k.ord) as pk_columns
from pg_constraint con
join pg_class rel      on rel.oid = con.conrelid
join pg_namespace nsp  on nsp.oid = rel.relnamespace
join unnest(con.conkey) with ordinality k(attnum, ord) on true
join pg_attribute att  on att.attrelid = rel.oid and att.attnum = k.attnum
where nsp.nspname = 'public' and rel.relname = 'app_settings' and con.contype = 'p';
-- Expect: {org_id,key}
```

After this, `supabase db push` / `migration list` against staging report the folder and the ledger as
in sync, and a fresh `db push` finds nothing to apply.

## Notes

- If `reconcile_dispatch_tables` is **entirely missing** from the ledger (applied via raw
  `execute_sql` without a ledger insert), 2b is a no-op and `supabase db push` will re-apply it — its
  DDL is idempotent, so that's harmless and self-healing; it will be recorded on that push.
- `execute_sql` runs the whole block as one statement/transaction, so the `do $$…$$` guard and the
  `insert` commit together.

## Execution log (2026-07-10)

Run live against `zheuujpxsxmisnrlsriv` via the Supabase MCP. The read-only Step 0/1 surfaced two
things beyond the original diagnosis:

- **`reconcile_dispatch_tables` was also drifted** (`20260710155900` on staging vs repo
  `20260710170000`) — realigned by name, same as the other three.
- **An orphan on staging in no git ref:** `20260710160241_contact_email_consent`
  (`add column contacts.email_unsubscribed_at` + partial `contacts_emailable_idx`). Not in this repo,
  not on `origin/main`, referenced by no code. Worse, it was a **"ghost" ledger row**: recorded as
  applied, but the column/index **did not exist** in the schema (DDL never materialized).
- Separately, `origin/main` had advanced past this worktree and carried
  `20260710180000_connector_cost_governance`, which staging lacked.

**Decisions (delegated to me):** *adopt* the orphan (it's a real, additive, code-adjacent change whose
file was lost — not a stray to destroy), and *fully sync* staging to `origin/main`.

**Actions taken:**
1. Realigned 4 drifted ledger versions to repo filenames (workspace_media_config, arc_conversation_summary,
   campaign_tenancy_sharing, reconcile_dispatch_tables).
2. Applied + recorded `app_settings_per_workspace` (`20260708163000`) — PK was confirmed `{key}`, so the
   `DROP/ADD CONSTRAINT` ran; PK is now `{org_id,key}`.
3. Applied + recorded `connector_cost_governance` (`20260710180000`) from `origin/main` (idempotent DDL:
   two tables + RLS + drop/create policies).
4. **Materialized** `contact_email_consent` — ran its idempotent DDL so the column + index now actually
   exist (the ghost row is now true) — and **adopted** it into the repo as
   `supabase/migrations/20260710160241_contact_email_consent.sql` (same version as the ledger row, so no
   renumber needed).

**Verified end state (8 rows, staging ledger == repo folder):** `00000000000000` · `20260708120000` ·
`20260708130000` · `20260708140000` · `20260708163000` · `20260710160241` · `20260710170000` ·
`20260710180000`. Plus: `app_settings` PK `{org_id,key}`; `connector_usage_events` +
`connector_spend_budgets` present; `contacts.email_unsubscribed_at` + `contacts_emailable_idx` present.

**Repo caveat:** this reconciliation branch was cut *behind* `origin/main`. `connector_cost_governance`
already lives on `main`; the only repo change needed is the adopted `contact_email_consent` file (+ this
doc). Rebase onto `main` before merge so the adopted file lands alongside main's newer migrations.
