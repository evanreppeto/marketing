-- Scope the agents / guardrail_rules natural keys to the owning org.
--
-- WHY: `unique (key)` on a table that also carries org_id is a contradiction in
-- terms. It declares one key namespace shared by every tenant, which makes
-- org_id unenforceable by construction -- no value written to that column can
-- change who owns the key `arc`, because the index says only one row may hold
-- it, database-wide.
--
-- The sharp edge is the upsert. `upsert({key:'arc'}, {onConflict:'key'})`
-- resolves its conflict target against the GLOBAL index, so the moment a second
-- org exists, org B's upsert MATCHES ORG A'S ROW and UPDATEs it in place. That
-- is a cross-tenant write, and it is the quiet kind: no error, no constraint
-- violation, just B's agent definition landing on top of A's.
--
-- Adding org_id to the payload without re-scoping the index does not fix this
-- and is arguably worse. The conflict target picks the victim row BEFORE the
-- payload is applied, so the supplied org_id is simply written onto A's row --
-- silently reassigning A's agent to B, and taking every agent_tasks.agent_id FK
-- pointing at it along for the ride. Constraint and callers therefore have to
-- move as one unit; the callers moved in the same change (see the upserts in
-- src/lib/arc/orchestrator.ts, src/lib/campaigns/queue.ts, and
-- src/lib/competitor-intel/persistence.ts, which now pass org_id and target
-- (org_id, key)).
--
-- This also unblocks 20260716140000_drop_bsr_org_default.sql: with the BSR
-- default gone, those upserts must pass org_id or fail NOT NULL, and passing
-- org_id is only safe once the conflict target is per-org.
--
-- SAFETY: verified against prod immediately before authoring this. agents holds
-- 7 rows with 0 duplicates on either (key) or (org_id, key) and 0 null org_id;
-- guardrail_rules is empty. No foreign key references either unique constraint,
-- so the DROPs cannot cascade. Each new constraint is strictly weaker than the
-- one it replaces -- (org_id, key) admits every row (key) admitted -- so the
-- indexes build cleanly and no existing row is rejected.

alter table public.agents drop constraint agents_key_key;
alter table public.agents add constraint agents_org_id_key_key unique (org_id, key);

alter table public.guardrail_rules drop constraint guardrail_rules_rule_key_key;
alter table public.guardrail_rules add constraint guardrail_rules_org_id_rule_key_key unique (org_id, rule_key);

-- Ratchet: fail loudly if a single-column UNIQUE survives (or is reintroduced by
-- copy-paste) on either table. Primary keys are contype 'p' and are not matched
-- here -- this targets exactly the "global natural key" shape that made org_id
-- unenforceable in the first place.
do $$
declare
  offenders text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ' order by conname)
    into offenders
  from pg_constraint
  where contype = 'u'
    and conrelid in ('public.agents'::regclass, 'public.guardrail_rules'::regclass)
    and array_length(conkey, 1) = 1;

  if offenders is not null then
    raise exception 'single-column UNIQUE still present, org_id is unenforceable: %', offenders;
  end if;
end
$$;
