-- Exemplar skills — a workspace's own proven copy, rendered as a reusable SKILL.md.
--
-- Arc drafts, an operator approves, campaigns produce results; this table stores
-- the artifact that folds that record back into drafting. One row per
-- (workspace, asset type, persona) slice, replaced wholesale on regeneration.
--
-- Why its own table instead of the `arc_custom_skills` settings blob that holds
-- GitHub-imported skills: generated skills carry provenance. A reviewer has to be
-- able to ask "which assets taught Arc this, and how strong was the evidence?"
-- and get a real answer — that is the entire argument for a legible artifact over
-- an opaque embedding. Columns, not a JSON blob, so that stays queryable.
--
-- Writes go through the service-role client from a `requireOperator()`-gated
-- server action. RLS + app_private.is_org_member gate the authenticated UI reads;
-- deliberately no anon grants (see the DB RPC grant footgun).

create table if not exists public.arc_generated_skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- Stable per-slice key. Regenerating upserts on (org_id, key) rather than
  -- accumulating, so a workspace can never accrue ten stale versions of its voice.
  key text not null,
  name text not null,
  description text not null,
  -- Slash command, leading slash included. Unique per org so a generated skill
  -- cannot shadow another generated one.
  command text not null,
  -- Null means the slice spans every asset type / persona.
  asset_type text,
  persona text,
  -- Which evidence backed the ranking. Recorded because "these converted" and
  -- "a human approved these unedited" are different claims, and a reader who
  -- cannot tell them apart will over-trust the weaker one.
  evidence_tier text not null,
  -- The rendered SKILL.md, injected into the runner behind a read-only skill.
  instructions text not null,
  exemplar_count integer not null default 0,
  -- Provenance: the campaign_assets this was learned from, in rank order.
  source_asset_ids jsonb not null default '[]'::jsonb,
  counter_example_asset_ids jsonb not null default '[]'::jsonb,
  generated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint arc_generated_skills_tier_check
    check (evidence_tier in ('outcome', 'engagement', 'approval')),
  constraint arc_generated_skills_exemplar_count_check check (exemplar_count >= 0),
  constraint arc_generated_skills_org_key_uniq unique (org_id, key),
  constraint arc_generated_skills_org_command_uniq unique (org_id, command)
);

create index if not exists arc_generated_skills_org_idx
  on public.arc_generated_skills (org_id, generated_at desc);

alter table public.arc_generated_skills enable row level security;

create policy arc_generated_skills_org_member_select on public.arc_generated_skills
  as permissive for select to authenticated
  using ((select app_private.is_org_member(arc_generated_skills.org_id)));

grant select, insert, update, delete on public.arc_generated_skills to service_role;
grant select on public.arc_generated_skills to authenticated;
