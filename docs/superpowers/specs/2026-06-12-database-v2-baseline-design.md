# Database V2 Baseline Design

**Date:** 2026-06-12
**Status:** Approved direction, ready for baseline build
**Scope:** Fresh Supabase project for the rebuilt Big Shoulders Growth Engine.

## Product Decision

V2 starts fresh. No fake CRM records, fake campaigns, fake approvals, fake Arc
threads, fake analytics, or demo history should be inserted.

The database is BSR-first operationally and SaaS-ready structurally:

- Big Shoulders Restoration is the only seeded organization.
- Product-owned tables carry `org_id`.
- Current app inserts may omit `org_id`; the V2 baseline defaults those rows to
  the seeded BSR organization so the app can be tested before every write path is
  tenant-aware.
- Future multi-tenant work can replace the default-org behavior with explicit
  organization resolution and per-organization user/session routing.

## Why A Fresh Project

The current app has been substantially redesigned. Keeping the existing Supabase
project risks carrying stale enums, tables, policies, seed data, and migrations
that no longer describe the product. A fresh project gives us a clean production
shape while keeping the old project available as a short-term backup.

The existing `supabase/migrations/` chain remains untouched for now. The V2
baseline lives under `supabase/v2/` until we are ready to point a fresh Supabase
project at it or replace the legacy migration chain.

## Seed Rules

Allowed seed data:

- One `organizations` row: Big Shoulders Restoration.
- The official BSR persona taxonomy.
- Connection registry rows used by the Settings UI.
- The default Arc agent connection row.
- Minimal default app settings required for a real empty workspace.

Not allowed:

- Fake companies.
- Fake contacts.
- Fake properties.
- Fake leads.
- Fake jobs.
- Fake outcomes.
- Fake campaigns.
- Fake approvals.
- Fake Arc chat history.
- Fake agent runs.
- Fake campaign results.

## V2 Table Groups

### Foundation

- `organizations`
- `app_settings`
- `connections`
- `agent_connections`
- `agent_api_tokens`
- `persona_definitions`

### CRM Core

- `companies`
- `contacts`
- `properties`
- `leads`
- `jobs`
- `outcomes`

The CRM tables keep the current app-facing column names, including `persona`
strings, so existing pages can reconnect without a full rewrite. They also gain
`org_id` and default to the BSR organization for the first deployment.

### CRM Activity

- `crm_notes`
- `crm_tasks`
- `crm_activities`
- `engagement_events`

This is the activity and follow-up layer for human operators and Arc.

### Campaigns And Review

- `campaigns`
- `campaign_assets`
- `campaign_events`
- `campaign_results`
- `approval_items`
- `approval_decisions`
- `approval_recommendations`

Approvals remain stateful backend records. Approval never means dispatch by
itself.

### Arc And Agent Operations

- `agents`
- `agent_tasks`
- `agent_task_inputs`
- `agent_outputs`
- `agent_run_logs`
- `arc_conversations`
- `arc_messages`

These tables store visible agent work, messages, outputs, and audit metadata.

### Knowledge And Guardrails

- `persona_snapshots`
- `persona_knowledge_entries`
- `next_best_actions`
- `guardrail_rules`

These start empty except for persona definitions. They exist because the current
app has pages and APIs for persona intelligence, routing, and guardrail-backed
agent work.

### Vault

- `vault_notes`

The rebuilt app has a Vault surface. The table starts empty.

## Explicitly Deferred

These should not be in the baseline until a workflow proves the need:

- Self-serve signup.
- Billing/subscriptions.
- Per-customer admin consoles.
- Nurture sequences.
- Weather event targeting.
- Ad platform write actions.
- Partner referral token portals.
- Competitor intelligence storage.
- Full warehouse sync tables.
- Public dispatch workers.

## Security Model

- Every public table has RLS enabled.
- V2 grants are explicit because new Supabase projects may not expose new public
  tables to the Data API automatically.
- The app currently uses server-side service-role Supabase access in many places,
  so RLS is defense in depth for now. Tenant isolation in the current app is
  protected by defaulting and later explicit `org_id` scoping.
- No secrets are stored in settings or connection tables. Secrets stay in env
  vars or a later secret manager.

## Cutover Strategy

1. Create a new Supabase project for V2.
2. Apply `supabase/v2/migrations/20260612160000_v2_baseline.sql`.
3. Confirm only allowed seed rows exist.
4. Regenerate `src/lib/supabase/database.types.ts` from the V2 project.
5. Update local `.env.local` and deployment env vars to point at V2.
6. Reconnect and test app modules in this order: settings, CRM, campaigns,
   approvals, Arc, reports.

## Success Criteria

- Fresh database has no fake business records.
- App settings and connection status can render.
- CRM tables are empty and ready for real BSR records.
- Campaign and approval tables are empty and ready for operator-created work.
- Arc has no fake conversations but can create a real first thread.
- All product tables have an org boundary from day one.
