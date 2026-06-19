-- Service-role-only wrappers for Supabase Vault.
-- The app server talks to Supabase through PostgREST, which does not expose the
-- vault schema in this project. These SECURITY DEFINER wrappers keep Vault
-- hidden while still letting the service-role server client store and read
-- Drive refresh tokens.

create extension if not exists supabase_vault with schema vault;

create or replace function public.arc_create_vault_secret(
  new_secret text,
  new_name text,
  new_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_id uuid;
begin
  select vault.create_secret(new_secret, new_name, new_description)
  into secret_id;

  return secret_id;
end;
$$;

create or replace function public.arc_read_vault_secret(secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = secret_id;
$$;

revoke all on function public.arc_create_vault_secret(text, text, text) from public;
revoke all on function public.arc_read_vault_secret(uuid) from public;
grant execute on function public.arc_create_vault_secret(text, text, text) to service_role;
grant execute on function public.arc_read_vault_secret(uuid) to service_role;
