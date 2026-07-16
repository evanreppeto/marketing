-- Journey tables: revoke the anon grants the database hands out by default.
--
-- 20260715130000 granted only service_role (CRUD) + authenticated (select) and its
-- comment claimed there were "NO anon grants". That claim was wrong. This database
-- carries default-privilege rules (pg_default_acl) that blanket-grant `anon` full
-- CRUD + TRUNCATE on EVERY new table in public — so journey_identities and
-- journey_touchpoints were created with anon holding SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE, exactly like `contacts` and every other public table. Not granting is
-- not the same as not granted.
--
-- This was never a live hole: RLS is enabled on both tables and neither has a
-- policy for anon, so anon reads return zero rows and anon writes are refused
-- (verified against prod as the anon role). RLS is the real gate here, database-wide.
--
-- But leaving the grants relies on RLS being perfect forever. These tables hold
-- visitor behavioural data, and a future permissive policy — or someone disabling
-- RLS while trusting that comment — would silently expose anonymous browsing
-- history and let anyone forge touchpoints. Nothing reaches these tables as anon
-- (the collector writes via service_role; the operator UI reads as authenticated),
-- so revoking costs nothing and makes the documented posture true.

revoke all on public.journey_identities from anon;
revoke all on public.journey_touchpoints from anon;
