-- Last-touch attribution: stamp each lead with the campaign/asset/channel that
-- produced it, captured at ingest. Nullable + on-delete-set-null so attribution is
-- additive and a deleted campaign never breaks lead integrity.
--
-- UPGRADE PATH (multi-touch, future): introduce a `lead_touches` table
-- (lead_id, campaign_id, asset_id, channel, touched_at, method) recording every
-- touch. These columns remain the denormalized last-touch fast path / fallback.

alter table public.leads
  add column if not exists attributed_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists attributed_asset_id uuid references public.campaign_assets(id) on delete set null,
  add column if not exists attribution_channel text,
  add column if not exists attribution_method text,
  add column if not exists attribution_utm jsonb not null default '{}'::jsonb;

create index if not exists leads_attributed_campaign_idx on public.leads (attributed_campaign_id);
