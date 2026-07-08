-- Precise campaign_event_type values so the audit trail records launch, deploy,
-- re-open, and operator directives exactly instead of reusing generic types.
--
-- Additive only and safe to apply any time. NOTE: ALTER TYPE ... ADD VALUE makes
-- the new label available; application code is only switched to emit these types
-- AFTER this migration is applied (using a new enum value in the same
-- transaction that adds it is not allowed in Postgres).

alter type public.campaign_event_type add value if not exists 'campaign_launched';
alter type public.campaign_event_type add value if not exists 'asset_deployed';
alter type public.campaign_event_type add value if not exists 'reopened';
alter type public.campaign_event_type add value if not exists 'operator_directive';
