-- Scope workspace API tokens.
--
-- `agent_api_tokens` is the only per-workspace API credential we have, and it is
-- currently all-or-nothing: any valid token reaches the entire /api/v1/arc
-- surface (runs, messages, brand, research). That was fine while the only holder
-- was our own Arc runner.
--
-- It stops being fine the moment tenants hold one. Lead capture needs a
-- per-workspace token so a customer's website can post leads into THEIR
-- workspace (today `/api/v1/leads/ingest` takes a single shared env token that
-- carries no identity, so it can only ever serve one tenant). Handing that same
-- token to a customer's marketing server would also hand over full Arc agent
-- access — a leak on their website becomes a leak of Arc.
--
-- So tokens get scopes. NULL means "legacy, full access": every token issued
-- before this migration keeps working exactly as it does today, and the bearer
-- checks treat NULL/empty as unrestricted. New narrow tokens are issued with an
-- explicit scope array (e.g. '{leads:ingest}') and can do nothing else.

alter table public.agent_api_tokens
  add column if not exists scopes text[];

comment on column public.agent_api_tokens.scopes is
  'Allowed scopes (e.g. {leads:ingest}, {arc:full}). NULL/empty = legacy token, unrestricted.';

-- Bearer checks filter by token_hash then test scopes in app code; the hash
-- lookup is already the selective one, so no new index is needed.
