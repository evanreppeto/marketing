-- Arc chat projects: group conversations, and pin conversations to the top.
-- The phase-1 projects code (src/lib/arc-chat/persistence.ts) already reads
-- arc_projects and arc_conversations.project_id, but no migration ever created
-- them — in some environments the table was hand-created (schema drift), in others
-- it doesn't exist at all. This migration is written idempotently (IF [NOT] EXISTS)
-- so it reconciles both cases and only adds what's missing (notably pinned_at).
-- Reuses the shared set_updated_at() trigger function from earlier migrations.

create table if not exists public.arc_projects (
  id uuid primary key default gen_random_uuid(),
  operator text not null default 'Operator' check (length(btrim(operator)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists arc_projects_operator_idx on public.arc_projects(operator, created_at);

alter table public.arc_projects enable row level security;

drop trigger if exists arc_projects_set_updated_at on public.arc_projects;
create trigger arc_projects_set_updated_at
before update on public.arc_projects
for each row execute function public.set_updated_at();

-- Deleting a project orphans its chats (they fall back to "Chats"), never deletes them.
alter table public.arc_conversations
  add column if not exists project_id uuid references public.arc_projects(id) on delete set null;

-- Pin a conversation to the top of the list.
alter table public.arc_conversations
  add column if not exists pinned_at timestamptz;

create index if not exists arc_conversations_pin_idx
  on public.arc_conversations(operator, pinned_at desc nulls last, last_message_at desc);
