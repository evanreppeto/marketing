-- Pin an explicit search_path on public.set_updated_at() to resolve the
-- function_search_path_mutable security advisor. The trigger body only calls
-- now() (in pg_catalog, which is always implicitly searched) and assigns
-- NEW.updated_at, so an empty search_path is safe and closes the warning without
-- changing behavior. It's defined once (20260527131500_initial_growth_engine_
-- schema.sql) and shared by every *_set_updated_at trigger.
--
-- NOTE: the advisor also flags public.default_organization_id(). That one is
-- deliberately left alone here — it predates the migrations as live-schema drift
-- (its CREATE is not in the repo), it is the org_id DEFAULT on nearly every
-- table, and hardening it safely requires its definition in hand. Handle it in a
-- dedicated change once the body is confirmed.

alter function public.set_updated_at() set search_path = '';
