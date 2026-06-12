-- CRM tenancy + interaction layer.
-- 1) organizations + per-org isolation (org_id on the 6 CRM tables)
-- 2) record-attached interaction layer: notes, tasks, activity timeline
-- Isolation is enforced primarily in the app layer (service_role bypasses RLS);
-- RLS policies below are defense-in-depth for any future anon/authenticated access.

-- ---------- Organizations ----------
create type public.org_status as enum ('active', 'suspended', 'archived');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  status public.org_status not null default 'active',
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Seed the default tenant (Big Shoulders Restoration).
insert into public.organizations (name, slug)
values ('Big Shoulders Restoration', 'big-shoulders-restoration')
on conflict (slug) do nothing;

-- ---------- org_id on the 6 CRM tables (add nullable -> backfill -> not null) ----------
do $$
declare
  bsr_id uuid;
  tbl text;
begin
  select id into bsr_id from public.organizations where slug = 'big-shoulders-restoration';
  if bsr_id is null then
    raise exception 'organizations seed row not found; cannot backfill org_id';
  end if;
  foreach tbl in array array['companies','contacts','properties','leads','jobs','outcomes'] loop
    execute format('alter table public.%I add column org_id uuid references public.organizations(id);', tbl);
    execute format('update public.%I set org_id = %L where org_id is null;', tbl, bsr_id);
    execute format('alter table public.%I alter column org_id set not null;', tbl);
    execute format('create index %I on public.%I (org_id);', tbl || '_org_id_idx', tbl);
  end loop;
end $$;

-- ---------- Interaction enums ----------
create type public.crm_entity_type as enum (
  'company', 'contact', 'property', 'lead', 'job', 'outcome', 'campaign'
);
create type public.actor_kind as enum ('human', 'agent', 'system');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'canceled');
create type public.crm_activity_type as enum (
  'note_added', 'status_changed', 'call_logged', 'email_logged', 'sms_logged',
  'meeting_logged', 'task_created', 'task_completed', 'record_created',
  'record_updated', 'ai_recommendation', 'approval_requested', 'approval_decided',
  'converted', 'file_added'
);

-- ---------- crm_notes ----------
create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  body text not null check (length(btrim(body)) > 0),
  is_pinned boolean not null default false,
  is_internal boolean not null default false,
  author_kind public.actor_kind not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_notes_entity_idx on public.crm_notes (org_id, entity_type, entity_id, created_at desc);
create trigger crm_notes_set_updated_at
  before update on public.crm_notes
  for each row execute function public.set_updated_at();

-- ---------- crm_tasks ----------
create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type,
  entity_id uuid,
  title text not null check (length(btrim(title)) > 0),
  description text,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  assignee_kind public.actor_kind,
  assignee_name text,
  completed_at timestamptz,
  author_kind public.actor_kind not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_entity_pairing check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  )
);
create index crm_tasks_entity_idx on public.crm_tasks (org_id, entity_type, entity_id, due_at);
create index crm_tasks_status_idx on public.crm_tasks (org_id, status, due_at);
create trigger crm_tasks_set_updated_at
  before update on public.crm_tasks
  for each row execute function public.set_updated_at();

-- ---------- crm_activities ----------
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type public.crm_entity_type not null,
  entity_id uuid not null,
  activity_type public.crm_activity_type not null,
  summary text not null check (length(btrim(summary)) > 0),
  detail text,
  actor_kind public.actor_kind not null,
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index crm_activities_entity_idx on public.crm_activities (org_id, entity_type, entity_id, occurred_at desc);

-- ---------- RLS (defense-in-depth; service_role bypasses) ----------
alter table public.organizations enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_activities enable row level security;

create policy organizations_current_org on public.organizations
  for all to authenticated
  using (id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_notes_current_org on public.crm_notes
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_tasks_current_org on public.crm_tasks
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

create policy crm_activities_current_org on public.crm_activities
  for all to authenticated
  using (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- ---------- Grants (match existing data-API role grants) ----------
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.crm_notes to service_role;
grant select, insert, update, delete on public.crm_tasks to service_role;
grant select, insert, update, delete on public.crm_activities to service_role;
grant select on public.organizations, public.crm_notes, public.crm_tasks, public.crm_activities to anon, authenticated;
