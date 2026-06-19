-- Give authenticated workspace users read access to organization-scoped product
-- data through RLS. Credential-bearing connector/token tables intentionally stay
-- service-role-only until they have narrower, redacted views.

grant select on
  public.agent_outputs,
  public.agent_run_logs,
  public.agent_task_events,
  public.agent_task_inputs,
  public.agent_tasks,
  public.agents,
  public.app_settings,
  public.approval_decisions,
  public.approval_items,
  public.approval_recommendations,
  public.arc_conversations,
  public.arc_messages,
  public.arc_projects,
  public.arc_saved_items,
  public.business_profiles,
  public.campaign_assets,
  public.campaign_dispatches,
  public.campaign_events,
  public.campaign_results,
  public.campaigns,
  public.companies,
  public.connections,
  public.contacts,
  public.crm_activities,
  public.crm_notes,
  public.crm_tasks,
  public.engagement_events,
  public.events,
  public.guardrail_rules,
  public.integrity_findings,
  public.jobs,
  public.leads,
  public.media_assets,
  public.media_folders,
  public.next_best_actions,
  public.opportunities,
  public.outbound_dispatches,
  public.outcomes,
  public.persona_definitions,
  public.persona_knowledge_entries,
  public.persona_snapshots,
  public.properties,
  public.routing_decisions,
  public.vault_notes
to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'agent_outputs',
    'agent_run_logs',
    'agent_task_events',
    'agent_task_inputs',
    'agent_tasks',
    'agents',
    'app_settings',
    'approval_decisions',
    'approval_items',
    'approval_recommendations',
    'arc_conversations',
    'arc_messages',
    'arc_projects',
    'arc_saved_items',
    'business_profiles',
    'campaign_assets',
    'campaign_dispatches',
    'campaign_events',
    'campaign_results',
    'campaigns',
    'companies',
    'connections',
    'contacts',
    'crm_activities',
    'crm_notes',
    'crm_tasks',
    'engagement_events',
    'events',
    'guardrail_rules',
    'integrity_findings',
    'jobs',
    'leads',
    'media_assets',
    'media_folders',
    'next_best_actions',
    'opportunities',
    'outbound_dispatches',
    'outcomes',
    'persona_definitions',
    'persona_knowledge_entries',
    'persona_snapshots',
    'properties',
    'routing_decisions',
    'vault_notes'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_org_member_select', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select app_private.is_org_member(org_id)))',
      target_table || '_org_member_select',
      target_table
    );
  end loop;
end $$;
