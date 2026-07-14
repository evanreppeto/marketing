-- Per-org persona taxonomy: unlock the persona vocabulary from BSR.
--
-- The `persona_mapping` enum hard-locked every record's persona to Big Shoulders
-- Restoration's 12 values, so a new tenant literally could not tag a lead with
-- its own persona. This migration converts every persona column to `text` so the
-- valid set becomes per-org data (the org's `personas.slug` rows), and adds a
-- soft-delete flag so personas can be archived without losing tagged records.
--
-- `unassigned_persona` stays a reserved sentinel: it remains the default for the
-- CRM object tables and the not-unassigned checks are re-created as text checks.
-- Existing enum values survive the conversion verbatim (no backfill needed).

-- 1. Drop the enum-literal defaults (they can't auto-cast to text). ------------
alter table public.companies  alter column persona drop default;
alter table public.contacts   alter column persona drop default;
alter table public.properties alter column persona drop default;
alter table public.jobs       alter column persona drop default;
alter table public.outcomes   alter column persona drop default;

-- 2. Drop the not-unassigned checks (they reference the enum literal).
--    `if exists` keeps this idempotent across a fresh repo DB and an already
--    text-converted (drifted) database like marketing-staging.
alter table public.leads                    drop constraint if exists leads_persona_not_unassigned_check;
alter table public.partner_health_snapshots drop constraint if exists partner_health_snapshots_persona_not_unassigned_check;
alter table public.persona_snapshots        drop constraint if exists persona_snapshots_persona_not_unassigned_check;
alter table public.nurture_sequences        drop constraint if exists nurture_sequences_persona_not_unassigned_check;
alter table public.persona_knowledge_entries drop constraint if exists persona_knowledge_persona_not_unassigned_check;
alter table public.knowledge_nodes          drop constraint if exists knowledge_nodes_persona_not_unassigned_check;
alter table public.campaign_audiences       drop constraint if exists campaign_audiences_persona_not_unassigned_check;
alter table public.personalization_rules    drop constraint if exists personalization_rules_persona_not_unassigned_check;
alter table public.visitor_persona_contexts drop constraint if exists visitor_persona_not_unassigned_check;
alter table public.campaigns                drop constraint if exists campaigns_persona_not_unassigned_check;

-- 3. Convert every persona column enum -> text (indexes auto-rebuild). ---------
alter table public.campaign_audiences        alter column persona type text using persona::text;
alter table public.campaigns                  alter column persona type text using persona::text;
alter table public.companies                  alter column persona type text using persona::text;
alter table public.contacts                   alter column persona type text using persona::text;
alter table public.jobs                       alter column persona type text using persona::text;
alter table public.knowledge_nodes            alter column persona type text using persona::text;
alter table public.leads                      alter column persona type text using persona::text;
alter table public.nurture_sequences          alter column persona type text using persona::text;
alter table public.outcomes                   alter column persona type text using persona::text;
alter table public.partner_health_snapshots   alter column persona type text using persona::text;
alter table public.persona_knowledge_entries  alter column persona type text using persona::text;
alter table public.persona_snapshots          alter column persona type text using persona::text;
alter table public.personalization_rules      alter column persona type text using persona::text;
alter table public.properties                 alter column persona type text using persona::text;
alter table public.visitor_persona_contexts   alter column inferred_persona type text using inferred_persona::text;

-- 4. Re-add the text default for the CRM object tables. -----------------------
alter table public.companies  alter column persona set default 'unassigned_persona';
alter table public.contacts   alter column persona set default 'unassigned_persona';
alter table public.properties alter column persona set default 'unassigned_persona';
alter table public.jobs       alter column persona set default 'unassigned_persona';
alter table public.outcomes   alter column persona set default 'unassigned_persona';

-- 5. Re-create the not-unassigned checks as text checks. ----------------------
alter table public.leads                    add constraint leads_persona_not_unassigned_check                    check (persona <> 'unassigned_persona');
alter table public.partner_health_snapshots add constraint partner_health_snapshots_persona_not_unassigned_check check (persona <> 'unassigned_persona');
alter table public.persona_snapshots        add constraint persona_snapshots_persona_not_unassigned_check        check (persona <> 'unassigned_persona');
alter table public.nurture_sequences        add constraint nurture_sequences_persona_not_unassigned_check        check (persona <> 'unassigned_persona');
alter table public.persona_knowledge_entries add constraint persona_knowledge_persona_not_unassigned_check       check (persona <> 'unassigned_persona');
alter table public.knowledge_nodes          add constraint knowledge_nodes_persona_not_unassigned_check          check (persona is null or persona <> 'unassigned_persona');
alter table public.campaign_audiences       add constraint campaign_audiences_persona_not_unassigned_check       check (persona <> 'unassigned_persona');
alter table public.personalization_rules    add constraint personalization_rules_persona_not_unassigned_check    check (persona <> 'unassigned_persona');
alter table public.visitor_persona_contexts add constraint visitor_persona_not_unassigned_check                  check (inferred_persona is null or inferred_persona <> 'unassigned_persona');
alter table public.campaigns                add constraint campaigns_persona_not_unassigned_check                 check (persona <> 'unassigned_persona');

-- 6. Soft-delete flag for the per-org persona roster. -------------------------
alter table public.personas add column if not exists is_active boolean not null default true;
create index if not exists personas_org_active_idx on public.personas (org_id) where is_active;

-- 7. Retire the now-unused enum type (no columns/functions reference it).
--    `if exists` so it's a no-op on databases already converted to text.
drop type if exists public.persona_mapping;
