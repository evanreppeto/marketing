-- Task labels: a reusable, colored catalog plus card assignments.
-- workspace_id is nullable now (single-tenant) for multi-tenant readiness later.

create table public.task_labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  name text not null check (length(btrim(name)) > 0),
  color text not null,
  status text not null default 'active' check (status in ('active', 'proposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index task_labels_workspace_name_key
  on public.task_labels (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index task_labels_workspace_idx on public.task_labels (workspace_id);

create table public.agent_task_label_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  state text not null default 'applied' check (state in ('applied', 'suggested')),
  suggested_by text,
  created_at timestamptz not null default now(),
  unique (task_id, label_id)
);

create index agent_task_label_assignments_task_idx on public.agent_task_label_assignments (task_id);
create index agent_task_label_assignments_label_idx on public.agent_task_label_assignments (label_id);
