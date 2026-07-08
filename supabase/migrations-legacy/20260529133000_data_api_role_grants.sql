-- Data API role grants for the standalone Arc Growth Engine schema.
-- RLS remains enabled on all public tables; these grants only make the tables
-- addressable by the API roles. Server-side code uses service_role.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep browser/client roles read-capable only until real auth policies are
-- designed. With RLS enabled and no permissive policies, this does not expose
-- rows by itself.
grant select on all tables in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;

alter default privileges in schema public
  grant select on tables to anon, authenticated;
