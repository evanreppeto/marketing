-- Service-role-only wrappers for Supabase Vault.
-- The app server talks to Supabase through PostgREST, which does not expose the
-- vault schema in this project. These RPC wrappers keep Vault hidden while still
-- letting the service-role server client store and read Drive refresh tokens.

create extension if not exists supabase_vault with schema vault;

grant usage on schema vault to service_role;
grant execute on all functions in schema vault to service_role;
grant select on vault.decrypted_secrets to service_role;

create or replace function public.arc_create_vault_secret(
  new_secret text,
  new_name text,
  new_description text
)
returns uuid
language sql
security invoker
set search_path = public, vault
as $$
  select id
  from vault.create_secret(new_secret, new_name, new_description);
$$;

create or replace function public.arc_read_vault_secret(secret_id uuid)
returns text
language sql
security invoker
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = secret_id;
$$;

revoke all on function public.arc_create_vault_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.arc_read_vault_secret(uuid) from public, anon, authenticated;
grant execute on function public.arc_create_vault_secret(text, text, text) to service_role;
grant execute on function public.arc_read_vault_secret(uuid) to service_role;
