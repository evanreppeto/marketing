-- Arc chat: durable multi-thread conversations between the operator and Arc
-- (the Arc agent). Operator messages also enqueue agent_tasks (see
-- src/lib/arc-chat/enqueue.ts); Arc replies arrive via POST /api/v1/arc/messages.
-- Outbound stays locked. RLS enabled; server code uses service_role.

create table public.arc_conversations (
  id uuid primary key default gen_random_uuid(),
  operator text not null default 'Operator' check (length(btrim(operator)) > 0),
  title text not null default 'New chat' check (length(btrim(title)) > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.arc_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.arc_conversations(id) on delete cascade,
  role text not null check (role in ('operator', 'arc', 'system')),
  body text not null default '',
  status text not null default 'sent' check (status in ('sent', 'pending', 'complete', 'failed')),
  agent_task_id uuid,
  mentions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index arc_conversations_operator_idx on public.arc_conversations(operator, last_message_at desc);
create index arc_conversations_status_idx on public.arc_conversations(status);
create index arc_messages_conversation_idx on public.arc_messages(conversation_id, created_at);
create index arc_messages_agent_task_idx on public.arc_messages(agent_task_id);

alter table public.arc_conversations enable row level security;
alter table public.arc_messages enable row level security;

create trigger arc_conversations_set_updated_at
before update on public.arc_conversations
for each row execute function public.set_updated_at();
