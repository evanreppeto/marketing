-- Opportunities are an OPEN, agent-proposed taxonomy. Arc proposes opportunities
-- of many kinds (crm_inactivity, reengagement, persona_gap, competitor_signal,
-- new_lead, …) against many subject types (a CRM entity, a persona key, a
-- competitor, a segment) whose stable id is NOT always a CRM uuid. The original
-- columns were typed too narrowly (kind = opportunity_kind enum with a single
-- value; subject_type = crm_entity_type; subject_id = uuid), so a perfectly valid
-- agent proposal failed as a late, opaque Postgres enum/uuid 502 at insert.
--
-- Convert these three columns to TEXT — the same pattern the marketing brain
-- already uses for knowledge_nodes.kind / knowledge_edges.relation, where an
-- agent-proposed label space is intentionally open and validated in the app
-- layer rather than pinned to a Postgres enum. status/urgency stay enums (a
-- closed lifecycle the app controls), so nothing about approval safety changes.
--
-- The dedup unique index (org_id, kind, subject_type, subject_id) and the inbox
-- index are rebuilt automatically by the column type change and keep working on
-- the text columns.

alter table public.opportunities
  alter column kind type text using kind::text;

alter table public.opportunities
  alter column subject_type type text using subject_type::text;

alter table public.opportunities
  alter column subject_id type text using subject_id::text;

-- The single-value opportunity_kind enum is now unused by any column. Drop it so
-- it can't be mistaken for the source of truth. (crm_entity_type is left intact —
-- it is still used by the CRM interactions/events tables.)
drop type if exists public.opportunity_kind;
