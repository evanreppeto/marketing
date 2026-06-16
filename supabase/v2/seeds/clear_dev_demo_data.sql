-- Remove optional V2 demo data inserted by `dev_demo_data.sql`.
-- This targets only rows tagged with `growth_engine_v2_demo` or the stable demo ids.

do $$
declare
  seed_source text := 'growth_engine_v2_demo';
begin
  delete from public.arc_conversations
  where id = '10000000-0000-4000-8000-000000000041'
    or exists (
      select 1
      from public.arc_messages m
      where m.conversation_id = arc_conversations.id
        and m.metadata ->> 'seed_source' = seed_source
    );

  delete from public.agent_tasks
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000032';

  delete from public.agent_outputs
  where structured_payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000034';

  delete from public.agent_run_logs
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000035';

  delete from public.agent_task_inputs
  where payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000033';

  delete from public.agents
  where metadata ->> 'seed_source' = seed_source
    or key = 'demo-strategy-agent';

  delete from public.crm_notes
  where id = '10000000-0000-4000-8000-000000000051';

  delete from public.crm_tasks
  where id = '10000000-0000-4000-8000-000000000052';

  delete from public.crm_activities
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000053';

  delete from public.engagement_events
  where payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000054';

  delete from public.persona_snapshots
  where reasoning_payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000055';

  delete from public.next_best_actions
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000056';

  delete from public.vault_notes
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000057';

  delete from public.campaigns
  where audit_payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000021';

  delete from public.leads
  where metadata ->> 'seed_source' = seed_source
    or id in (
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000013'
    );

  delete from public.outcomes
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000006';

  delete from public.jobs
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000005';

  delete from public.properties
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000003';

  delete from public.contacts
  where metadata ->> 'seed_source' = seed_source
    or id in (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000012'
    );

  delete from public.companies
  where metadata ->> 'seed_source' = seed_source
    or id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000011'
    );

  delete from public.campaign_results
  where raw_payload ->> 'seed_source' = seed_source
    or metrics ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000025';

  delete from public.approval_decisions
  where metadata ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000024';

  delete from public.approval_items
  where audit_payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000023';

  delete from public.campaign_assets
  where audit_payload ->> 'seed_source' = seed_source
    or id = '10000000-0000-4000-8000-000000000022';

  delete from public.campaign_events
  where payload ->> 'seed_source' = seed_source;
end $$;
