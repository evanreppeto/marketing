-- Rename the old Mark/Hermes-era agent schema to Arc.
-- New installs already create the arc_* tables directly. This bridge keeps
-- existing Supabase projects moving forward if the old table names were already
-- applied.

create or replace function pg_temp.rename_table_if_only_old_exists(old_name text, new_name text)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || new_name) is null
     and to_regclass('public.' || old_name) is not null then
    execute format('alter table public.%I rename to %I', old_name, new_name);
  end if;
end;
$$;

create or replace function pg_temp.rename_index_if_exists(old_name text, new_name text)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || old_name) is not null
     and to_regclass('public.' || new_name) is null then
    execute format('alter index public.%I rename to %I', old_name, new_name);
  end if;
end;
$$;

create or replace function pg_temp.rename_trigger_if_exists(table_name text, old_name text, new_name text)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1
    from pg_trigger trigger
    join pg_class rel on rel.oid = trigger.tgrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = table_name
      and trigger.tgname = old_name
      and not trigger.tgisinternal
  ) and not exists (
    select 1
    from pg_trigger trigger
    join pg_class rel on rel.oid = trigger.tgrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = table_name
      and trigger.tgname = new_name
      and not trigger.tgisinternal
  ) then
    execute format('alter trigger %I on public.%I rename to %I', old_name, table_name, new_name);
  end if;
end;
$$;

create or replace function pg_temp.rename_constraint_if_exists(table_name text, old_name text, new_name text)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1
    from pg_constraint constraint_row
    join pg_class rel on rel.oid = constraint_row.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = table_name
      and constraint_row.conname = old_name
  ) and not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class rel on rel.oid = constraint_row.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = table_name
      and constraint_row.conname = new_name
  ) then
    execute format('alter table public.%I rename constraint %I to %I', table_name, old_name, new_name);
  end if;
end;
$$;

select pg_temp.rename_table_if_only_old_exists('mark_conversations', 'arc_conversations');
select pg_temp.rename_table_if_only_old_exists('mark_messages', 'arc_messages');
select pg_temp.rename_table_if_only_old_exists('mark_projects', 'arc_projects');
select pg_temp.rename_table_if_only_old_exists('mark_saved_items', 'arc_saved_items');

select pg_temp.rename_index_if_exists('mark_conversations_operator_idx', 'arc_conversations_operator_idx');
select pg_temp.rename_index_if_exists('mark_conversations_status_idx', 'arc_conversations_status_idx');
select pg_temp.rename_index_if_exists('mark_conversations_pin_idx', 'arc_conversations_pin_idx');
select pg_temp.rename_index_if_exists('mark_messages_conversation_idx', 'arc_messages_conversation_idx');
select pg_temp.rename_index_if_exists('mark_messages_agent_task_idx', 'arc_messages_agent_task_idx');
select pg_temp.rename_index_if_exists('mark_projects_operator_idx', 'arc_projects_operator_idx');
select pg_temp.rename_index_if_exists('mark_saved_items_operator_idx', 'arc_saved_items_operator_idx');
select pg_temp.rename_index_if_exists('mark_saved_items_kind_idx', 'arc_saved_items_kind_idx');

select pg_temp.rename_trigger_if_exists('arc_conversations', 'mark_conversations_set_updated_at', 'arc_conversations_set_updated_at');
select pg_temp.rename_trigger_if_exists('arc_projects', 'mark_projects_set_updated_at', 'arc_projects_set_updated_at');

select pg_temp.rename_constraint_if_exists('arc_conversations', 'mark_conversations_operator_check', 'arc_conversations_operator_check');
select pg_temp.rename_constraint_if_exists('arc_conversations', 'mark_conversations_title_check', 'arc_conversations_title_check');
select pg_temp.rename_constraint_if_exists('arc_conversations', 'mark_conversations_status_check', 'arc_conversations_status_check');
select pg_temp.rename_constraint_if_exists('arc_conversations', 'mark_conversations_project_id_fkey', 'arc_conversations_project_id_fkey');
select pg_temp.rename_constraint_if_exists('arc_conversations', 'mark_conversations_campaign_id_fkey', 'arc_conversations_campaign_id_fkey');
select pg_temp.rename_constraint_if_exists('arc_messages', 'mark_messages_conversation_id_fkey', 'arc_messages_conversation_id_fkey');
select pg_temp.rename_constraint_if_exists('arc_projects', 'mark_projects_operator_check', 'arc_projects_operator_check');
select pg_temp.rename_constraint_if_exists('arc_projects', 'mark_projects_name_check', 'arc_projects_name_check');
select pg_temp.rename_constraint_if_exists('arc_saved_items', 'mark_saved_items_kind_check', 'arc_saved_items_kind_check');
select pg_temp.rename_constraint_if_exists('arc_saved_items', 'mark_saved_items_source_conversation_id_fkey', 'arc_saved_items_source_conversation_id_fkey');

do $$
begin
  if to_regclass('public.arc_messages') is not null then
    alter table public.arc_messages drop constraint if exists mark_messages_role_check;
    alter table public.arc_messages drop constraint if exists arc_messages_role_check;
    update public.arc_messages
    set role = 'arc'
    where role in ('mark', 'hermes');
    alter table public.arc_messages
      add constraint arc_messages_role_check
      check (role in ('operator', 'arc', 'system'));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.agent_tasks') is not null then
    update public.agent_tasks
    set task_type = 'arc_chat_message'
    where task_type = 'mark_chat_message';

    update public.agent_tasks
    set source_type = 'arc_conversation'
    where source_type = 'mark_conversation';
  end if;

  if to_regclass('public.agent_task_inputs') is not null then
    update public.agent_task_inputs
    set source_table = 'arc_conversations'
    where source_table = 'mark_conversations';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.agents') is not null
     and exists (select 1 from public.agents where key in ('mark', 'hermes'))
     and not exists (select 1 from public.agents where key = 'arc') then
    update public.agents
    set key = 'arc',
        name = 'Arc',
        description = replace(replace(coalesce(description, ''), 'Hermes', 'Arc'), 'Mark', 'Arc')
    where key in ('mark', 'hermes');
  end if;

  if to_regclass('public.agent_connections') is not null then
    update public.agent_connections
    set agent_key = 'arc'
    where agent_key in ('mark', 'hermes');

    update public.agent_connections
    set display_name = 'Arc'
    where display_name in ('Mark', 'Hermes');
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.app_settings') is not null then
    update public.app_settings
    set key = 'arc_default_mode'
    where key = 'mark_default_mode'
      and not exists (select 1 from public.app_settings where key = 'arc_default_mode');

    update public.app_settings
    set key = 'arc_default_route'
    where key = 'mark_default_route'
      and not exists (select 1 from public.app_settings where key = 'arc_default_route');

    update public.app_settings
    set key = 'arc_webhook_enabled'
    where key = 'mark_webhook_enabled'
      and not exists (select 1 from public.app_settings where key = 'arc_webhook_enabled');

    delete from public.app_settings
    where key in ('mark_default_mode', 'mark_default_route', 'mark_webhook_enabled');
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.approval_recommendations') is not null then
    update public.approval_recommendations
    set agent = 'arc'
    where agent in ('mark', 'hermes');
  end if;

  if to_regclass('public.knowledge_nodes') is not null then
    update public.knowledge_nodes
    set created_by = 'arc'
    where created_by in ('mark', 'hermes');
  end if;

  if to_regclass('public.knowledge_edges') is not null then
    update public.knowledge_edges
    set created_by = 'arc'
    where created_by in ('mark', 'hermes');
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
    set id = 'arc-uploads',
        name = 'arc-uploads'
    where id = 'mark-uploads'
      and not exists (select 1 from storage.buckets where id = 'arc-uploads');
  end if;
end;
$$;
