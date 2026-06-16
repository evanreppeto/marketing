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

## Optional Demo Data

The baseline intentionally starts with no fake business records. To make the app
easier to inspect in local/dev environments, apply:

```sql
seeds/dev_demo_data.sql
```

This inserts clearly tagged demo records into the real app tables: CRM records,
campaigns, approvals, Arc messages, agent work, activity, and Vault. To remove
only those demo records later, apply:

```sql
seeds/clear_dev_demo_data.sql
```

Do not apply demo data to a real production workspace.
