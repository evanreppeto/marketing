-- Broadcast agent_tasks inserts over Supabase Realtime so the Mark/Hermes runner
-- can receive queued chat tasks instantly (outbound socket) instead of via an
-- inbound webhook tunnel. INSERT events carry the full new row under default
-- replica identity, so no replica-identity change is required.
--
-- Idempotent: only adds the table if it isn't already published. RLS must remain
-- enabled on agent_tasks (verified in pre-flight) so non-service-role subscribers
-- receive nothing without an explicit policy.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.agent_tasks';
  end if;
end
$$;
