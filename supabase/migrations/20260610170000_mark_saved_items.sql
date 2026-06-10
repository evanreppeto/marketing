-- Mark "Saved" pinboard: operator-starred chat outputs (media, draft cards, angles),
-- plus a campaign link on conversations so an attached-campaign chat promotes there.

create table if not exists public.mark_saved_items (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  kind text not null check (kind in ('media','draft','angle')),
  title text,
  body text,
  media_url text,
  caption text,
  source_conversation_id uuid references public.mark_conversations(id) on delete set null,
  source_message_id uuid,
  source_campaign_id uuid,
  source_asset_id uuid,
  note text,
  promoted_campaign_id uuid,
  promoted_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mark_saved_items_operator_idx on public.mark_saved_items (operator, created_at desc);
create index if not exists mark_saved_items_kind_idx on public.mark_saved_items (kind);

alter table public.mark_conversations
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
