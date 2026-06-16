-- Operator edits from the Arc Work Canvas v2. Body edits live in edited_body;
-- structured fields (subject/headline/cta/primary_text) live in edited_fields so
-- Arc's original draft_body + prompt_inputs stay pristine. Outbound stays locked.
alter table public.campaign_assets
  add column if not exists edited_fields jsonb not null default '{}'::jsonb;

comment on column public.campaign_assets.edited_fields is
  'Operator-edited structured fields (subject/headline/cta/primary_text) from the Arc Work Canvas.';

-- Audit-trail event for an in-canvas edit.
alter type public.campaign_event_type add value if not exists 'asset_edited';
