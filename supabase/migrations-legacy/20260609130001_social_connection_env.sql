-- Set the display env_var for the social connection rows. Status/presence is computed
-- from the registry's requiredEnvVars in the read-model, NOT this single column — this
-- only gives the Settings UI a non-null primary var to show. Additive: do not edit the
-- shipped 20260609120000_connections.sql.

update public.connections set env_var = 'META_PAGE_ACCESS_TOKEN' where provider in ('facebook', 'instagram');
update public.connections set env_var = 'LINKEDIN_ACCESS_TOKEN'  where provider = 'linkedin';
update public.connections set env_var = 'X_API_KEY'              where provider = 'x';
