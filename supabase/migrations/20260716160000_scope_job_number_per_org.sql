-- Scope the jobs natural key to the owning org.
--
-- WHY: `unique (job_number)` on a table that also carries org_id declares one
-- job-number namespace shared by every tenant. But job_number is a per-company
-- business identifier -- BSR's "JOB-1001" and another tenant's "JOB-1001" are
-- two unrelated jobs that both legitimately exist. Today the second tenant to
-- write JOB-1001 is rejected by a constraint with no business reason to span
-- orgs, so onboarding a tenant whose numbering happens to overlap an existing
-- one fails on insert -- and fails citing a row that tenant is not allowed to
-- know exists.
--
-- Same shape as agents.key and guardrail_rules.rule_key (see
-- 20260716150000_scope_agent_keys_per_org.sql). It differs in the one way that
-- matters: jobs has no upsert. The only writer is a plain insert
-- (src/lib/crm/create.ts), so there is no conflict target that has to move in
-- lockstep with the index, and no silent cross-tenant UPDATE to unwind. The
-- current failure mode is loud and merely wrong, not quiet and destructive,
-- which is why the constraint can move on its own here.
--
-- SAFETY: the new constraint is strictly weaker than the one it replaces --
-- (org_id, job_number) admits every row (job_number) admitted, because values
-- distinct across the whole table are still distinct within any one org. The
-- index therefore builds cleanly and no existing row can be rejected. That also
-- makes a duplicate pre-scan vacuous rather than merely unnecessary: while
-- jobs_job_number_key is in force, a cross-org duplicate CANNOT exist to find.
-- org_id is already NOT NULL (and, unlike the 32 columns in
-- 20260716140000_drop_bsr_org_default.sql, carries no default), so no row
-- escapes the composite through a null half. NULL job_numbers would stay
-- unconstrained under both constraints (the default NULLS DISTINCT); prod and
-- staging happen to have none today. No foreign key references
-- jobs_job_number_key, so the DROP cannot cascade.
--
-- Verified against prod (qqbecyrhnowmooyjiztz) and staging
-- (zheuujpxsxmisnrlsriv) immediately before authoring: both carry exactly
-- `jobs_job_number_key UNIQUE (job_number)` under that name -- so the unguarded
-- DROP below resolves -- with 0 duplicates on either (job_number) or
-- (org_id, job_number), 0 null job_numbers, and jobs in only ONE org. That last
-- number is the real story: the collision this fixes has never been hit because
-- no second tenant has ever written a job. This is a fix for the tenant that
-- has not onboarded yet, which is exactly when it is cheap.
--
-- Proven on staging in BEGIN..ROLLBACK against the 56 live rows: a second org
-- writing an existing job_number was REJECTED before, ACCEPTED after, while a
-- same-org duplicate stayed REJECTED by the new constraint.
--
-- The DROP is unguarded on purpose (house style): if this constraint is not
-- present under this name, the assumption behind the migration is already
-- wrong, and it should fail here rather than leave the table silently
-- unconstrained.

alter table public.jobs drop constraint jobs_job_number_key;
alter table public.jobs add constraint jobs_org_id_job_number_key unique (org_id, job_number);

-- Ratchet: fail loudly if a single-column UNIQUE survives (or is later
-- reintroduced by copy-paste) on jobs. Primary keys are contype 'p' and are not
-- matched here -- this targets exactly the "global natural key" shape that made
-- org_id unenforceable in the first place.
do $$
declare
  offenders text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ' order by conname)
    into offenders
  from pg_constraint
  where contype = 'u'
    and conrelid = 'public.jobs'::regclass
    and array_length(conkey, 1) = 1;

  if offenders is not null then
    raise exception 'single-column UNIQUE still present, org_id is unenforceable: %', offenders;
  end if;
end
$$;
