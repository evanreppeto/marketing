-- Add a one-time START gate for board tasks: when Arc should pick the task up.
-- This gates start time ONLY. It never authorizes outbound — outbound stays
-- behind human approval. The external runner (Arc) must only claim queued
-- tasks where scheduled_for is null or <= now().

alter table public.agent_tasks
  add column if not exists scheduled_for timestamptz;

comment on column public.agent_tasks.scheduled_for is
  'Optional one-time start gate. Arc only claims queued tasks where scheduled_for is null or <= now(). Gates start time only; never authorizes outbound.';

create index if not exists agent_tasks_scheduled_for_idx
  on public.agent_tasks (scheduled_for)
  where scheduled_for is not null;
