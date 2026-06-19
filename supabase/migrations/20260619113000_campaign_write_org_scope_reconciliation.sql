-- Reconcile organization scope for campaign-adjacent write paths.
-- The app now stamps org_id on these rows; this migration makes the local
-- migration history match that contract and safely backfills existing data.

alter table public.campaigns
  add column if not exists org_id uuid;

update public.campaigns
set org_id = public.default_organization_id()
where org_id is null;

alter table public.campaigns
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.campaigns
  drop constraint if exists campaigns_org_id_fkey,
  add constraint campaigns_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists campaigns_org_updated_at_idx
  on public.campaigns(org_id, updated_at desc);

alter table public.campaign_assets
  add column if not exists org_id uuid;

update public.campaign_assets asset
set org_id = campaign.org_id
from public.campaigns campaign
where asset.org_id is null
  and campaign.id = asset.campaign_id;

update public.campaign_assets
set org_id = public.default_organization_id()
where org_id is null;

alter table public.campaign_assets
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.campaign_assets
  drop constraint if exists campaign_assets_org_id_fkey,
  add constraint campaign_assets_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists campaign_assets_org_campaign_idx
  on public.campaign_assets(org_id, campaign_id, updated_at desc);

alter table public.approval_items
  add column if not exists org_id uuid;

update public.approval_items item
set org_id = campaign.org_id
from public.campaigns campaign
where item.org_id is null
  and item.campaign_id = campaign.id;

update public.approval_items item
set org_id = asset.org_id
from public.campaign_assets asset
where item.org_id is null
  and item.campaign_asset_id = asset.id;

update public.approval_items
set org_id = public.default_organization_id()
where org_id is null;

alter table public.approval_items
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.approval_items
  drop constraint if exists approval_items_org_id_fkey,
  add constraint approval_items_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists approval_items_org_submitted_idx
  on public.approval_items(org_id, submitted_at desc);

alter table public.approval_decisions
  add column if not exists org_id uuid;

update public.approval_decisions decision
set org_id = item.org_id
from public.approval_items item
where decision.org_id is null
  and decision.approval_item_id = item.id;

update public.approval_decisions
set org_id = public.default_organization_id()
where org_id is null;

alter table public.approval_decisions
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.approval_decisions
  drop constraint if exists approval_decisions_org_id_fkey,
  add constraint approval_decisions_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists approval_decisions_org_decided_idx
  on public.approval_decisions(org_id, decided_at desc);

alter table public.approval_recommendations
  add column if not exists org_id uuid;

update public.approval_recommendations recommendation
set org_id = item.org_id
from public.approval_items item
where recommendation.org_id is null
  and recommendation.approval_item_id = item.id;

update public.approval_recommendations
set org_id = public.default_organization_id()
where org_id is null;

alter table public.approval_recommendations
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.approval_recommendations
  drop constraint if exists approval_recommendations_org_id_fkey,
  add constraint approval_recommendations_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists approval_recommendations_org_item_idx
  on public.approval_recommendations(org_id, approval_item_id, created_at desc);

alter table public.campaign_events
  add column if not exists org_id uuid;

update public.campaign_events event
set org_id = campaign.org_id
from public.campaigns campaign
where event.org_id is null
  and event.campaign_id = campaign.id;

update public.campaign_events
set org_id = public.default_organization_id()
where org_id is null;

alter table public.campaign_events
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.campaign_events
  drop constraint if exists campaign_events_org_id_fkey,
  add constraint campaign_events_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists campaign_events_org_occurred_idx
  on public.campaign_events(org_id, occurred_at desc);

alter table public.campaign_results
  add column if not exists org_id uuid;

update public.campaign_results result
set org_id = campaign.org_id
from public.campaigns campaign
where result.org_id is null
  and result.campaign_id = campaign.id;

update public.campaign_results
set org_id = public.default_organization_id()
where org_id is null;

alter table public.campaign_results
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.campaign_results
  drop constraint if exists campaign_results_org_id_fkey,
  add constraint campaign_results_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists campaign_results_org_campaign_idx
  on public.campaign_results(org_id, campaign_id, period_start desc);

alter table public.campaign_dispatches
  add column if not exists org_id uuid;

update public.campaign_dispatches dispatch
set org_id = campaign.org_id
from public.campaigns campaign
where dispatch.org_id is null
  and dispatch.campaign_id = campaign.id;

update public.campaign_dispatches
set org_id = public.default_organization_id()
where org_id is null;

alter table public.campaign_dispatches
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.campaign_dispatches
  drop constraint if exists campaign_dispatches_org_id_fkey,
  add constraint campaign_dispatches_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists campaign_dispatches_org_updated_idx
  on public.campaign_dispatches(org_id, updated_at desc);

alter table public.agent_outputs
  add column if not exists org_id uuid;

update public.agent_outputs output
set org_id = item.org_id
from public.approval_items item
where output.org_id is null
  and output.approval_item_id = item.id;

update public.agent_outputs output
set org_id = task.org_id
from public.agent_tasks task
where output.org_id is null
  and output.task_id = task.id;

update public.agent_outputs
set org_id = public.default_organization_id()
where org_id is null;

alter table public.agent_outputs
  alter column org_id set default public.default_organization_id(),
  alter column org_id set not null;

alter table public.agent_outputs
  drop constraint if exists agent_outputs_org_id_fkey,
  add constraint agent_outputs_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete restrict;

create index if not exists agent_outputs_org_created_idx
  on public.agent_outputs(org_id, created_at desc);
