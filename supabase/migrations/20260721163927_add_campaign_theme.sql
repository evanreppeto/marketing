-- Campaigns were originally modeled around a restoration-only enum. Keep that
-- legacy column readable for existing integrations, but allow every industry to
-- store an honest, user-facing campaign theme going forward.
alter table public.campaigns
  add column if not exists campaign_theme text;

update public.campaigns
set campaign_theme = initcap(replace(restoration_focus::text, '_', ' '))
where campaign_theme is null
  and restoration_focus is not null;

alter table public.campaigns
  alter column restoration_focus drop not null;

alter table public.campaigns
  drop constraint if exists campaigns_campaign_theme_length;

alter table public.campaigns
  add constraint campaigns_campaign_theme_length
  check (
    campaign_theme is null
    or char_length(btrim(campaign_theme)) between 1 and 120
  );

comment on column public.campaigns.campaign_theme is
  'Industry-neutral campaign theme. Legacy restoration_focus remains nullable for backward compatibility.';
