-- Enable Row Level Security on the task-label tables.
--
-- These two tables shipped in 20260610180000_task_labels.sql WITHOUT RLS, and a
-- Supabase security advisor flagged both as fully exposed to the anon and
-- authenticated roles used by the Supabase client libraries — anyone with the
-- anon key could read or modify every row.
--
-- Turning RLS on applies the default-deny to the anon/authenticated roles. The
-- service-role admin client (getSupabaseAdminClient) bypasses RLS, so the app's
-- persistence path — the only thing that ever touches these tables — is
-- unaffected. Both tables are currently unreferenced by app code and hold zero
-- rows, so this closes the exposure with no behavior change.
--
-- No org/workspace member policies are added here, on purpose. Like the
-- credential-bearing connector/token tables (which stay service-role-only per
-- 20260618185612_org_member_read_policies.sql), these remain service-role-only
-- until they're wired to the user-scoped client. Their tenancy story is also
-- still open: task_labels.workspace_id is nullable ("single-tenant now,
-- multi-tenant readiness later") and agent_task_label_assignments derives tenancy
-- through its task_id/label_id FKs rather than a direct org_id. Member policies
-- therefore belong in the follow-up that moves these onto human write paths,
-- alongside the other write-policy slices (see docs/TENANCY.md).

alter table public.task_labels enable row level security;                  -- idempotent
alter table public.agent_task_label_assignments enable row level security; -- idempotent
