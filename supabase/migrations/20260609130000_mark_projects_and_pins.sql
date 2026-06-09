-- Mark chat projects: group conversations, and pin conversations to the top.
-- The phase-1 projects code (src/lib/mark-chat/persistence.ts) already reads
-- mark_projects and mark_conversations.project_id, but no migration ever created
-- them — in some environments the table was hand-created (schema drift), in others
-- it doesn't exist at all. This migration is written idempotently (IF [NOT] EXISTS)
-- so it reconciles both cases and only adds what's missing (notably pinned_at).
-- Reuses the shared set_updated_at() trigger function from earlier migrations.

create table if not exists public.mark_projects (
  id uuid primary key default gen_random_uuid(),
  operator text not null default 'Operator' check (length(btrim(operator)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists mark_projects_operator_idx on public.mark_projects(operator, created_at);

alter table public.mark_projects enable row level security;

drop trigger if exists mark_projects_set_updated_at on public.mark_projects;
create trigger mark_projects_set_updated_at
before update on public.mark_projects
for each row execute function public.set_updated_at();

-- Deleting a project orphans its chats (they fall back to "Chats"), never deletes them.
alter table public.mark_conversations
  add column if not exists project_id uuid references public.mark_projects(id) on delete set null;

-- Pin a conversation to the top of the list.
alter table public.mark_conversations
  add column if not exists pinned_at timestamptz;

create index if not exists mark_conversations_pin_idx
  on public.mark_conversations(operator, pinned_at desc nulls last, last_message_at desc);
