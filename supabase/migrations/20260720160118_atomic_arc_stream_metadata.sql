-- Arc's live reasoning and tool steps arrive on independent requests. Updating
-- metadata from application-side read/modify/write cycles allows those requests
-- to overwrite one another. Keep each mutation in one database transaction so
-- PostgreSQL serializes concurrent writes against the current row value.

create or replace function public.arc_stream_message_reasoning(
  p_agent_task_id uuid,
  p_reasoning text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.arc_messages
    set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{reasoning}',
      to_jsonb(coalesce(p_reasoning, '')),
      true
    )
    where agent_task_id = p_agent_task_id
      and status = 'pending'
    returning 1
  )
  select exists(select 1 from updated);
$$;

create or replace function public.arc_append_message_step(
  p_agent_task_id uuid,
  p_label text,
  p_status text,
  p_at text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_metadata jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_replace_index integer;
begin
  if nullif(btrim(p_label), '') is null then
    raise exception 'p_label must not be empty';
  end if;
  if p_status not in ('running', 'done') then
    raise exception 'p_status must be running or done';
  end if;

  select id, coalesce(metadata, '{}'::jsonb)
  into v_message_id, v_metadata
  from public.arc_messages
  where agent_task_id = p_agent_task_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  v_steps := case
    when jsonb_typeof(v_metadata -> 'steps') = 'array' then v_metadata -> 'steps'
    else '[]'::jsonb
  end;
  v_step := jsonb_build_object(
    'label', btrim(p_label),
    'status', p_status,
    'at', coalesce(p_at, '')
  );

  if p_status = 'done' then
    select max((item.ordinality - 1)::integer)
    into v_replace_index
    from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
    where item.value ->> 'label' = btrim(p_label)
      and item.value ->> 'status' = 'running';
  end if;

  if v_replace_index is null then
    v_steps := v_steps || jsonb_build_array(v_step);
  else
    v_steps := jsonb_set(v_steps, array[v_replace_index::text], v_step, false);
  end if;

  update public.arc_messages
  set metadata = jsonb_set(v_metadata, '{steps}', v_steps, true)
  where id = v_message_id
    and status = 'pending';

  return found;
end;
$$;

-- These are internal runner operations. The browser never calls them directly;
-- the server's service-role client invokes them after its bearer/scope checks.
revoke execute on function public.arc_stream_message_reasoning(uuid, text) from public, anon, authenticated;
revoke execute on function public.arc_append_message_step(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.arc_stream_message_reasoning(uuid, text) to service_role;
grant execute on function public.arc_append_message_step(uuid, text, text, text) to service_role;
