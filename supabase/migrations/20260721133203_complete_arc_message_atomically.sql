-- Final Arc replies must not replace the live metadata accumulated while a run
-- is pending. Reasoning and activity steps arrive on separate requests; merge
-- the canonical final payload into the row inside the same update that marks it
-- complete so the work receipt survives reconciliation.

create or replace function public.arc_complete_message(
  p_message_id uuid,
  p_body text,
  p_metadata jsonb default '{}'::jsonb,
  p_mentions jsonb default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.arc_messages
    set body = p_body,
        status = 'complete',
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        mentions = case when p_mentions is null then mentions else p_mentions end
    where id = p_message_id
      and status = 'pending'
    returning 1
  )
  select exists(select 1 from updated);
$$;

-- Internal runner operation. Browser roles never call it directly; the app's
-- service-role client invokes it after bearer-token and workspace checks.
revoke execute on function public.arc_complete_message(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.arc_complete_message(uuid, text, jsonb, jsonb) to service_role;
