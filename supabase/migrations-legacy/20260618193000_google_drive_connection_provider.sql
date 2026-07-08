-- Google Drive provider enum value for the Settings connections registry.
-- Kept separate so PostgreSQL can commit the enum value before later migrations
-- insert rows that use it.

do $$
begin
  if exists (select 1 from pg_type where typname = 'connection_provider') then
    alter type public.connection_provider add value if not exists 'google_drive';
  end if;
end $$;
