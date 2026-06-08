-- Outbox: one durable dispatch record per launched deliverable, plus the
-- operator-driven status it moves through. The app records state and hands off;
-- it never sends. Outbound stays locked.
--
-- NOTE (tech debt): a richer, currently-unused `outbound_dispatches` table exists
-- (20260529120000_hermes_backend_foundation.sql) with per-contact granularity,
-- idempotency_key, provider/provider_message_id, and an approval-gate constraint.
-- This table is the deliberately simpler, deliverable-level model that the wired
-- Outbox uses today. If/when the Outbox needs per-recipient sends, idempotency, or
-- provider tracking, reconcile onto `outbound_dispatches` rather than growing this.

create type public.campaign_dispatch_status as enum (
  'queued',
  'scheduled',
  'sent',
  'delivered',
  'failed',
  'canceled'
);

-- Dispatch lifecycle events on the existing campaign audit enum.
alter type public.campaign_event_type add value if not exists 'dispatch_queued';
alter type public.campaign_event_type add value if not exists 'dispatch_sent';
alter type public.campaign_event_type add value if not exists 'dispatch_delivered';
alter type public.campaign_event_type add value if not exists 'dispatch_failed';
alter type public.campaign_event_type add value if not exists 'dispatch_canceled';

create table public.campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  channel text,
  status public.campaign_dispatch_status not null default 'queued',
  scheduled_for timestamptz,
  dispatched_at timestamptz,
  recipient_summary text,
  audience_count integer check (audience_count is null or audience_count >= 0),
  result_note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaign_dispatches_campaign_idx on public.campaign_dispatches (campaign_id);
create index campaign_dispatches_status_idx on public.campaign_dispatches (status);
