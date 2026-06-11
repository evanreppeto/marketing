alter table public.agent_tasks
  add column if not exists description text,
  add column if not exists owner_kind text not null default 'human'
    check (owner_kind in ('human', 'agent', 'system')),
  add column if not exists owner_label text not null default 'Operator'
    check (length(btrim(owner_label)) > 0),
  add column if not exists driver_kind text not null default 'agent'
    check (driver_kind in ('human', 'agent', 'system')),
  add column if not exists driver_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists driver_label text not null default 'Mark'
    check (length(btrim(driver_label)) > 0),
  add column if not exists approver_label text not null default 'Owner'
    check (length(btrim(approver_label)) > 0);

create table if not exists public.agent_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('human', 'agent', 'system', 'approval')),
  actor_label text not null check (length(btrim(actor_label)) > 0),
  event_type text not null check (
    event_type in (
      'comment',
      'instruction',
      'property_changed',
      'status_changed',
      'output_created',
      'approval_event',
      'system_event'
    )
  ),
  title text not null check (length(btrim(title)) > 0),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_tasks_owner_kind_idx on public.agent_tasks(owner_kind);
create index if not exists agent_tasks_driver_kind_idx on public.agent_tasks(driver_kind);
create index if not exists agent_tasks_driver_agent_id_idx on public.agent_tasks(driver_agent_id);
create index if not exists agent_task_events_task_id_created_at_idx
  on public.agent_task_events(task_id, created_at desc);
create index if not exists agent_task_events_type_idx on public.agent_task_events(event_type);

alter table public.agent_task_events enable row level security;
